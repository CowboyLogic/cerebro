import path from 'node:path';
import { getRepoTree, getFileContent } from './github.js';
import { Component, ComponentType, ManifestComponent, RepoManifest, RepoSource, TargetIDE } from './types.js';
import { logger } from '../utils/logger.js';

interface TreeItem {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

// ── Manifest-based discovery ─────────────────────────────────────────────────

const MANIFEST_FILE = 'cerebro.json';

const VALID_TYPES = new Set<string>(['skill', 'agent', 'prompt', 'instruction', 'snippet', 'workflow', 'unknown']);
const VALID_TARGETS = new Set<string>(['claude-code', 'opencode', 'vscode', 'copilot']);

/**
 * Try to load and validate a cerebro.json manifest from the repo root.
 * Returns null on any failure (missing file, bad JSON, invalid structure).
 */
async function loadManifest(source: RepoSource): Promise<RepoManifest | null> {
  logger.debug(`loadManifest attempting  repo=${source.owner}/${source.repo}  file=${MANIFEST_FILE}`);
  try {
    const raw = await getFileContent(source, MANIFEST_FILE);
    const parsed: unknown = JSON.parse(raw);
    const manifest = validateManifest(parsed);
    if (manifest) {
      logger.debug(`loadManifest found  components=${manifest.components.length}`);
    } else {
      logger.warn(`loadManifest found but failed validation  repo=${source.owner}/${source.repo}`);
    }
    return manifest;
  } catch (err) {
    logger.debug(`loadManifest not found or invalid  repo=${source.owner}/${source.repo}  ${(err as Error).message}`);
    return null;
  }
}

function validateManifest(raw: unknown): RepoManifest | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.components)) return null;

  const components: ManifestComponent[] = [];

  for (const entry of obj.components as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const c = entry as Record<string, unknown>;

    if (typeof c.name !== 'string' || !c.name.trim()) continue;
    if (typeof c.type !== 'string' || !VALID_TYPES.has(c.type)) continue;
    if (!Array.isArray(c.files) || c.files.length === 0) continue;

    // Security: validate each file path — no traversal, no absolute paths
    const files: string[] = [];
    for (const f of c.files as unknown[]) {
      if (typeof f !== 'string' || !f.trim()) continue;
      const normalised = path.normalize(f);
      if (normalised.startsWith('..') || path.isAbsolute(normalised)) continue;
      files.push(normalised);
    }
    if (files.length === 0) continue;

    const targets: TargetIDE[] = Array.isArray(c.targets)
      ? (c.targets as string[]).filter(t => VALID_TARGETS.has(t)) as TargetIDE[]
      : inferTargetsFromType(c.type as ComponentType);

    const tags: string[] | undefined = Array.isArray(c.tags)
      ? (c.tags as unknown[])
          .filter((t): t is string => typeof t === 'string')
          .map(t => t.slice(0, 50))
      : undefined;

    components.push({
      name: sanitizeName(c.name as string),
      type: c.type as ComponentType,
      description: typeof c.description === 'string' ? c.description.slice(0, 200) : undefined,
      files,
      targets,
      tags,
    });
  }

  // Require at least one valid component
  if (components.length === 0) return null;

  return {
    cerebro: typeof obj.cerebro === 'string' ? obj.cerebro : '1',
    name: typeof obj.name === 'string' ? obj.name : undefined,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    components,
  };
}

function manifestToComponents(manifest: RepoManifest, source: RepoSource): Component[] {
  return manifest.components.map(c => ({
    name: c.name,
    type: c.type,
    description: c.description ?? `${capitalize(c.type)} from ${source.owner}/${source.repo}`,
    path: path.dirname(c.files[0]),
    files: c.files.map(f => ({ path: f, name: path.basename(f) })),
    source,
    compatibleTargets: c.targets,
    tags: c.tags,
  }));
}

// ── Heuristic discovery (fallback) ───────────────────────────────────────────

/**
 * Patterns that identify a DIRECTORY as one component.
 * Key = exact filename of the marker file.
 * When found, the entire containing directory is treated as a single component.
 */
const DIR_MARKER_PATTERNS: Record<string, { type: ComponentType; targets: TargetIDE[] }> = {
  'SKILL.md':        { type: 'skill',       targets: ['claude-code'] },
  'CLAUDE.md':       { type: 'instruction', targets: ['claude-code'] },
  'claude.md':       { type: 'instruction', targets: ['claude-code'] },
  'agent.md':        { type: 'agent',       targets: ['claude-code', 'opencode', 'copilot'] },
  'agent.yaml':      { type: 'agent',       targets: ['claude-code', 'opencode', 'copilot'] },
  'agent.yml':       { type: 'agent',       targets: ['claude-code', 'opencode', 'copilot'] },
  'prompt.md':       { type: 'prompt',      targets: ['claude-code', 'opencode', 'vscode', 'copilot'] },
  'instructions.md': { type: 'instruction', targets: ['claude-code', 'opencode', 'vscode', 'copilot'] },
  'copilot-instructions.md': { type: 'instruction', targets: ['copilot'] },
};

/**
 * Known top-level directories whose direct children are individual components
 * (one file = one component).  Files deeper than one level are ignored here.
 */
const FLAT_COLLECTION_DIRS: Record<string, ComponentType> = {
  skills:       'skill',
  agents:       'agent',
  prompts:      'prompt',
  instructions: 'instruction',
  snippets:     'snippet',
  workflows:    'workflow',
};

const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx']);
const CODE_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.toml', '.ts', '.js', '.py']);

/**
 * Component-type suffixes that repos append before the extension
 * (e.g. "code-review.agent.md" → display name "code-review").
 */
const TYPE_SUFFIXES = /\.(agent|instructions?|prompt|skill|snippet|workflow)$/i;

async function discoverHeuristic(source: RepoSource): Promise<Component[]> {
  const tree = await getRepoTree(source);
  const components: Component[] = [];
  const seen = new Set<string>();

  // Group blobs by their parent directory
  const dirMap = new Map<string, TreeItem[]>();
  for (const item of tree) {
    if (item.type === 'blob') {
      const dir = path.dirname(item.path);
      if (!dirMap.has(dir)) dirMap.set(dir, []);
      dirMap.get(dir)!.push(item);
    }
  }

  // ── Pass 1: directory-marker patterns ──────────────────────────────────────
  // A file named exactly SKILL.md / agent.yaml / etc. makes its parent dir
  // one component containing all files in that directory.
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const fileName = path.basename(item.path);
    const dirName = path.dirname(item.path);
    const meta = DIR_MARKER_PATTERNS[fileName];
    if (!meta) continue;

    const key = `dir:${dirName}:${meta.type}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const dirFiles = dirMap.get(dirName) ?? [];
    components.push({
      name: deriveComponentName(item.path, meta.type),
      type: meta.type,
      description: `${capitalize(meta.type)} from ${dirName || 'root'}`,
      path: dirName,
      files: dirFiles.map(f => ({ path: f.path, name: path.basename(f.path), size: f.size })),
      source,
      compatibleTargets: meta.targets,
    });
  }

  // ── Pass 2: flat collections ───────────────────────────────────────────────
  // Files that live directly inside a known top-level dir (e.g. agents/,
  // instructions/) are each their own component.  Deeper nesting is skipped
  // here — it's handled by pass 1 via marker files (e.g. skills/my-skill/SKILL.md).
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const parts = item.path.split('/');
    if (parts.length !== 2) continue; // must be exactly <dir>/<file>

    const topDir = parts[0].toLowerCase();
    const type = FLAT_COLLECTION_DIRS[topDir];
    if (!type) continue;

    const ext = path.extname(item.path).toLowerCase();
    if (!MARKDOWN_EXTENSIONS.has(ext) && !CODE_EXTENSIONS.has(ext)) continue;

    // Skip if already covered by a directory-marker component
    if (components.some(c => c.files.some(f => f.path === item.path))) continue;

    const key = `file:${item.path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const baseName = path.basename(item.path, ext).replace(TYPE_SUFFIXES, '');
    components.push({
      name: sanitizeName(baseName),
      type,
      description: `${capitalize(type)} - ${path.basename(item.path)}`,
      path: item.path,
      files: [{ path: item.path, name: path.basename(item.path), size: item.size }],
      source,
      compatibleTargets: inferTargetsFromType(type),
    });
  }

  // Enrich descriptions from file content
  await enrichDescriptions(components, source);
  return components;
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function discoverComponents(source: RepoSource): Promise<Component[]> {
  logger.info(`discoverComponents start  repo=${source.owner}/${source.repo}`);

  // Manifest-first: if the repo ships a cerebro.json, use it as authoritative.
  const manifest = await loadManifest(source);
  if (manifest) {
    logger.info(`discoverComponents strategy=manifest  components=${manifest.components.length}`);
    const components = manifestToComponents(manifest, source);
    await enrichDescriptions(components, source);
    logComponentSummary(source, components, 'manifest');
    return components;
  }

  // Fallback: heuristic tree-walking
  logger.info('discoverComponents strategy=heuristic  (no cerebro.json found)');
  const components = await discoverHeuristic(source);
  logComponentSummary(source, components, 'heuristic');
  return components;
}

function logComponentSummary(source: RepoSource, components: Component[], strategy: string): void {
  if (!logger.active) return;
  const byType: Record<string, number> = {};
  for (const c of components) {
    byType[c.type] = (byType[c.type] ?? 0) + 1;
  }
  logger.info(`discoverComponents done  repo=${source.owner}/${source.repo}  strategy=${strategy}  total=${components.length}`, byType);
}

// ── Shared helpers ────────────────────────────────────────────────────────────

async function enrichDescriptions(components: Component[], source: RepoSource): Promise<void> {
  const batchSize = 5;
  for (let i = 0; i < components.length; i += batchSize) {
    const batch = components.slice(i, i + batchSize);
    await Promise.all(batch.map(async (comp) => {
      let mainFilePath: string | undefined;
      try {
        const mainFile = comp.files.find(f =>
          f.name === 'SKILL.md' || f.name === 'README.md' ||
          f.name.endsWith('.md') || f.name === 'agent.yaml'
        ) ?? comp.files[0];
        if (!mainFile) return;
        mainFilePath = mainFile.path;
        const content = await getFileContent(source, mainFile.path);
        const desc = extractDescription(content);
        if (desc) comp.description = desc;
        const tags = extractTags(content);
        if (tags.length > 0) comp.tags = tags;
      } catch (err) {
        logger.debug(`enrichDescriptions failed  component=${comp.name}  file=${mainFilePath}  ${(err as Error).message}`);
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

/** Strip path traversal sequences and unsafe characters from a component name derived from repo paths. */
function sanitizeName(raw: string): string {
  const name = path.basename(raw)
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '')
    .replace(/[^\w\-_.]/g, '-')
    .replace(/^[.\-]+/, '')
    .slice(0, 100);
  return name || 'unknown';
}

function deriveComponentName(filePath: string, type: ComponentType): string {
  const parts = filePath.split('/');
  const fileName = parts[parts.length - 1];
  if (['SKILL.md', 'CLAUDE.md', 'agent.yaml', 'agent.yml', 'agent.md'].includes(fileName)) {
    const raw = parts.length > 1 ? parts[parts.length - 2] : fileName;
    return sanitizeName(raw);
  }
  return sanitizeName(path.basename(fileName, path.extname(fileName)));
}

function inferTypeFromDir(dir: string): ComponentType {
  return FLAT_COLLECTION_DIRS[dir] ?? 'unknown';
}

function inferTargetsFromType(type: ComponentType): TargetIDE[] {
  switch (type) {
    case 'skill':       return ['claude-code'];
    case 'agent':       return ['claude-code', 'opencode', 'copilot'];
    case 'prompt':      return ['claude-code', 'opencode', 'vscode', 'copilot'];
    case 'instruction': return ['claude-code', 'opencode', 'vscode', 'copilot'];
    case 'snippet':     return ['vscode'];
    case 'workflow':    return ['claude-code', 'opencode'];
    default:            return ['claude-code', 'opencode', 'vscode', 'copilot'];
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
