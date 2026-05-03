/**
 * Tests for SPEC-0008 — CLI Mode: sources command
 * Requirement IDs: CLI-REQ-0001, CLI-REQ-0009, CLI-REQ-0013
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '../../../src/core/session.js';
import type { CerebroConfig } from '../../../src/core/config.js';
import type { InstallManifest } from '../../../src/core/manifest.js';
import type { SourceProvider } from '../../../src/core/provider.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockCreateSession = vi.fn();
const mockAddSource = vi.fn();
const mockTrustSource = vi.fn();
const mockParseRepoUrl = vi.fn();

vi.mock('../../../src/core/session.js', () => ({
  createSession: mockCreateSession,
}));

vi.mock('../../../src/core/config.js', () => ({
  ConfigParseError: class ConfigParseError extends Error {
    constructor() { super('bad config'); this.name = 'ConfigParseError'; }
  },
  addSource: mockAddSource,
  trustSource: mockTrustSource,
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

function makeConfig(overrides: Partial<CerebroConfig> = {}): CerebroConfig {
  return { defaults: {}, sources: [], targets: {}, ...overrides };
}

function makeManifest(): InstallManifest {
  return { installed: [] };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  const provider: SourceProvider = {
    domain: 'github.com',
    listDirectory: vi.fn(),
    fetchFileContent: vi.fn(),
    downloadDirectory: vi.fn(),
    downloadFile: vi.fn(),
  };
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

const SOURCE_A = {
  name: 'anthropics/skills',
  url: 'https://github.com/anthropics/skills',
  enabled: true,
  trusted: true,
};
const SOURCE_B = {
  name: 'awesome-copilot',
  url: 'https://github.com/github/awesome-copilot',
  enabled: true,
  trusted: false,
};

// ---------------------------------------------------------------------------
// sourcesListAction
// ---------------------------------------------------------------------------

describe('sourcesListAction — plain text', () => {
  beforeEach(() => vi.clearAllMocks());

  it('CLI-REQ-0001: exits 1 on ConfigParseError', async () => {
    const { ConfigParseError } = await import('../../../src/core/config.js');
    mockCreateSession.mockImplementation(() => { throw new ConfigParseError(); });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { sourcesListAction } = await import('../../../src/cli/sources.js');
    const code = await sourcesListAction({});

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('config.yaml'));
    stderrSpy.mockRestore();
  });

  it('lists sources with trusted/not-trusted status', async () => {
    mockCreateSession.mockReturnValue(
      makeSession({ config: makeConfig({ sources: [SOURCE_A, SOURCE_B] }) }),
    );
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { sourcesListAction } = await import('../../../src/cli/sources.js');
    const code = await sourcesListAction({});

    expect(code).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('anthropics/skills');
    expect(output).toContain('trusted');
    expect(output).toContain('not trusted');
    stdoutSpy.mockRestore();
  });

  it('shows "(none)" when no sources are configured', async () => {
    mockCreateSession.mockReturnValue(makeSession({ config: makeConfig({ sources: [] }) }));
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { sourcesListAction } = await import('../../../src/cli/sources.js');
    const code = await sourcesListAction({});

    expect(code).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('(none)');
    stdoutSpy.mockRestore();
  });
});

describe('sourcesListAction — CLI-REQ-0009: JSON output', () => {
  beforeEach(() => vi.clearAllMocks());

  it('outputs valid JSON array of sources', async () => {
    mockCreateSession.mockReturnValue(
      makeSession({ config: makeConfig({ sources: [SOURCE_A] }) }),
    );
    let written = '';
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((s) => { written += String(s); return true; });

    const { sourcesListAction } = await import('../../../src/cli/sources.js');
    const code = await sourcesListAction({ json: true });

    expect(code).toBe(0);
    const parsed = JSON.parse(written);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({ url: SOURCE_A.url, trusted: true });
    stdoutSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// sourcesAddAction
// ---------------------------------------------------------------------------

describe('sourcesAddAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRepoUrl.mockReturnValue({ owner: 'myorg', repo: 'my-skills' });
  });

  it('CLI-REQ-0013: session.config is updated with addSource return value', async () => {
    const session = makeSession();
    const updatedConfig = makeConfig({ sources: [{ name: 'myorg/my-skills', url: 'https://github.com/myorg/my-skills', enabled: true, trusted: false }] });
    mockCreateSession.mockReturnValue(session);
    mockAddSource.mockReturnValue(updatedConfig);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { sourcesAddAction } = await import('../../../src/cli/sources.js');
    await sourcesAddAction('https://github.com/myorg/my-skills', {});

    // session.config must be updated to the value returned by addSource
    expect(session.config).toBe(updatedConfig);
  });

  it('calls addSource and prints confirmation', async () => {
    mockCreateSession.mockReturnValue(makeSession());
    mockAddSource.mockReturnValue(makeConfig());
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { sourcesAddAction } = await import('../../../src/cli/sources.js');
    const code = await sourcesAddAction('https://github.com/myorg/my-skills', {});

    expect(code).toBe(0);
    expect(mockAddSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ url: 'https://github.com/myorg/my-skills', trusted: false }),
    );
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Added');
    stdoutSpy.mockRestore();
  });

  it('adds with trusted=true when --trust is given', async () => {
    mockCreateSession.mockReturnValue(makeSession());
    mockAddSource.mockReturnValue(makeConfig());
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { sourcesAddAction } = await import('../../../src/cli/sources.js');
    await sourcesAddAction('https://github.com/myorg/my-skills', { trust: true });

    expect(mockAddSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ trusted: true }),
    );
    stdoutSpy.mockRestore();
  });

  it('does not call addSource when --no-save is given', async () => {
    mockCreateSession.mockReturnValue(makeSession());
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { sourcesAddAction } = await import('../../../src/cli/sources.js');
    const code = await sourcesAddAction('https://github.com/myorg/my-skills', { noSave: true });

    expect(code).toBe(0);
    expect(mockAddSource).not.toHaveBeenCalled();
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('session only');
    stdoutSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// sourcesTrustAction
// ---------------------------------------------------------------------------

describe('sourcesTrustAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls trustSource and prints confirmation', async () => {
    mockCreateSession.mockReturnValue(makeSession());
    mockTrustSource.mockReturnValue(makeConfig());
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { sourcesTrustAction } = await import('../../../src/cli/sources.js');
    const code = await sourcesTrustAction('https://github.com/anthropics/skills');

    expect(code).toBe(0);
    expect(mockTrustSource).toHaveBeenCalledWith(
      expect.anything(),
      'https://github.com/anthropics/skills',
    );
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Trusted');
    stdoutSpy.mockRestore();
  });

  it('exits 1 when trustSource throws (source not found)', async () => {
    mockCreateSession.mockReturnValue(makeSession());
    mockTrustSource.mockImplementation(() => { throw new Error('Source not found'); });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { sourcesTrustAction } = await import('../../../src/cli/sources.js');
    const code = await sourcesTrustAction('https://github.com/unknown/repo');

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Source not found'));
    stderrSpy.mockRestore();
  });
});
