/**
 * SPEC-0001 — Configuration Manager
 *
 * Manages ~/.config/cerebro/config.yaml.
 * On first run the file is created from bundled defaults.
 * On subsequent runs the user file is loaded and deep-merged with bundled
 * defaults so absent keys always resolve to the current defaults.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import type { ArtifactType, ToolId, Scope } from '@cowboylogic/cerebro-schema';

// ---------------------------------------------------------------------------
// Public types (exported as part of the SPEC-0001 interface)
// ---------------------------------------------------------------------------

export interface SourceEntry {
  name: string;
  url: string;
  enabled: boolean;
  trusted: boolean;
}

export interface TargetPathEntry {
  workspace: string;
  user: string;
}

export interface CerebroConfig {
  defaults: {
    target?: ToolId;
    scope?: Scope;
    ui?: {
      pageSize?: number;
    };
  };
  sources: SourceEntry[];
  targets: Partial<Record<ToolId, Partial<Record<ArtifactType, Partial<TargetPathEntry>>>>>;
}

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class ConfigParseError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(
      `Config file at ${filePath} could not be parsed. ` +
        'Please check for syntax errors or delete the file to reset to defaults.',
    );
    this.name = 'ConfigParseError';
    if (cause instanceof Error) this.cause = cause;
  }
}

export class ConfigWriteError extends Error {
  constructor(dirPath: string, cause: unknown) {
    super(`Unable to create config directory at ${dirPath}. Check directory permissions.`);
    this.name = 'ConfigWriteError';
    if (cause instanceof Error) this.cause = cause;
  }
}

export class SourceNotFoundError extends Error {
  constructor(url: string) {
    super(`Source not found: '${url}'`);
    this.name = 'SourceNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Bundled defaults
// ---------------------------------------------------------------------------

const BUNDLED_SOURCES: SourceEntry[] = [
  {
    name: 'anthropic-skills',
    url: 'https://github.com/anthropics/skills',
    enabled: true,
    trusted: false,
  },
  {
    name: 'awesome-copilot',
    url: 'https://github.com/github/awesome-copilot',
    enabled: true,
    trusted: false,
  },
];

/** Default install paths shipped with Cerebro. Only tools/types with MVP support are listed. */
const BUNDLED_PATHS: Partial<Record<ToolId, Partial<Record<ArtifactType, TargetPathEntry>>>> = {
  agents: {
    skill: { workspace: '.agents/skills', user: '~/.agents/skills' },
    instruction: { workspace: '.agents/prompts', user: '~/.agents/prompts' },
  },
  'claude-code': {
    skill: { workspace: '.claude/commands', user: '~/.claude/commands' },
    instruction: { workspace: '.claude/rules', user: '~/.claude/rules' },
  },
  copilot: {
    skill: { workspace: '.github/skills', user: '~/.copilot/skills' },
    instruction: { workspace: '.github/instructions', user: '~/.copilot/instructions' },
  },
};

const BUNDLED_DEFAULTS: CerebroConfig = {
  defaults: {},
  sources: BUNDLED_SOURCES,
  targets: {},
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function configPath(): string {
  return path.join(os.homedir(), '.config', 'cerebro', 'config.yaml');
}

/**
 * Deep-merge `defaults` with `override`. Override wins for all present keys.
 * Arrays are replaced (not merged). Absent keys fall back to defaults.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge<T extends object>(defaults: T, override: Partial<T>): T {
  const result = { ...defaults } as T;
  const resultRecord = result as Record<string, unknown>;
  const overrideRecord = override as Record<string, unknown>;

  for (const [key, value] of Object.entries(overrideRecord)) {
    const existing = resultRecord[key];

    if (
      isPlainObject(value) &&
      isPlainObject(existing)
    ) {
      resultRecord[key] = deepMerge(existing, value);
    } else if (value !== undefined) {
      resultRecord[key] = value;
    }
  }

  return result;
}

function expandTilde(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return path.resolve(p);
}

function atomicWrite(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** CFG-REQ-0002 / CFG-REQ-0004 */
export function loadConfig(): CerebroConfig {
  const cfgPath = configPath();

  if (!fs.existsSync(cfgPath)) {
    // CFG-REQ-0002: first run — create from bundled defaults
    const dir = path.dirname(cfgPath);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      throw new ConfigWriteError(dir, err);
    }
    atomicWrite(cfgPath, yamlDump(BUNDLED_DEFAULTS));
    return structuredClone(BUNDLED_DEFAULTS);
  }

  // CFG-REQ-0010: parse errors are fatal
  let raw: unknown;
  try {
    const content = fs.readFileSync(cfgPath, 'utf8');
    raw = yamlLoad(content);
  } catch (err) {
    throw new ConfigParseError(cfgPath, err);
  }

  if (raw === null || typeof raw !== 'object') {
    throw new ConfigParseError(cfgPath, new Error('Config file is empty or not a mapping'));
  }

  // CFG-REQ-0004: deep-merge user file with bundled defaults
  const userConfig = raw as Partial<CerebroConfig>;
  return deepMerge(BUNDLED_DEFAULTS, userConfig);
}

/** CFG-REQ-0011: atomic write */
export function saveConfig(config: CerebroConfig): void {
  const cfgPath = configPath();
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  atomicWrite(cfgPath, yamlDump(config));
}

/** CFG-REQ-0005 / CFG-REQ-0006 / CFG-REQ-0012 */
export function resolveInstallBase(
  config: CerebroConfig,
  tool: ToolId,
  type: ArtifactType,
  scope: Scope,
): string {
  // CFG-REQ-0006: user override first
  const userPath = config.targets[tool]?.[type]?.[scope];
  if (userPath) return expandTilde(userPath);

  // Bundled defaults
  const bundledPath = BUNDLED_PATHS[tool]?.[type]?.[scope];
  if (bundledPath) return expandTilde(bundledPath);

  // CFG-REQ-0012: throw for unsupported combinations
  throw new Error(
    `No install path configured for tool='${tool}' type='${type}' scope='${scope}'. ` +
      'Add an entry to ~/.config/cerebro/config.yaml under the targets key.',
  );
}

/** CFG-REQ-0008 */
export function trustSource(config: CerebroConfig, url: string): CerebroConfig {
  const idx = config.sources.findIndex((s) => s.url === url);
  if (idx === -1) throw new SourceNotFoundError(url);

  const updated: CerebroConfig = {
    ...config,
    sources: config.sources.map((s, i) => (i === idx ? { ...s, trusted: true } : s)),
  };
  saveConfig(updated);
  return updated;
}

/** CFG-REQ-0009 */
export function addSource(config: CerebroConfig, entry: SourceEntry): CerebroConfig {
  const exists = config.sources.some((s) => s.url === entry.url);
  if (exists) return config; // CFG-REQ-0009: no duplicate, no save

  const updated: CerebroConfig = {
    ...config,
    sources: [...config.sources, entry],
  };
  saveConfig(updated);
  return updated;
}
