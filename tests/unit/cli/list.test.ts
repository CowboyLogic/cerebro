/**
 * Tests for SPEC-0008 — CLI Mode: list command
 * Requirement IDs: CLI-REQ-0001, CLI-REQ-0009, CLI-REQ-0010, CLI-REQ-0013
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '../../../src/core/session.js';
import type { CerebroConfig } from '../../../src/core/config.js';
import type { InstallManifest } from '../../../src/core/manifest.js';
import type { SourceProvider } from '../../../src/core/provider.js';
import type { Artifact } from '@cowboylogic/cerebro-schema';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockCreateSession = vi.fn();
const mockFetchCatalog = vi.fn();
const mockGetArtifactStatus = vi.fn();
const mockResolveInstallBase = vi.fn();
const mockParseRepoUrl = vi.fn();

vi.mock('../../../src/core/session.js', () => ({
  createSession: mockCreateSession,
}));

vi.mock('../../../src/core/catalog.js', () => ({
  fetchCatalog: mockFetchCatalog,
}));

vi.mock('../../../src/core/manifest.js', () => ({
  ManifestParseError: class ManifestParseError extends Error {
    constructor() { super('bad manifest'); this.name = 'ManifestParseError'; }
  },
  getArtifactStatus: mockGetArtifactStatus,
}));

vi.mock('../../../src/core/config.js', () => ({
  ConfigParseError: class ConfigParseError extends Error {
    constructor() { super('bad config'); this.name = 'ConfigParseError'; }
  },
  resolveInstallBase: mockResolveInstallBase,
}));

vi.mock('../../../src/core/provider.js', () => ({
  parseRepoUrl: mockParseRepoUrl,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvider(): SourceProvider {
  return {
    domain: 'github.com',
    listDirectory: vi.fn(),
    fetchFileContent: vi.fn(),
    downloadDirectory: vi.fn(),
    downloadFile: vi.fn(),
  };
}

function makeConfig(sources = []): CerebroConfig {
  return { defaults: {}, sources, targets: {} };
}

function makeManifest(): InstallManifest {
  return { installed: [] };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    config: makeConfig(),
    manifest: makeManifest(),
    getProvider: vi.fn().mockReturnValue(makeProvider()),
    target: null,
    scope: null,
    catalogCache: new Map(),
    ...overrides,
  };
}

function makeArtifact(id: string, type: Artifact['type'] = 'skill'): Artifact {
  return {
    id,
    name: id.replace(/-/g, ' '),
    type,
    source: `skills/${id}`,
  };
}

const SOURCE_URL = 'https://github.com/anthropics/skills';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('listAction — CLI-REQ-0001: session bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
  });

  it('exits 1 on ConfigParseError', async () => {
    const { ConfigParseError } = await import('../../../src/core/config.js');
    mockCreateSession.mockImplementation(() => { throw new ConfigParseError(); });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { listAction } = await import('../../../src/cli/list.js');
    const code = await listAction({ source: SOURCE_URL });

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('config.yaml'));
    stderrSpy.mockRestore();
  });

  it('exits 1 on ManifestParseError', async () => {
    const { ManifestParseError } = await import('../../../src/core/manifest.js');
    mockCreateSession.mockImplementation(() => { throw new ManifestParseError(); });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { listAction } = await import('../../../src/cli/list.js');
    const code = await listAction({ source: SOURCE_URL });

    expect(code).toBe(1);
    stderrSpy.mockRestore();
  });
});

describe('listAction — plain text output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockCreateSession.mockReturnValue(makeSession());
  });

  it('outputs catalog source label with heuristic tag', async () => {
    mockFetchCatalog.mockResolvedValue({
      source: 'heuristic',
      artifacts: [makeArtifact('git-commit-assistant')],
    });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { listAction } = await import('../../../src/cli/list.js');
    const code = await listAction({ source: SOURCE_URL });

    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('heuristic'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('git-commit-assistant'));
    stdoutSpy.mockRestore();
  });

  it('outputs catalog source label with catalog tag', async () => {
    mockFetchCatalog.mockResolvedValue({
      source: 'catalog',
      artifacts: [makeArtifact('git-commit-assistant')],
    });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { listAction } = await import('../../../src/cli/list.js');
    const code = await listAction({ source: SOURCE_URL });

    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('(catalog)'));
    stdoutSpy.mockRestore();
  });

  it('says "No artifacts found" when catalog is empty', async () => {
    mockFetchCatalog.mockResolvedValue({ source: 'heuristic', artifacts: [] });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { listAction } = await import('../../../src/cli/list.js');
    const code = await listAction({ source: SOURCE_URL });

    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('No artifacts found'));
    stdoutSpy.mockRestore();
  });

  it('shows count line with artifact total', async () => {
    mockFetchCatalog.mockResolvedValue({
      source: 'catalog',
      artifacts: [makeArtifact('a'), makeArtifact('b')],
    });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { listAction } = await import('../../../src/cli/list.js');
    const code = await listAction({ source: SOURCE_URL });

    expect(code).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('2 artifacts');
    stdoutSpy.mockRestore();
  });

  it('exits 1 and writes to stderr when fetchCatalog throws', async () => {
    mockFetchCatalog.mockRejectedValue(new Error('rate limit'));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { listAction } = await import('../../../src/cli/list.js');
    const code = await listAction({ source: SOURCE_URL });

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('rate limit'));
    stderrSpy.mockRestore();
  });
});

describe('listAction — CLI-REQ-0009: JSON output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockCreateSession.mockReturnValue(makeSession());
  });

  it('outputs valid JSON array to stdout', async () => {
    mockFetchCatalog.mockResolvedValue({
      source: 'catalog',
      artifacts: [makeArtifact('git-commit-assistant')],
    });
    let written = '';
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((s) => { written += String(s); return true; });

    const { listAction } = await import('../../../src/cli/list.js');
    const code = await listAction({ source: SOURCE_URL, json: true });

    expect(code).toBe(0);
    const parsed = JSON.parse(written);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({
      id: 'git-commit-assistant',
      type: 'skill',
      status: 'available',
    });
    stdoutSpy.mockRestore();
  });
});

describe('listAction — CLI-REQ-0010: keyword filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockCreateSession.mockReturnValue(makeSession());
  });

  it('passes keyword to fetchCatalog for filtering', async () => {
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [] });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { listAction } = await import('../../../src/cli/list.js');
    await listAction({ source: SOURCE_URL, filter: 'git' });

    expect(mockFetchCatalog).toHaveBeenCalledWith(
      expect.anything(),
      'anthropics',
      'skills',
      expect.objectContaining({ keyword: 'git' }),
    );
    stdoutSpy.mockRestore();
  });

  it('passes type filter to fetchCatalog', async () => {
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [] });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { listAction } = await import('../../../src/cli/list.js');
    await listAction({ source: SOURCE_URL, type: 'skill' });

    expect(mockFetchCatalog).toHaveBeenCalledWith(
      expect.anything(),
      'anthropics',
      'skills',
      expect.objectContaining({ type: 'skill' }),
    );
    stdoutSpy.mockRestore();
  });
});

describe('listAction — status column when --target is given', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockCreateSession.mockReturnValue(makeSession());
  });

  it('shows (Installed) label when artifact status is installed', async () => {
    mockFetchCatalog.mockResolvedValue({
      source: 'catalog',
      artifacts: [makeArtifact('python-debugger')],
    });
    mockResolveInstallBase.mockReturnValue('/home/user/.claude/commands');
    mockGetArtifactStatus.mockReturnValue('installed');
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { listAction } = await import('../../../src/cli/list.js');
    const code = await listAction({ source: SOURCE_URL, target: 'claude-code' });

    expect(code).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('(Installed)');
    stdoutSpy.mockRestore();
  });
});
