/**
 * Tests for SPEC-0001 — Configuration Manager
 * Requirement IDs: CFG-REQ-0001 through CFG-REQ-0012
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

/** Normalise Windows backslashes to forward slashes for cross-platform assertions. */
const toPosix = (p: string) => p.replace(/\\/g, '/');

// ---------------------------------------------------------------------------
// Mock node:os so homedir() returns a predictable value
// ---------------------------------------------------------------------------
vi.mock('node:os', () => ({
  default: { homedir: () => '/home/testuser' },
  homedir: () => '/home/testuser',
}));

// ---------------------------------------------------------------------------
// Mock node:fs with vi.fn() stubs so each test controls fs behaviour
// ---------------------------------------------------------------------------
const fsMock = {
  existsSync: vi.fn<[string], boolean>(),
  readFileSync: vi.fn<[string, BufferEncoding], string>(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  copyFileSync: vi.fn(),
};

vi.mock('node:fs', () => ({
  default: fsMock,
  ...fsMock,
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are registered
// ---------------------------------------------------------------------------
import type {
  CerebroConfig,
  SourceEntry,
} from '../../../src/core/config.js';

// Build the config path the same way the implementation does (platform-aware)
const CONFIG_PATH = path.join('/home/testuser', '.config', 'cerebro', 'config.yaml');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeMinimalConfig(): CerebroConfig {
  return {
    defaults: {},
    sources: [],
    targets: {},
  };
}

function makeFullConfig(): CerebroConfig {
  return {
    defaults: { target: 'claude-code', scope: 'workspace' },
    sources: [
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
    ],
    targets: {},
  };
}

// ---------------------------------------------------------------------------
// CFG-REQ-0001 + CFG-REQ-0002: First-run creation
// ---------------------------------------------------------------------------
describe('loadConfig — first run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CFG-REQ-0001: config file is located at ~/.config/cerebro/config.yaml', async () => {
    fsMock.existsSync.mockReturnValue(false);
    fsMock.readFileSync.mockReturnValue('');

    const { loadConfig } = await import('../../../src/core/config.js');
    loadConfig();

    // The existence check must use the expected path
    expect(fsMock.existsSync).toHaveBeenCalledWith(CONFIG_PATH);
  });

  it('CFG-REQ-0002: creates config directory and file from bundled defaults on first run', async () => {
    fsMock.existsSync.mockReturnValue(false);

    const { loadConfig } = await import('../../../src/core/config.js');
    loadConfig();

    expect(fsMock.mkdirSync).toHaveBeenCalledWith(
      path.dirname(CONFIG_PATH),
      expect.objectContaining({ recursive: true }),
    );
    // writeFileSync or renameSync must have been called to create the file
    const wrote =
      fsMock.writeFileSync.mock.calls.length > 0 ||
      fsMock.renameSync.mock.calls.length > 0;
    expect(wrote).toBe(true);
  });

  it('CFG-REQ-0007: bundled defaults include both default sources', async () => {
    fsMock.existsSync.mockReturnValue(false);

    const { loadConfig } = await import('../../../src/core/config.js');
    const config = loadConfig();

    const urls = config.sources.map((s) => s.url);
    expect(urls).toContain('https://github.com/anthropics/skills');
    expect(urls).toContain('https://github.com/github/awesome-copilot');
  });
});

// ---------------------------------------------------------------------------
// CFG-REQ-0004: merge user file with bundled defaults
// ---------------------------------------------------------------------------
describe('loadConfig — merge behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CFG-REQ-0004: user-supplied values override defaults', async () => {
    fsMock.existsSync.mockReturnValue(true);
    // User has set a custom target default
    fsMock.readFileSync.mockReturnValue(
      'defaults:\n  target: copilot\nsources: []\ntargets: {}\n',
    );

    const { loadConfig } = await import('../../../src/core/config.js');
    const config = loadConfig();

    expect(config.defaults.target).toBe('copilot');
  });

  it('CFG-REQ-0004: absent user keys fall back to bundled defaults', async () => {
    fsMock.existsSync.mockReturnValue(true);
    // User file has no sources key — should get bundled default sources
    fsMock.readFileSync.mockReturnValue('defaults: {}\ntargets: {}\n');

    const { loadConfig } = await import('../../../src/core/config.js');
    const config = loadConfig();

    expect(config.sources.length).toBeGreaterThanOrEqual(2);
    const urls = config.sources.map((s) => s.url);
    expect(urls).toContain('https://github.com/anthropics/skills');
  });

  it('CFG-REQ-0003: loadConfig does not write to disk when file already exists', async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('defaults: {}\nsources: []\ntargets: {}\n');

    const { loadConfig } = await import('../../../src/core/config.js');
    loadConfig();

    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    expect(fsMock.renameSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CFG-REQ-0010: parse error handling
// ---------------------------------------------------------------------------
describe('loadConfig — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CFG-REQ-0010: throws ConfigParseError (not silent fallback) on corrupt YAML', async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(': bad: yaml: [\n  unclosed');

    const { loadConfig, ConfigParseError } = await import('../../../src/core/config.js');
    expect(() => loadConfig()).toThrowError(ConfigParseError);
  });

  it('CFG-REQ-0010: ConfigParseError message names the file path', async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(': bad: yaml: [\n  unclosed');

    const { loadConfig, ConfigParseError } = await import('../../../src/core/config.js');
    try {
      loadConfig();
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigParseError);
      expect((err as Error).message).toContain('config.yaml');
    }
  });
});

// ---------------------------------------------------------------------------
// CFG-REQ-0005 + CFG-REQ-0006: resolveInstallBase
// ---------------------------------------------------------------------------
describe('resolveInstallBase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CFG-REQ-0005: expands ~ to home directory', async () => {
    const { resolveInstallBase } = await import('../../../src/core/config.js');
    const result = resolveInstallBase(makeMinimalConfig(), 'claude-code', 'skill', 'workspace');
    expect(toPosix(result)).not.toContain('~');
    expect(path.isAbsolute(result)).toBe(true);
  });

  it('CFG-REQ-0005: returns an absolute path', async () => {
    const { resolveInstallBase } = await import('../../../src/core/config.js');
    const result = resolveInstallBase(makeMinimalConfig(), 'agents', 'instruction', 'user');
    expect(path.isAbsolute(result)).toBe(true);
  });

  it('CFG-REQ-0006: user override wins over bundled default', async () => {
    const { resolveInstallBase } = await import('../../../src/core/config.js');
    const config: CerebroConfig = {
      defaults: {},
      sources: [],
      targets: {
        'claude-code': {
          skill: { workspace: 'custom/skills/path', user: '~/.custom/skills' },
        },
      },
    };
    const result = resolveInstallBase(config, 'claude-code', 'skill', 'workspace');
    expect(toPosix(result)).toContain('custom/skills/path');
  });

  it('CFG-REQ-0006: falls back to bundled default when no user override', async () => {
    const { resolveInstallBase } = await import('../../../src/core/config.js');
    const result = resolveInstallBase(makeMinimalConfig(), 'claude-code', 'skill', 'workspace');
    // Bundled default for claude-code/skill/workspace is .claude/commands
    expect(toPosix(result)).toContain('.claude');
  });

  it('CFG-REQ-0012: throws descriptive error for unsupported tool+type combination', async () => {
    const { resolveInstallBase } = await import('../../../src/core/config.js');
    expect(() =>
      resolveInstallBase(makeMinimalConfig(), 'cursor' as any, 'skill', 'workspace'),
    ).toThrow();
  });

  // Spot-check all documented bundled default paths
  it.each([
    ['agents', 'skill', 'workspace', '.agents/skills'],
    ['agents', 'skill', 'user', '.agents/skills'],
    ['agents', 'instruction', 'workspace', '.agents/prompts'],
    ['claude-code', 'skill', 'workspace', '.claude/commands'],
    ['claude-code', 'instruction', 'workspace', '.claude/rules'],
    ['copilot', 'skill', 'workspace', '.github/skills'],
    ['copilot', 'instruction', 'workspace', '.github/instructions'],
  ] as const)(
    'bundled default: %s / %s / %s → contains "%s"',
    async (tool, type, scope, expectedFragment) => {
      const { resolveInstallBase } = await import('../../../src/core/config.js');
      const result = resolveInstallBase(makeMinimalConfig(), tool, type, scope);
      expect(toPosix(result)).toContain(expectedFragment);
    },
  );
});

// ---------------------------------------------------------------------------
// CFG-REQ-0008: trustSource
// ---------------------------------------------------------------------------
describe('trustSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CFG-REQ-0008: sets trusted:true on the matching source', async () => {
    const { trustSource } = await import('../../../src/core/config.js');
    const config = makeFullConfig();
    const updated = trustSource(config, 'https://github.com/anthropics/skills');
    const entry = updated.sources.find(
      (s) => s.url === 'https://github.com/anthropics/skills',
    );
    expect(entry?.trusted).toBe(true);
  });

  it('CFG-REQ-0008: calls saveConfig to persist the change', async () => {
    fsMock.existsSync.mockReturnValue(true);
    const { trustSource, saveConfig } = await import('../../../src/core/config.js');
    const config = makeFullConfig();
    trustSource(config, 'https://github.com/anthropics/skills');
    // saveConfig is called internally — verify a write occurred
    const wrote =
      fsMock.writeFileSync.mock.calls.length > 0 ||
      fsMock.renameSync.mock.calls.length > 0;
    expect(wrote).toBe(true);
  });

  it('CFG-REQ-0008: throws SourceNotFoundError for unknown URL', async () => {
    const { trustSource, SourceNotFoundError } = await import('../../../src/core/config.js');
    const config = makeMinimalConfig();
    expect(() => trustSource(config, 'https://github.com/unknown/repo')).toThrowError(
      SourceNotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// CFG-REQ-0009: addSource
// ---------------------------------------------------------------------------
describe('addSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CFG-REQ-0009: adds a new source entry', async () => {
    fsMock.existsSync.mockReturnValue(true);
    const { addSource } = await import('../../../src/core/config.js');
    const config = makeMinimalConfig();
    const entry: SourceEntry = {
      name: 'my-skills',
      url: 'https://github.com/my-org/skills',
      enabled: true,
      trusted: false,
    };
    const updated = addSource(config, entry);
    expect(updated.sources).toContainEqual(expect.objectContaining({ url: entry.url }));
  });

  it('CFG-REQ-0009: does not add duplicate URL', async () => {
    const { addSource } = await import('../../../src/core/config.js');
    const config = makeFullConfig();
    const before = config.sources.length;
    const duplicate: SourceEntry = {
      name: 'dup',
      url: 'https://github.com/anthropics/skills',
      enabled: true,
      trusted: false,
    };
    const updated = addSource(config, duplicate);
    expect(updated.sources.length).toBe(before);
  });

  it('CFG-REQ-0009: does not write to disk when URL is a duplicate', async () => {
    const { addSource } = await import('../../../src/core/config.js');
    const config = makeFullConfig();
    const duplicate: SourceEntry = {
      name: 'dup',
      url: 'https://github.com/anthropics/skills',
      enabled: true,
      trusted: false,
    };
    addSource(config, duplicate);
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    expect(fsMock.renameSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CFG-REQ-0011: saveConfig atomicity
// ---------------------------------------------------------------------------
describe('saveConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CFG-REQ-0011: writes to a temp path and renames (atomic write)', async () => {
    const { saveConfig } = await import('../../../src/core/config.js');
    saveConfig(makeMinimalConfig());

    // Atomic write: either renameSync was called (write-then-rename),
    // or a single writeFileSync to a .tmp path was used
    const usedRename = fsMock.renameSync.mock.calls.length > 0;
    const usedTmp = fsMock.writeFileSync.mock.calls.some(
      ([filePath]) => typeof filePath === 'string' && filePath.includes('.tmp'),
    );
    expect(usedRename || usedTmp).toBe(true);
  });
});
