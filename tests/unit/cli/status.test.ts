/**
 * Tests for SPEC-0008 — CLI Mode: status command
 * Requirement IDs: CLI-REQ-0001, CLI-REQ-0009, CLI-REQ-0013
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

function makeConfig(): CerebroConfig {
  return { defaults: {}, sources: [], targets: {} };
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

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'git-commit-assistant',
    name: 'Git Commit Assistant',
    type: 'skill',
    source: 'skills/git-commit-assistant',
    ...overrides,
  };
}

const SOURCE_URL = 'https://github.com/anthropics/skills';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('statusAction — CLI-REQ-0001: session bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
  });

  it('exits 1 on ConfigParseError', async () => {
    const { ConfigParseError } = await import('../../../src/core/config.js');
    mockCreateSession.mockImplementation(() => { throw new ConfigParseError(); });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { statusAction } = await import('../../../src/cli/status.js');
    const code = await statusAction({
      source: SOURCE_URL,
      id: 'git-commit-assistant',
      target: 'claude-code',
    });

    expect(code).toBe(1);
    stderrSpy.mockRestore();
  });
});

describe('statusAction — artifact not found', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockCreateSession.mockReturnValue(makeSession());
  });

  it('exits 1 with message when artifact not in catalog', async () => {
    mockFetchCatalog.mockResolvedValue({ source: 'heuristic', artifacts: [] });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { statusAction } = await import('../../../src/cli/status.js');
    const code = await statusAction({
      source: SOURCE_URL,
      id: 'missing-id',
      target: 'claude-code',
    });

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("'missing-id' not found"));
    stderrSpy.mockRestore();
  });
});

describe('statusAction — plain text output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockCreateSession.mockReturnValue(makeSession());
    mockFetchCatalog.mockResolvedValue({
      source: 'catalog',
      artifacts: [makeArtifact()],
    });
    mockResolveInstallBase.mockReturnValue('/home/user/.claude/commands');
  });

  it('outputs artifact id, install path, and (Installed) label', async () => {
    mockGetArtifactStatus.mockReturnValue('installed');
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { statusAction } = await import('../../../src/cli/status.js');
    const code = await statusAction({
      source: SOURCE_URL,
      id: 'git-commit-assistant',
      target: 'claude-code',
    });

    expect(code).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('git-commit-assistant');
    expect(output).toContain('(Installed)');
    stdoutSpy.mockRestore();
  });

  it('outputs (Available) for artifacts not yet installed', async () => {
    mockGetArtifactStatus.mockReturnValue('available');
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { statusAction } = await import('../../../src/cli/status.js');
    const code = await statusAction({
      source: SOURCE_URL,
      id: 'git-commit-assistant',
      target: 'claude-code',
    });

    expect(code).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('(Available)');
    stdoutSpy.mockRestore();
  });

  it('outputs (Exists) when file exists but not tracked', async () => {
    mockGetArtifactStatus.mockReturnValue('exists');
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { statusAction } = await import('../../../src/cli/status.js');
    const code = await statusAction({
      source: SOURCE_URL,
      id: 'git-commit-assistant',
      target: 'claude-code',
    });

    expect(code).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('(Exists)');
    stdoutSpy.mockRestore();
  });
});

describe('statusAction — CLI-REQ-0009: JSON output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockCreateSession.mockReturnValue(makeSession());
    mockFetchCatalog.mockResolvedValue({
      source: 'catalog',
      artifacts: [makeArtifact()],
    });
    mockResolveInstallBase.mockReturnValue('/home/user/.claude/commands');
    mockGetArtifactStatus.mockReturnValue('installed');
  });

  it('outputs valid JSON with id, status, and installPath', async () => {
    let written = '';
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((s) => { written += String(s); return true; });

    const { statusAction } = await import('../../../src/cli/status.js');
    const code = await statusAction({
      source: SOURCE_URL,
      id: 'git-commit-assistant',
      target: 'claude-code',
      json: true,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(written);
    expect(parsed).toMatchObject({
      id: 'git-commit-assistant',
      status: 'installed',
    });
    expect(typeof parsed.installPath).toBe('string');
    stdoutSpy.mockRestore();
  });
});

describe('statusAction — resolveInstallBase failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockCreateSession.mockReturnValue(makeSession());
    mockFetchCatalog.mockResolvedValue({
      source: 'catalog',
      artifacts: [makeArtifact()],
    });
  });

  it('exits 1 when install base cannot be resolved for tool/type combo', async () => {
    mockResolveInstallBase.mockImplementation(() => {
      throw new Error('No install path configured');
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { statusAction } = await import('../../../src/cli/status.js');
    const code = await statusAction({
      source: SOURCE_URL,
      id: 'git-commit-assistant',
      target: 'unsupported-tool',
    });

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No install path configured'));
    stderrSpy.mockRestore();
  });
});
