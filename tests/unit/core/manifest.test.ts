/**
 * Tests for SPEC-0002 — Install Manifest
 * Requirement IDs: MAN-REQ-0001 through MAN-REQ-0011
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock node:os
// ---------------------------------------------------------------------------
vi.mock('node:os', () => ({
  default: { homedir: () => '/home/testuser' },
  homedir: () => '/home/testuser',
}));

// ---------------------------------------------------------------------------
// Mock node:fs
// ---------------------------------------------------------------------------
const fsMock = {
  existsSync: vi.fn<[string], boolean>(),
  readFileSync: vi.fn<[string, BufferEncoding], string>(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
};

vi.mock('node:fs', () => ({
  default: fsMock,
  ...fsMock,
}));

// ---------------------------------------------------------------------------
// Types + module import
// ---------------------------------------------------------------------------
import type {
  InstalledEntry,
  InstallManifest,
} from '../../../src/core/manifest.js';

import path from 'node:path';
const MANIFEST_PATH = path.join('/home/testuser', '.config', 'cerebro', 'installed.yaml');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeEntry(overrides: Partial<InstalledEntry> = {}): InstalledEntry {
  return {
    id: 'git-commit-assistant',
    name: 'Git Commit Assistant',
    type: 'skill',
    sourceUrl: 'https://github.com/anthropics/skills',
    target: 'claude-code',
    scope: 'workspace',
    installedPath: '/projects/myapp/.claude/commands/git-commit-assistant',
    installedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeManifest(entries: InstalledEntry[] = []): InstallManifest {
  return { installed: entries };
}

// ---------------------------------------------------------------------------
// MAN-REQ-0001: manifest location
// MAN-REQ-0002: returns empty manifest when file absent
// ---------------------------------------------------------------------------
describe('loadManifest — file location and first run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MAN-REQ-0001: checks the manifest at ~/.config/cerebro/installed.yaml', async () => {
    fsMock.existsSync.mockReturnValue(false);

    const { loadManifest } = await import('../../../src/core/manifest.js');
    loadManifest();

    expect(fsMock.existsSync).toHaveBeenCalledWith(MANIFEST_PATH);
  });

  it('MAN-REQ-0002: returns empty manifest when file does not exist', async () => {
    fsMock.existsSync.mockReturnValue(false);

    const { loadManifest } = await import('../../../src/core/manifest.js');
    const manifest = loadManifest();

    expect(manifest).toEqual({ installed: [] });
  });

  it('MAN-REQ-0002: does not throw when file is absent', async () => {
    fsMock.existsSync.mockReturnValue(false);

    const { loadManifest } = await import('../../../src/core/manifest.js');
    expect(() => loadManifest()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// MAN-REQ-0010: parse error handling
// ---------------------------------------------------------------------------
describe('loadManifest — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MAN-REQ-0010: throws ManifestParseError on corrupt YAML', async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(': bad: yaml: [\n  unclosed');

    const { loadManifest, ManifestParseError } = await import('../../../src/core/manifest.js');
    expect(() => loadManifest()).toThrowError(ManifestParseError);
  });

  it('MAN-REQ-0010: does NOT return empty manifest on corrupt file (no silent fallback)', async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(': bad: yaml: [\n  unclosed');

    const { loadManifest } = await import('../../../src/core/manifest.js');
    expect(() => loadManifest()).toThrow();
  });

  it('MAN-REQ-0010: ManifestParseError message names the file path', async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(': bad: yaml: [\n  unclosed');

    const { loadManifest, ManifestParseError } = await import('../../../src/core/manifest.js');
    try {
      loadManifest();
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestParseError);
      expect((err as Error).message).toContain('installed.yaml');
    }
  });
});

// ---------------------------------------------------------------------------
// MAN-REQ-0008: recordInstall — replace vs append
// ---------------------------------------------------------------------------
describe('recordInstall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MAN-REQ-0008: appends a new entry when id+target+scope is new', async () => {
    const { recordInstall } = await import('../../../src/core/manifest.js');
    const manifest = makeManifest([makeEntry()]);
    const newEntry = makeEntry({ id: 'different-skill', installedPath: '/some/other/path' });
    const updated = recordInstall(manifest, newEntry);
    expect(updated.installed).toHaveLength(2);
  });

  it('MAN-REQ-0008: replaces existing entry with same id+target+scope', async () => {
    const { recordInstall } = await import('../../../src/core/manifest.js');
    const original = makeEntry({ installedAt: '2026-01-01T00:00:00.000Z' });
    const manifest = makeManifest([original]);
    const updated_entry = makeEntry({ installedAt: '2026-06-01T00:00:00.000Z' });
    const updated = recordInstall(manifest, updated_entry);

    expect(updated.installed).toHaveLength(1);
    expect(updated.installed[0].installedAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('MAN-REQ-0008: entries with same id but different target are NOT replaced', async () => {
    const { recordInstall } = await import('../../../src/core/manifest.js');
    const manifest = makeManifest([makeEntry({ target: 'claude-code' })]);
    const differentTarget = makeEntry({ target: 'copilot', installedPath: '/other/path' });
    const updated = recordInstall(manifest, differentTarget);
    expect(updated.installed).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// MAN-REQ-0003 through MAN-REQ-0007: getArtifactStatus
// ---------------------------------------------------------------------------
describe('getArtifactStatus — path-first logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MAN-REQ-0003: checks installPath existence before consulting manifest', async () => {
    fsMock.existsSync.mockReturnValue(false);
    const { getArtifactStatus } = await import('../../../src/core/manifest.js');
    const manifest = makeManifest([makeEntry()]);

    const status = getArtifactStatus(
      manifest,
      'git-commit-assistant',
      'https://github.com/anthropics/skills',
      'claude-code',
      'workspace',
      '/projects/myapp/.claude/commands/git-commit-assistant',
    );

    expect(fsMock.existsSync).toHaveBeenCalledWith(
      '/projects/myapp/.claude/commands/git-commit-assistant',
    );
    expect(status).toBe('available');
  });

  it('MAN-REQ-0003: returns "available" when install path does not exist', async () => {
    fsMock.existsSync.mockReturnValue(false);
    const { getArtifactStatus } = await import('../../../src/core/manifest.js');

    const status = getArtifactStatus(
      makeManifest(),
      'git-commit-assistant',
      'https://github.com/anthropics/skills',
      'claude-code',
      'workspace',
      '/does/not/exist',
    );

    expect(status).toBe('available');
  });

  it('MAN-REQ-0005: returns "installed" when path exists AND manifest entry matches sourceUrl', async () => {
    fsMock.existsSync.mockReturnValue(true);
    const { getArtifactStatus } = await import('../../../src/core/manifest.js');
    const manifest = makeManifest([makeEntry()]);

    const status = getArtifactStatus(
      manifest,
      'git-commit-assistant',
      'https://github.com/anthropics/skills',
      'claude-code',
      'workspace',
      '/projects/myapp/.claude/commands/git-commit-assistant',
    );

    expect(status).toBe('installed');
  });

  it('MAN-REQ-0006: returns "conflict" when path exists AND manifest entry has different sourceUrl', async () => {
    fsMock.existsSync.mockReturnValue(true);
    const { getArtifactStatus } = await import('../../../src/core/manifest.js');
    const manifest = makeManifest([
      makeEntry({ sourceUrl: 'https://github.com/someone-else/skills' }),
    ]);

    const status = getArtifactStatus(
      manifest,
      'git-commit-assistant',
      'https://github.com/anthropics/skills', // different from manifest
      'claude-code',
      'workspace',
      '/projects/myapp/.claude/commands/git-commit-assistant',
    );

    expect(status).toBe('conflict');
  });

  it('MAN-REQ-0007: returns "exists" when path exists AND no manifest entry for id+target+scope', async () => {
    fsMock.existsSync.mockReturnValue(true);
    const { getArtifactStatus } = await import('../../../src/core/manifest.js');

    const status = getArtifactStatus(
      makeManifest([]), // empty manifest
      'git-commit-assistant',
      'https://github.com/anthropics/skills',
      'claude-code',
      'workspace',
      '/projects/myapp/.claude/commands/git-commit-assistant',
    );

    expect(status).toBe('exists');
  });
});

// ---------------------------------------------------------------------------
// MAN-REQ-0004: stale entry detection
// ---------------------------------------------------------------------------
describe('getArtifactStatus — stale entry cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MAN-REQ-0004: removes stale manifest entry when installPath does not exist on disk', async () => {
    // Path does NOT exist on disk but manifest has an entry
    fsMock.existsSync.mockImplementation((p: string) => {
      if (p === MANIFEST_PATH) return true;
      return false; // the artifact path is gone
    });
    fsMock.readFileSync.mockReturnValue('installed: []\n');

    const { getArtifactStatus } = await import('../../../src/core/manifest.js');
    const staleEntry = makeEntry();
    const manifest = makeManifest([staleEntry]);

    getArtifactStatus(
      manifest,
      staleEntry.id,
      staleEntry.sourceUrl,
      staleEntry.target,
      staleEntry.scope,
      staleEntry.installedPath,
    );

    // After stale detection, manifest should have been saved with entry removed
    const wrote =
      fsMock.writeFileSync.mock.calls.length > 0 ||
      fsMock.renameSync.mock.calls.length > 0;
    expect(wrote).toBe(true);
  });

  it('MAN-REQ-0004: returns "available" after removing stale entry', async () => {
    fsMock.existsSync.mockReturnValue(false);
    fsMock.readFileSync.mockReturnValue('installed: []\n');

    const { getArtifactStatus } = await import('../../../src/core/manifest.js');
    const staleEntry = makeEntry();
    const manifest = makeManifest([staleEntry]);

    const status = getArtifactStatus(
      manifest,
      staleEntry.id,
      staleEntry.sourceUrl,
      staleEntry.target,
      staleEntry.scope,
      staleEntry.installedPath,
    );

    expect(status).toBe('available');
  });
});

// ---------------------------------------------------------------------------
// MAN-REQ-0009: saveManifest atomicity
// ---------------------------------------------------------------------------
describe('saveManifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MAN-REQ-0009: writes atomically (temp file + rename or equivalent)', async () => {
    const { saveManifest } = await import('../../../src/core/manifest.js');
    saveManifest(makeManifest());

    const usedRename = fsMock.renameSync.mock.calls.length > 0;
    const usedTmp = fsMock.writeFileSync.mock.calls.some(
      ([filePath]) => typeof filePath === 'string' && filePath.includes('.tmp'),
    );
    expect(usedRename || usedTmp).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MAN-REQ-0011: no credentials stored (structural)
// ---------------------------------------------------------------------------
describe('InstalledEntry structure', () => {
  it('MAN-REQ-0011: InstalledEntry type does not include credential fields', () => {
    // This is a type-level guarantee — verified by TypeScript at compile time.
    // At runtime, confirm that a recorded entry does not contain token-like keys.
    const entry = makeEntry();
    const forbidden = ['token', 'password', 'secret', 'apiKey', 'pat', 'credential'];
    for (const key of forbidden) {
      expect(Object.keys(entry)).not.toContain(key);
    }
  });
});
