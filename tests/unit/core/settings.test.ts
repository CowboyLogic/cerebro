import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSettings, saveSettings, addCustomRepo, getSettingsPath } from '../../../src/core/settings.js';

// ── fs mock ───────────────────────────────────────────────────────────────────

const mockFiles: Record<string, string> = {};

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn((p: string) => p in mockFiles),
    statSync:   vi.fn((p: string) => ({ size: (mockFiles[p] ?? '').length })),
    readFileSync: vi.fn((p: string) => mockFiles[p] ?? ''),
    writeFileSync: vi.fn((p: string, data: string) => { mockFiles[p] = data; }),
    mkdirSync: vi.fn(),
  },
  existsSync:    vi.fn((p: string) => p in mockFiles),
  statSync:      vi.fn((p: string) => ({ size: (mockFiles[p] ?? '').length })),
  readFileSync:  vi.fn((p: string) => mockFiles[p] ?? ''),
  writeFileSync: vi.fn((p: string, data: string) => { mockFiles[p] = data; }),
  mkdirSync:     vi.fn(),
}));

vi.mock('../../../src/utils/platform.js', () => ({
  getUserConfigDir: vi.fn(() => '/home/user/.config'),
  getPlatform: vi.fn(() => 'linux'),
  getHomeDir: vi.fn(() => '/home/user'),
}));

beforeEach(() => {
  // Clear the virtual filesystem before each test
  for (const key of Object.keys(mockFiles)) delete mockFiles[key];
});

// ── loadSettings ──────────────────────────────────────────────────────────────

describe('loadSettings', () => {
  it('returns empty settings when file does not exist', () => {
    const s = loadSettings();
    expect(s.customRepos).toEqual([]);
  });

  it('parses a valid settings file', () => {
    mockFiles[getSettingsPath()] = JSON.stringify({
      customRepos: [{ owner: 'acme', repo: 'my-skills' }],
    });
    const s = loadSettings();
    expect(s.customRepos).toHaveLength(1);
    expect(s.customRepos[0]).toMatchObject({ owner: 'acme', repo: 'my-skills' });
  });

  it('drops entries with invalid owner/repo identifiers', () => {
    mockFiles[getSettingsPath()] = JSON.stringify({
      customRepos: [
        { owner: '../evil', repo: 'repo' },        // path traversal
        { owner: 'good-owner', repo: 'good-repo' }, // valid
        { owner: 'bad owner', repo: 'repo' },       // space in owner
      ],
    });
    const s = loadSettings();
    expect(s.customRepos).toHaveLength(1);
    expect(s.customRepos[0].owner).toBe('good-owner');
  });

  it('returns empty settings on malformed JSON', () => {
    mockFiles[getSettingsPath()] = '{ not valid json ';
    expect(loadSettings().customRepos).toEqual([]);
  });

  it('returns empty settings when file exceeds size limit', () => {
    mockFiles[getSettingsPath()] = 'x'.repeat(65 * 1024); // > 64 KB
    expect(loadSettings().customRepos).toEqual([]);
  });

  it('caps at 20 repos even if the file contains more', () => {
    const repos = Array.from({ length: 25 }, (_, i) => ({
      owner: `owner${i}`,
      repo:  `repo${i}`,
    }));
    mockFiles[getSettingsPath()] = JSON.stringify({ customRepos: repos });
    expect(loadSettings().customRepos).toHaveLength(20);
  });
});

// ── addCustomRepo ─────────────────────────────────────────────────────────────

describe('addCustomRepo', () => {
  it('prepends a new repo to the front of the list', () => {
    const s = addCustomRepo({ customRepos: [] }, { owner: 'new', repo: 'thing' });
    expect(s.customRepos[0]).toMatchObject({ owner: 'new', repo: 'thing' });
  });

  it('does not duplicate an existing repo', () => {
    const base = { customRepos: [{ owner: 'acme', repo: 'skills' }] };
    const s = addCustomRepo(base, { owner: 'acme', repo: 'skills' });
    expect(s.customRepos).toHaveLength(1);
  });

  it('trims the list to 20 entries', () => {
    const existing = Array.from({ length: 20 }, (_, i) => ({
      owner: `owner${i}`, repo: `repo${i}`,
    }));
    const s = addCustomRepo({ customRepos: existing }, { owner: 'new', repo: 'one' });
    expect(s.customRepos).toHaveLength(20);
    expect(s.customRepos[0]).toMatchObject({ owner: 'new', repo: 'one' });
  });
});

// ── saveSettings ──────────────────────────────────────────────────────────────

describe('saveSettings', () => {
  it('writes valid JSON to the settings path', () => {
    const settings = { customRepos: [{ owner: 'foo', repo: 'bar' }] };
    saveSettings(settings);
    const written = mockFiles[getSettingsPath()];
    expect(written).toBeDefined();
    expect(JSON.parse(written)).toMatchObject(settings);
  });
});
