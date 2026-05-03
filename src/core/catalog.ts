/**
 * SPEC-0005 — Catalog
 *
 * Given a source repository, returns its installable artifacts.
 * Tries cerebro-catalog.yaml first; falls back to heuristic scanning.
 */

import { load as yamlLoad } from 'js-yaml';
import { validateCatalog } from '@cowboylogic/cerebro-schema/validate';
import type { Artifact, ArtifactType, CerebroCatalog } from '@cowboylogic/cerebro-schema';
import type { SourceProvider, RepoItem } from './provider.js';
import { FileNotFoundError } from './provider.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CatalogSource = 'catalog' | 'heuristic';

export interface CatalogResult {
  source: CatalogSource;
  artifacts: Artifact[];
}

export interface CatalogFilter {
  type?: ArtifactType;
  keyword?: string;
}

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'artifact';
}

/** CAT-REQ-0009 / CAT-REQ-0010: ensure unique, valid slugs */
function deduplicateSlugs(artifacts: Artifact[]): Artifact[] {
  const seen = new Map<string, number>();
  return artifacts.map((a) => {
    const base = a.id;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? a : { ...a, id: `${base}-${count + 1}` };
  });
}

function titleCase(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ---------------------------------------------------------------------------
// Heuristic scanner
// ---------------------------------------------------------------------------

/**
 * CAT-REQ-0006: skill detection — directory contains SKILL.md at root level.
 * CAT-REQ-0007: instruction detection — file matches *.instructions.md pattern.
 * CAT-REQ-0008: scan locations defined in spec.
 */
async function runHeuristicScan(
  provider: SourceProvider,
  owner: string,
  repo: string,
): Promise<Artifact[]> {
  const artifacts: Artifact[] = [];

  // CAT-REQ-0008: scan locations in order
  const rootItems = await safeListDirectory(provider, owner, repo, '');

  // 1. Scan root for instruction files and skill directories
  await scanForArtifacts(provider, owner, repo, rootItems, '', artifacts);

  // 2. Scan skills/ directory
  const skillsDir = rootItems.find((i) => i.name === 'skills' && i.type === 'dir');
  if (skillsDir) {
    const skillsItems = await safeListDirectory(provider, owner, repo, 'skills');
    await scanForArtifacts(provider, owner, repo, skillsItems, 'skills', artifacts);
  }

  // 3. Scan agents/ directory (skills may also live here per agentskills.io)
  const agentsDir = rootItems.find((i) => i.name === 'agents' && i.type === 'dir');
  if (agentsDir) {
    const agentsItems = await safeListDirectory(provider, owner, repo, 'agents');
    await scanForArtifacts(provider, owner, repo, agentsItems, 'agents', artifacts);
  }

  // 4. Scan instructions/ directory
  const instrDir = rootItems.find((i) => i.name === 'instructions' && i.type === 'dir');
  if (instrDir) {
    const instrItems = await safeListDirectory(provider, owner, repo, 'instructions');
    await scanForArtifacts(provider, owner, repo, instrItems, 'instructions', artifacts);
  }

  // 5. Scan .github/instructions/ (VS Code Copilot convention)
  const githubDir = rootItems.find((i) => i.name === '.github' && i.type === 'dir');
  if (githubDir) {
    const githubItems = await safeListDirectory(provider, owner, repo, '.github');
    const instrSubDir = githubItems.find((i) => i.name === 'instructions' && i.type === 'dir');
    if (instrSubDir) {
      const instrItems = await safeListDirectory(provider, owner, repo, '.github/instructions');
      await scanForArtifacts(provider, owner, repo, instrItems, '.github/instructions', artifacts);
    }
  }

  return deduplicateSlugs(artifacts);
}

async function scanForArtifacts(
  provider: SourceProvider,
  owner: string,
  repo: string,
  items: RepoItem[],
  parentPath: string,
  results: Artifact[],
): Promise<void> {
  for (const item of items) {
    if (item.type === 'file' && item.name.endsWith('.instructions.md')) {
      // CAT-REQ-0007: instruction artifact
      const stem = item.name.replace(/\.instructions\.md$/, '');
      const id = slugify(stem);
      results.push({
        id,
        name: titleCase(stem),
        type: 'instruction',
        source: item.path,
      });
    } else if (item.type === 'dir') {
      // CAT-REQ-0006: check for SKILL.md at directory root level
      const dirItems = await safeListDirectory(provider, owner, repo, item.path);
      const hasSkillMd = dirItems.some((c) => c.name === 'SKILL.md' && c.type === 'file');
      if (hasSkillMd) {
        const id = slugify(item.name);
        let description: string | undefined;
        try {
          const skillMdPath = `${item.path}/SKILL.md`;
          const content = await provider.fetchFileContent(owner, repo, skillMdPath);
          description = extractFirstContentLine(content) ?? undefined;
        } catch {
          // CAT-REQ-0014: unreadable — omit description
        }
        results.push({
          id,
          name: titleCase(item.name),
          type: 'skill',
          source: item.path,
          ...(description !== undefined ? { description } : {}),
        });
      }
    }
  }
}

async function safeListDirectory(
  provider: SourceProvider,
  owner: string,
  repo: string,
  dirPath: string,
): Promise<RepoItem[]> {
  try {
    return await provider.listDirectory(owner, repo, dirPath);
  } catch {
    return [];
  }
}

/** Extract `description:` field from YAML frontmatter (--- block) */
function extractFrontmatterDescription(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    const fm = yamlLoad(match[1]) as Record<string, unknown> | null;
    const desc = fm?.['description'];
    return typeof desc === 'string' ? desc : null;
  } catch {
    return null;
  }
}

/** First non-empty line after frontmatter */
function extractFirstContentLine(content: string): string | null {
  const withoutFm = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const lines = withoutFm.split('\n');
  for (const line of lines) {
    const trimmed = line.replace(/^#+\s*/, '').trim();
    if (trimmed) return trimmed;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * CAT-REQ-0001 through CAT-REQ-0014
 */
export async function fetchCatalog(
  provider: SourceProvider,
  owner: string,
  repo: string,
  filter?: CatalogFilter,
): Promise<CatalogResult> {
  let result: CatalogResult;

  // CAT-REQ-0001: try catalog file first
  try {
    const content = await provider.fetchFileContent(owner, repo, 'cerebro-catalog.yaml');
    let parsed: unknown;
    try {
      parsed = yamlLoad(content);
    } catch {
      // CAT-REQ-0005: invalid YAML → fall through to heuristic
      parsed = null;
    }

    if (parsed !== null) {
      // CAT-REQ-0002: validate with schema
      const validation = validateCatalog(parsed);
      if (validation.valid) {
        // CAT-REQ-0003: valid catalog — return it without heuristic scan
        result = {
          source: 'catalog',
          artifacts: (parsed as CerebroCatalog).artifacts,
        };
      } else {
        // CAT-REQ-0005: schema validation failed → fall through to heuristic
        result = await heuristicResult(provider, owner, repo);
      }
    } else {
      result = await heuristicResult(provider, owner, repo);
    }
  } catch (err) {
    // CAT-REQ-0004: file absent (FileNotFoundError) → heuristic fallback; all other errors propagate
    if (err instanceof FileNotFoundError) {
      result = await heuristicResult(provider, owner, repo);
    } else {
      throw err;
    }
  }

  // CAT-REQ-0011 / CAT-REQ-0012: apply filter
  return applyFilter(result, filter);
}

async function heuristicResult(
  provider: SourceProvider,
  owner: string,
  repo: string,
): Promise<CatalogResult> {
  const artifacts = await runHeuristicScan(provider, owner, repo);
  return { source: 'heuristic', artifacts };
}

/** CAT-REQ-0011 / CAT-REQ-0012 / CAT-REQ-0013 */
function applyFilter(result: CatalogResult, filter?: CatalogFilter): CatalogResult {
  if (!filter) return result;

  let { artifacts } = result;

  if (filter.type) {
    artifacts = artifacts.filter((a) => a.type === filter.type);
  }

  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    artifacts = artifacts.filter((a) => a.name.toLowerCase().includes(kw));
  }

  // CAT-REQ-0013: do NOT filter by artifact.supports here

  return { ...result, artifacts };
}
