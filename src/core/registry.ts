import path from 'node:path';
import yaml from 'js-yaml';
import { validateCatalog } from '@cowboylogic/cerebro-schema/validate';
import type { Artifact, ArtifactType, CompatibilityEntry, ArtifactFile, ToolId, CerebroCatalog } from './types.js';
import { getRepoTree, getFileContent } from './github.js';
import type { RepoSource } from './types.js';
import { logger } from '../utils/logger.js';

// ── Catalog-based discovery ───────────────────────────────────────────────────

const CATALOG_FILENAMES = ['cerebro-catalog.yaml', 'cerebro-catalog.yml'];

/**
 * Try to load and validate a cerebro-catalog.yaml from the repo root.
 * Returns null on any failure (missing file, invalid YAML, schema violation).
 */
async function loadCatalog(source: RepoSource): Promise<CerebroCatalog | null> {
  for (const filename of CATALOG_FILENAMES) {
    logger.debug(`loadCatalog attempting  repo=${source.owner}/${source.repo}  file=${filename}`);
    try {
      const raw = await getFileContent(source, filename);
      const parsed = yaml.load(raw);
      const result = validateCatalog(parsed);
      if (result.valid) {
        const catalog = parsed as CerebroCatalog;
        logger.debug(`loadCatalog found  artifacts=${catalog.artifacts.length}`);
        return catalog;
      }
      logger.warn(
        `loadCatalog "${filename}" failed validation  repo=${source.owner}/${source.repo}`,
        result.errors.map(e => `${e.path}: ${e.message}`).join(', ')
      );
    } catch (err) {
      logger.debug(`loadCatalog "${filename}" not found  repo=${source.owner}/${source.repo}  ${(err as Error).message}`);
    }
  }
  return null;
}

// ── Heuristic discovery (fallback) ───────────────────────────────────────────

interface TreeItem {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

/**
 * Marker files that identify a directory as a single artifact.
 * When found, the entire parent directory becomes one artifact.
 */
const DIR_MARKER_PATTERNS: Record<string, { type: ArtifactType; tools: ToolId[] }> = {
  'SKILL.md':        { type: 'skill',       tools: ['claude-code'] },
  'CLAUDE.md':       { type: 'instruction', tools: ['claude-code'] },
  'claude.md':       { type: 'instruction', tools: ['claude-code'] },
  'agent.md':        { type: 'agent',       tools: ['claude-code', 'opencode', 'copilot'] },
  'agent.yaml':      { type: 'agent',       tools: ['claude-code', 'opencode', 'copilot'] },
  'agent.yml':       { type: 'agent',       tools: ['claude-code', 'opencode', 'copilot'] },
  'prompt.md':       { type: 'prompt',      tools: ['claude-code', 'opencode', 'copilot'] },
  'instructions.md': { type: 'instruction', tools: ['claude-code', 'opencode', 'copilot'] },
  'copilot-instructions.md': { type: 'instruction', tools: ['copilot'] },
};

/**
 * Top-level directories whose direct file children are each one artifact.
 */
const FLAT_COLLECTION_DIRS: Record<string, ArtifactType> = {
  skills:       'skill',
  agents:       'agent',
  prompts:      'prompt',
  instructions: 'instruction',
  snippets:     'snippet',
  workflows:    'workflow',
};

const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx']);
const CODE_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.toml', '.ts', '.js', '.py']);
const TYPE_SUFFIXES = /\.(agent|instructions?|prompt|skill|snippet|workflow)$/i;

/** Infer which tools an artifact type supports when no catalog is present. */
function inferToolsFromType(type: ArtifactType): ToolId[] {
  switch (type) {
    case 'skill':       return ['claude-code'];
    case 'agent':       return ['claude-code', 'opencode', 'copilot'];
    case 'prompt':      return ['claude-code', 'opencode', 'copilot'];
    case 'instruction': return ['claude-code', 'opencode', 'copilot'];
    case 'snippet':     return ['copilot'];
    case 'workflow':    return ['claude-code', 'opencode'];
    case 'hook':        return ['claude-code'];
    case 'mcp-server':  return ['claude-code', 'opencode'];
    default:            return ['claude-code'];
  }
}

/**
 * Synthesize a default install target path for a heuristically-discovered file.
 * These defaults mirror the conventions used by each tool's community.
 */
function defaultTargetPath(tool: ToolId, type: ArtifactType, artifactName: string, fileName: string): string {
  switch (tool) {
    case 'claude-code':
      switch (type) {
        case 'skill':       return `.claude/skills/${artifactName}/${fileName}`;
        case 'agent':       return `.claude/agents/${fileName}`;
        case 'hook':        return `.claude/hooks/${fileName}`;
        case 'instruction': return `.claude/${fileName}`;
        default:            return `.claude/${type}s/${fileName}`;
      }
    case 'opencode':
      switch (type) {
        case 'skill':       return `.opencode/skills/${artifactName}/${fileName}`;
        case 'agent':       return `.opencode/agents/${fileName}`;
        case 'instruction': return `.opencode/${fileName}`;
        default:            return `.opencode/${type}s/${fileName}`;
      }
    case 'copilot':
      switch (type) {
        case 'instruction': return `.github/copilot-instructions.md`;
        case 'agent':       return `.github/copilot/agents/${artifactName}.md`;
        default:            return `.github/copilot/${fileName}`;
      }
    default:
      return `${tool}/${type}s/${fileName}`;
  }
}

/** Build synthesized compatibility entries for a heuristically-discovered artifact. */
function synthesizeCompatibility(
  name: string,
  type: ArtifactType,
  tools: ToolId[],
  filePaths: string[],
): CompatibilityEntry[] {
  return tools.map(tool => ({
    tool,
    scope: ['workspace', 'global'] as ['workspace', 'global'],
    files: filePaths.map((src): ArtifactFile => ({
      source: src,
      target: defaultTargetPath(tool, type, name, path.basename(src)),
    })),
  }));
}

/** Convert a display name into a valid lowercase slug for use as an artifact id. */
function toSlug(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug.length >= 2 ? slug : slug.padEnd(2, '0');
}

/** Strip unsafe characters from a display name. */
function sanitizeName(raw: string): string {
  const name = path.basename(raw)
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '')
    .replace(/[^\w\-_.]/g, '-')
    .replace(/^[.\-]+/, '')
    .slice(0, 100);
  return name || 'unknown';
}

function deriveArtifactName(filePath: string): string {
  const parts = filePath.split('/');
  const fileName = parts[parts.length - 1];
  if (['SKILL.md', 'CLAUDE.md', 'agent.yaml', 'agent.yml', 'agent.md'].includes(fileName)) {
    const raw = parts.length > 1 ? parts[parts.length - 2] : fileName;
    return sanitizeName(raw);
  }
  const ext = path.extname(fileName);
  return sanitizeName(path.basename(fileName, ext).replace(TYPE_SUFFIXES, ''));
}

async function discoverHeuristic(source: RepoSource): Promise<Artifact[]> {
  const tree = await getRepoTree(source);
  const artifacts: Artifact[] = [];
  const seen = new Set<string>();

  // Group blobs by parent directory
  const dirMap = new Map<string, TreeItem[]>();
  for (const item of tree) {
    if (item.type === 'blob') {
      const dir = path.dirname(item.path);
      if (!dirMap.has(dir)) dirMap.set(dir, []);
      dirMap.get(dir)!.push(item);
    }
  }

  // ── Pass 1: directory-marker patterns ──────────────────────────────────────
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const fileName = path.basename(item.path);
    const dirName = path.dirname(item.path);
    const meta = DIR_MARKER_PATTERNS[fileName];
    if (!meta) continue;

    const key = `dir:${dirName}:${meta.type}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const dirFiles = (dirMap.get(dirName) ?? []).map(f => f.path);
    const name = deriveArtifactName(item.path);
    artifacts.push({
      id: toSlug(name),
      name,
      description: `${capitalize(meta.type)} from ${dirName || 'root'}`,
      type: meta.type,
      compatibility: synthesizeCompatibility(name, meta.type, meta.tools, dirFiles),
      tags: [],
    });
  }

  // ── Pass 2: flat collections ───────────────────────────────────────────────
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const parts = item.path.split('/');
    if (parts.length !== 2) continue;

    const topDir = parts[0].toLowerCase();
    const type = FLAT_COLLECTION_DIRS[topDir];
    if (!type) continue;

    const ext = path.extname(item.path).toLowerCase();
    if (!MARKDOWN_EXTENSIONS.has(ext) && !CODE_EXTENSIONS.has(ext)) continue;

    if (artifacts.some(a => a.compatibility.some(c => c.files.some(f => f.source === item.path)))) continue;

    const key = `file:${item.path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const baseName = path.basename(item.path, path.extname(item.path)).replace(TYPE_SUFFIXES, '');
    const name = sanitizeName(baseName);
    const tools = inferToolsFromType(type);
    artifacts.push({
      id: toSlug(name),
      name,
      description: `${capitalize(type)} - ${path.basename(item.path)}`,
      type,
      compatibility: synthesizeCompatibility(name, type, tools, [item.path]),
      tags: [],
    });
  }

  await enrichDescriptions(artifacts, source);
  return artifacts;
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function discoverArtifacts(source: RepoSource): Promise<Artifact[]> {
  logger.info(`discoverArtifacts start  repo=${source.owner}/${source.repo}`);

  const catalog = await loadCatalog(source);
  if (catalog) {
    logger.info(`discoverArtifacts strategy=catalog  artifacts=${catalog.artifacts.length}`);
    logSummary(source, catalog.artifacts, 'catalog');
    return catalog.artifacts;
  }

  logger.info('discoverArtifacts strategy=heuristic  (no cerebro-catalog.yaml found)');
  const artifacts = await discoverHeuristic(source);
  logSummary(source, artifacts, 'heuristic');
  return artifacts;
}

// ── Description enrichment ────────────────────────────────────────────────────

async function enrichDescriptions(artifacts: Artifact[], source: RepoSource): Promise<void> {
  const batchSize = 5;
  for (let i = 0; i < artifacts.length; i += batchSize) {
    const batch = artifacts.slice(i, i + batchSize);
    await Promise.all(batch.map(async (artifact) => {
      const allSources = artifact.compatibility.flatMap(c => c.files.map(f => f.source));
      const mainFile = allSources.find(p =>
        p.endsWith('SKILL.md') || p.endsWith('README.md') ||
        p.endsWith('.md') || p.endsWith('agent.yaml')
      ) ?? allSources[0];

      if (!mainFile) return;
      try {
        const content = await getFileContent(source, mainFile);
        const desc = extractDescription(content);
        if (desc) (artifact as { description?: string }).description = desc;
        const tags = extractTags(content);
        if (tags.length > 0) (artifact as { tags?: string[] }).tags = tags;
      } catch (err) {
        logger.debug(`enrichDescriptions failed  artifact=${artifact.id}  file=${mainFile}  ${(err as Error).message}`);
      }
    }));
  }
}

function extractDescription(content: string): string | null {
  const lines = content.split('\n').filter(l => l.trim());
  let start = 0;
  if (lines[0]?.startsWith('---')) {
    const end = lines.findIndex((l, i) => i > 0 && l.startsWith('---'));
    if (end > 0) start = end + 1;
  }
  for (let i = start; i < Math.min(lines.length, start + 10); i++) {
    const line = lines[i]?.trim();
    if (!line || line.startsWith('#') || line.startsWith('---')) continue;
    return line.length > 100 ? line.slice(0, 97) + '...' : line;
  }
  return null;
}

function extractTags(content: string): string[] {
  const tagMatch = content.match(/tags?:\s*\[([^\]]+)\]/i);
  if (tagMatch) {
    return tagMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
  }
  return [];
}

function logSummary(source: RepoSource, artifacts: Artifact[], strategy: string): void {
  if (!logger.active) return;
  const byType: Record<string, number> = {};
  for (const a of artifacts) {
    byType[a.type] = (byType[a.type] ?? 0) + 1;
  }
  logger.info(
    `discoverArtifacts done  repo=${source.owner}/${source.repo}  strategy=${strategy}  total=${artifacts.length}`,
    byType
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
