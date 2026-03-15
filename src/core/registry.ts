import path from 'node:path';
import { getRepoTree, getFileContent } from './github.js';
import { Component, ComponentType, RepoSource, TargetIDE } from './types.js';

interface TreeItem {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

const COMPONENT_PATTERNS: Record<string, { type: ComponentType; targets: TargetIDE[] }> = {
  // Claude Code patterns
  'SKILL.md': { type: 'skill', targets: ['claude-code'] },
  'CLAUDE.md': { type: 'instruction', targets: ['claude-code'] },
  'claude.md': { type: 'instruction', targets: ['claude-code'] },
  // VSCode patterns
  '.vscode/snippets': { type: 'snippet', targets: ['vscode'] },
  'snippets.json': { type: 'snippet', targets: ['vscode'] },
  'keybindings.json': { type: 'snippet', targets: ['vscode'] },
  // Copilot patterns
  'copilot-instructions.md': { type: 'instruction', targets: ['copilot'] },
  'copilot-instructions': { type: 'instruction', targets: ['copilot'] },
  // General patterns
  'agent.md': { type: 'agent', targets: ['claude-code', 'opencode', 'copilot'] },
  'agent.yaml': { type: 'agent', targets: ['claude-code', 'opencode', 'copilot'] },
  'agent.yml': { type: 'agent', targets: ['claude-code', 'opencode', 'copilot'] },
  'prompt.md': { type: 'prompt', targets: ['claude-code', 'opencode', 'vscode', 'copilot'] },
  'instructions.md': { type: 'instruction', targets: ['claude-code', 'opencode', 'vscode', 'copilot'] },
};

const MARKDOWN_EXTENSIONS = ['.md', '.mdx'];
const CODE_EXTENSIONS = ['.json', '.yaml', '.yml', '.toml', '.ts', '.js', '.py'];

export async function discoverComponents(source: RepoSource): Promise<Component[]> {
  const tree = await getRepoTree(source);
  const components: Component[] = [];
  const seen = new Set<string>();

  // Group files by directory
  const dirMap = new Map<string, TreeItem[]>();
  for (const item of tree) {
    if (item.type === 'blob') {
      const dir = path.dirname(item.path);
      if (!dirMap.has(dir)) dirMap.set(dir, []);
      dirMap.get(dir)!.push(item);
    }
  }

  // Scan for known component patterns
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const fileName = path.basename(item.path);
    const dirName = path.dirname(item.path);

    for (const [pattern, meta] of Object.entries(COMPONENT_PATTERNS)) {
      if (fileName === pattern || item.path.includes(pattern)) {
        const key = `${dirName}:${meta.type}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const name = deriveComponentName(item.path, meta.type);
        const dirFiles = dirMap.get(dirName) || [];

        components.push({
          name,
          type: meta.type,
          description: `${capitalize(meta.type)} from ${dirName || 'root'}`,
          path: dirName,
          files: dirFiles.map(f => ({
            path: f.path,
            name: path.basename(f.path),
            size: f.size,
          })),
          source,
          compatibleTargets: meta.targets,
        });
        break;
      }
    }
  }

  // Also discover standalone markdown files in known directories
  const knownDirs = ['skills', 'agents', 'prompts', 'instructions', 'snippets', 'workflows'];
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const ext = path.extname(item.path).toLowerCase();
    const dirName = path.dirname(item.path);
    const topDir = item.path.split('/')[0]?.toLowerCase();

    if (MARKDOWN_EXTENSIONS.includes(ext) && knownDirs.includes(topDir)) {
      const key = `${item.path}:standalone`;
      if (seen.has(key)) continue;
      // Check it wasn't already found
      if (components.some(c => c.files.some(f => f.path === item.path))) continue;
      seen.add(key);

      const type = inferTypeFromDir(topDir);
      components.push({
        name: path.basename(item.path, ext),
        type,
        description: `${capitalize(type)} - ${path.basename(item.path)}`,
        path: item.path,
        files: [{ path: item.path, name: path.basename(item.path), size: item.size }],
        source,
        compatibleTargets: inferTargetsFromType(type),
      });
    }
  }

  // Enrich descriptions by reading the first few lines of main files
  await enrichDescriptions(components, source);

  return components;
}

async function enrichDescriptions(components: Component[], source: RepoSource): Promise<void> {
  const batchSize = 5;
  for (let i = 0; i < components.length; i += batchSize) {
    const batch = components.slice(i, i + batchSize);
    await Promise.all(batch.map(async (comp) => {
      try {
        const mainFile = comp.files.find(f =>
          f.name === 'SKILL.md' || f.name === 'README.md' ||
          f.name.endsWith('.md') || f.name === 'agent.yaml'
        ) || comp.files[0];

        if (!mainFile) return;
        const content = await getFileContent(source, mainFile.path);
        const desc = extractDescription(content);
        if (desc) comp.description = desc;

        // Also extract tags
        const tags = extractTags(content);
        if (tags.length > 0) comp.tags = tags;
      } catch {
        // Keep original description
      }
    }));
  }
}

function extractDescription(content: string): string | null {
  const lines = content.split('\n').filter(l => l.trim());
  // Skip frontmatter
  let start = 0;
  if (lines[0]?.startsWith('---')) {
    const end = lines.findIndex((l, i) => i > 0 && l.startsWith('---'));
    if (end > 0) start = end + 1;
  }
  // Find first non-heading, non-empty line
  for (let i = start; i < Math.min(lines.length, start + 10); i++) {
    const line = lines[i]?.trim();
    if (!line || line.startsWith('#') || line.startsWith('---')) continue;
    // Truncate to 100 chars
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

function deriveComponentName(filePath: string, type: ComponentType): string {
  const parts = filePath.split('/');
  // Use parent directory name if file is a known marker
  const fileName = parts[parts.length - 1];
  if (['SKILL.md', 'CLAUDE.md', 'agent.yaml', 'agent.yml', 'agent.md'].includes(fileName)) {
    return parts.length > 1 ? parts[parts.length - 2] : fileName;
  }
  return path.basename(fileName, path.extname(fileName));
}

function inferTypeFromDir(dir: string): ComponentType {
  const map: Record<string, ComponentType> = {
    skills: 'skill',
    agents: 'agent',
    prompts: 'prompt',
    instructions: 'instruction',
    snippets: 'snippet',
    workflows: 'workflow',
  };
  return map[dir] || 'unknown';
}

function inferTargetsFromType(type: ComponentType): TargetIDE[] {
  switch (type) {
    case 'skill': return ['claude-code'];
    case 'agent': return ['claude-code', 'opencode', 'copilot'];
    case 'prompt': return ['claude-code', 'opencode', 'vscode', 'copilot'];
    case 'instruction': return ['claude-code', 'opencode', 'vscode', 'copilot'];
    case 'snippet': return ['vscode'];
    case 'workflow': return ['claude-code', 'opencode'];
    default: return ['claude-code', 'opencode', 'vscode', 'copilot'];
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
