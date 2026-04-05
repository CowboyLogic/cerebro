/**
 * Tests for SPEC-0008 — CLI Mode: install command
 * Requirement IDs: CLI-REQ-0001 through CLI-REQ-0014
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
const mockSetTarget = vi.fn();
const mockSetScope = vi.fn();
const mockFetchCatalog = vi.fn();
const mockInstallArtifact = vi.fn();
const mockTrustSource = vi.fn();
const mockAddSource = vi.fn();
const mockParseRepoUrl = vi.fn();

vi.mock('../../../src/core/session.js', () => ({
  createSession: mockCreateSession,
  setTarget: mockSetTarget,
  setScope: mockSetScope,
}));

vi.mock('../../../src/core/catalog.js', () => ({
  fetchCatalog: mockFetchCatalog,
}));

vi.mock('../../../src/core/installer.js', () => ({
  installArtifact: mockInstallArtifact,
}));

vi.mock('../../../src/core/config.js', () => ({
  ConfigParseError: class ConfigParseError extends Error {
    constructor() { super('bad config'); this.name = 'ConfigParseError'; }
  },
  trustSource: mockTrustSource,
  addSource: mockAddSource,
}));

vi.mock('../../../src/core/manifest.js', () => ({
  ManifestParseError: class ManifestParseError extends Error {
    constructor() { super('bad manifest'); this.name = 'ManifestParseError'; }
  },
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

function makeConfig(overrides: Partial<CerebroConfig> = {}): CerebroConfig {
  return { defaults: {}, sources: [], targets: {}, ...overrides };
}

function makeManifest(): InstallManifest {
  return { installed: [] };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  const provider = makeProvider();
  return {
    config: makeConfig(),
    manifest: makeManifest(),
    getProvider: vi.fn().mockReturnValue(provider),
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
const TRUSTED_SOURCE = { name: 'anthropics/skills', url: SOURCE_URL, enabled: true, trusted: true };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('installAction — CLI-REQ-0001: session bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
  });

  it('exits 1 with config error message on ConfigParseError', async () => {
    const { ConfigParseError } = await import('../../../src/core/config.js');
    mockCreateSession.mockImplementation(() => { throw new ConfigParseError(); });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    const code = await installAction({ source: SOURCE_URL, id: 'x' });

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('config.yaml'));
    stderrSpy.mockRestore();
  });

  it('exits 1 with manifest error message on ManifestParseError', async () => {
    const { ManifestParseError } = await import('../../../src/core/manifest.js');
    mockCreateSession.mockImplementation(() => { throw new ManifestParseError(); });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    const code = await installAction({ source: SOURCE_URL, id: 'x' });

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('installed.yaml'));
    stderrSpy.mockRestore();
  });

  it('exits 1 with message on unexpected session error', async () => {
    mockCreateSession.mockImplementation(() => { throw new Error('disk full'); });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    const code = await installAction({ source: SOURCE_URL, id: 'x' });

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('disk full'));
    stderrSpy.mockRestore();
  });
});

describe('installAction — CLI-REQ-0006: target resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
  });

  it('exits 1 when no --target and no default in config', async () => {
    mockCreateSession.mockReturnValue(makeSession({ target: null }));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    const code = await installAction({ source: SOURCE_URL, id: 'git-commit-assistant' });

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('--target is required'));
    stderrSpy.mockRestore();
  });

  it('uses session.target when --target option is absent', async () => {
    const session = makeSession({
      target: 'claude-code',
      config: makeConfig({ sources: [TRUSTED_SOURCE] }),
    });
    mockCreateSession.mockReturnValue(session);
    mockFetchCatalog.mockResolvedValue({ source: 'heuristic', artifacts: [] });

    const { installAction } = await import('../../../src/cli/install.js');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await installAction({ source: SOURCE_URL, id: 'missing-id' });

    // Should reach artifact-not-found (exit 1), not the target-missing error
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
    expect(code).toBe(1);
    stderrSpy.mockRestore();
  });
});

describe('installAction — CLI-REQ-0003: trust check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
  });

  it('exits 3 when source is not in config and --trust not provided', async () => {
    mockCreateSession.mockReturnValue(makeSession({ target: 'claude-code' }));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    const code = await installAction({ source: SOURCE_URL, id: 'x', target: 'claude-code' });

    expect(code).toBe(3);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('not trusted'));
    stderrSpy.mockRestore();
  });

  it('exits 3 when source IS in config but trusted=false', async () => {
    const session = makeSession({
      target: 'claude-code',
      config: makeConfig({
        sources: [{ ...TRUSTED_SOURCE, trusted: false }],
      }),
    });
    mockCreateSession.mockReturnValue(session);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    const code = await installAction({ source: SOURCE_URL, id: 'x', target: 'claude-code' });

    expect(code).toBe(3);
    stderrSpy.mockRestore();
  });
});

describe('installAction — CLI-REQ-0004: --trust flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
  });

  it('calls trustSource when source is in config and --trust is set', async () => {
    const session = makeSession({
      target: 'claude-code',
      config: makeConfig({ sources: [{ ...TRUSTED_SOURCE, trusted: false }] }),
    });
    mockCreateSession.mockReturnValue(session);
    mockTrustSource.mockReturnValue({ ...session.config, sources: [TRUSTED_SOURCE] });
    mockFetchCatalog.mockResolvedValue({ source: 'heuristic', artifacts: [] });

    const { installAction } = await import('../../../src/cli/install.js');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await installAction({ source: SOURCE_URL, id: 'any', target: 'claude-code', trust: true });

    expect(mockTrustSource).toHaveBeenCalledWith(expect.anything(), SOURCE_URL);
    stderrSpy.mockRestore();
  });

  it('calls addSource (trusted=true) when source is NOT in config and --trust is set', async () => {
    const session = makeSession({ target: 'claude-code', config: makeConfig({ sources: [] }) });
    const trustedConfig = makeConfig({ sources: [TRUSTED_SOURCE] });
    mockCreateSession.mockReturnValue(session);
    mockAddSource.mockReturnValue(trustedConfig);
    mockFetchCatalog.mockResolvedValue({ source: 'heuristic', artifacts: [] });

    const { installAction } = await import('../../../src/cli/install.js');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await installAction({ source: SOURCE_URL, id: 'any', target: 'claude-code', trust: true });

    expect(mockAddSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ url: SOURCE_URL, trusted: true }),
    );
    stderrSpy.mockRestore();
  });
});

describe('installAction — artifact lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
  });

  it('exits 1 when artifact ID is not found in catalog', async () => {
    const session = makeSession({
      target: 'claude-code',
      config: makeConfig({ sources: [TRUSTED_SOURCE] }),
    });
    mockCreateSession.mockReturnValue(session);
    mockFetchCatalog.mockResolvedValue({ source: 'heuristic', artifacts: [] });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    const code = await installAction({ source: SOURCE_URL, id: 'missing', target: 'claude-code' });

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("'missing' not found"));
    stderrSpy.mockRestore();
  });

  it('exits 1 when fetchCatalog throws a network error', async () => {
    const session = makeSession({
      target: 'claude-code',
      config: makeConfig({ sources: [TRUSTED_SOURCE] }),
    });
    mockCreateSession.mockReturnValue(session);
    mockFetchCatalog.mockRejectedValue(new Error('Network error'));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    const code = await installAction({ source: SOURCE_URL, id: 'x', target: 'claude-code' });

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Network error'));
    stderrSpy.mockRestore();
  });
});

describe('installAction — install outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
  });

  function makeReadySession() {
    return makeSession({
      target: 'claude-code',
      config: makeConfig({ sources: [TRUSTED_SOURCE] }),
    });
  }

  it('CLI-REQ-0012: exits 0 and prints installed path on success', async () => {
    mockCreateSession.mockReturnValue(makeReadySession());
    mockFetchCatalog.mockResolvedValue({
      source: 'catalog',
      artifacts: [makeArtifact()],
    });
    mockInstallArtifact.mockResolvedValue({
      status: 'success',
      installedPath: '/home/user/.claude/commands/git-commit-assistant',
    });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    const code = await installAction({
      source: SOURCE_URL,
      id: 'git-commit-assistant',
      target: 'claude-code',
    });

    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Installed'));
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('/home/user/.claude/commands/git-commit-assistant'),
    );
    stdoutSpy.mockRestore();
  });

  it('CLI-REQ-0005: saves defaults when --persist is set on success', async () => {
    const session = makeReadySession();
    mockCreateSession.mockReturnValue(session);
    mockFetchCatalog.mockResolvedValue({
      source: 'catalog',
      artifacts: [makeArtifact()],
    });
    mockInstallArtifact.mockResolvedValue({
      status: 'success',
      installedPath: '/some/path',
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    await installAction({
      source: SOURCE_URL,
      id: 'git-commit-assistant',
      target: 'claude-code',
      scope: 'workspace',
      persist: true,
    });

    // CLI-REQ-0005: must call setTarget and setScope with persist=true
    expect(mockSetTarget).toHaveBeenCalledWith(session, 'claude-code', true);
    expect(mockSetScope).toHaveBeenCalledWith(session, 'workspace', true);
  });

  it('CLI-REQ-0008: exits 2 with message when artifact already exists', async () => {
    mockCreateSession.mockReturnValue(makeReadySession());
    mockFetchCatalog.mockResolvedValue({
      source: 'catalog',
      artifacts: [makeArtifact()],
    });
    mockInstallArtifact.mockResolvedValue({ status: 'skipped', reason: 'exists' });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    const code = await installAction({
      source: SOURCE_URL,
      id: 'git-commit-assistant',
      target: 'claude-code',
    });

    expect(code).toBe(2);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('--overwrite'));
    stderrSpy.mockRestore();
  });

  it('CLI-REQ-0008: exits 2 when artifact is conflict skipped', async () => {
    mockCreateSession.mockReturnValue(makeReadySession());
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [makeArtifact()] });
    mockInstallArtifact.mockResolvedValue({ status: 'skipped', reason: 'conflict' });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    const code = await installAction({
      source: SOURCE_URL,
      id: 'git-commit-assistant',
      target: 'claude-code',
    });

    expect(code).toBe(2);
    stderrSpy.mockRestore();
  });

  it('CLI-REQ-0008: exits 2 when target is unsupported', async () => {
    mockCreateSession.mockReturnValue(makeReadySession());
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [makeArtifact()] });
    mockInstallArtifact.mockResolvedValue({ status: 'skipped', reason: 'unsupported-target' });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    const code = await installAction({
      source: SOURCE_URL,
      id: 'git-commit-assistant',
      target: 'claude-code',
    });

    expect(code).toBe(2);
    stderrSpy.mockRestore();
  });

  it('exits 1 when installArtifact returns error status', async () => {
    mockCreateSession.mockReturnValue(makeReadySession());
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [makeArtifact()] });
    mockInstallArtifact.mockResolvedValue({ status: 'error', message: 'write failed' });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    const code = await installAction({
      source: SOURCE_URL,
      id: 'git-commit-assistant',
      target: 'claude-code',
    });

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('write failed'));
    stderrSpy.mockRestore();
  });
});

describe('installAction — CLI-REQ-0007: scope defaults to workspace', () => {
  it('passes workspace scope when --scope is not provided', async () => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    const session = makeSession({
      target: 'claude-code',
      config: makeConfig({ sources: [TRUSTED_SOURCE] }),
    });
    mockCreateSession.mockReturnValue(session);
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [makeArtifact()] });
    mockInstallArtifact.mockResolvedValue({ status: 'success', installedPath: '/some/path' });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { installAction } = await import('../../../src/cli/install.js');
    await installAction({ source: SOURCE_URL, id: 'git-commit-assistant', target: 'claude-code' });

    expect(mockInstallArtifact).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'workspace', // scope
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});
