/**
 * Tests for SPEC-0009 — MCP Mode
 * Requirement IDs: MCP-REQ-0001 through MCP-REQ-0015
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '../../../src/core/session.js';
import type { CerebroConfig, SourceEntry } from '../../../src/core/config.js';
import type { InstallManifest } from '../../../src/core/manifest.js';
import type { SourceProvider } from '../../../src/core/provider.js';
import type { Artifact } from '@cowboylogic/cerebro-schema';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports of the module under test
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Hoisted mock factories — must be created before vi.mock() calls are hoisted
// ---------------------------------------------------------------------------

const {
  mockCreateSession,
  mockFetchCatalog,
  mockInstallArtifact,
  mockAddSource,
  mockTrustSource,
  mockResolveInstallBase,
  mockGetArtifactStatus,
  mockParseRepoUrl,
  mockRegisterTool,
  mockConnect,
  MockMcpServer,
  MockStdioServerTransport,
} = vi.hoisted(() => {
  const mockRegisterTool = vi.fn();
  const mockConnect = vi.fn();
  const mockMcpServerInstance = { registerTool: mockRegisterTool, connect: mockConnect };
  // Must use a named regular function (not arrow) so it is newable as a constructor.
  // When a constructor returns an object, `new` yields that object — so all tests
  // share the same mockMcpServerInstance and can inspect registerTool/connect calls.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockMcpServer = vi.fn(function MockMcpServer(this: any) { return mockMcpServerInstance; });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockStdioServerTransport = vi.fn(function MockStdioServerTransport(this: any) { return {}; });
  return {
    mockCreateSession: vi.fn(),
    mockFetchCatalog: vi.fn(),
    mockInstallArtifact: vi.fn(),
    mockAddSource: vi.fn(),
    mockTrustSource: vi.fn(),
    mockResolveInstallBase: vi.fn(),
    mockGetArtifactStatus: vi.fn(),
    mockParseRepoUrl: vi.fn(),
    mockRegisterTool,
    mockConnect,
    MockMcpServer,
    MockStdioServerTransport,
  };
});

vi.mock('../../../src/core/session.js', () => ({
  createSession: mockCreateSession,
}));

vi.mock('../../../src/core/catalog.js', () => ({
  fetchCatalog: mockFetchCatalog,
}));

vi.mock('../../../src/core/installer.js', () => ({
  installArtifact: mockInstallArtifact,
}));

vi.mock('../../../src/core/config.js', () => ({
  addSource: mockAddSource,
  trustSource: mockTrustSource,
  resolveInstallBase: mockResolveInstallBase,
  ConfigParseError: class ConfigParseError extends Error {
    constructor(msg = 'bad config') { super(msg); this.name = 'ConfigParseError'; }
  },
}));

vi.mock('../../../src/core/manifest.js', () => ({
  getArtifactStatus: mockGetArtifactStatus,
  ManifestParseError: class ManifestParseError extends Error {
    constructor(msg = 'bad manifest') { super(msg); this.name = 'ManifestParseError'; }
  },
}));

vi.mock('../../../src/core/provider.js', () => ({
  parseRepoUrl: mockParseRepoUrl,
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: MockMcpServer,
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: MockStdioServerTransport,
}));

// ---------------------------------------------------------------------------
// Test helpers
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

function makeSource(overrides: Partial<SourceEntry> = {}): SourceEntry {
  return {
    name: 'anthropic-skills',
    url: 'https://github.com/anthropics/skills',
    enabled: true,
    trusted: false,
    ...overrides,
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
const TRUSTED_SOURCE = makeSource({ trusted: true });

// ---------------------------------------------------------------------------
// Capture tool handlers registered by runMcpServer()
// ---------------------------------------------------------------------------

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

async function loadServerAndGetTools(): Promise<Record<string, ToolHandler>> {
  const handlers: Record<string, ToolHandler> = {};
  mockRegisterTool.mockImplementation(
    (name: string, _config: unknown, handler: ToolHandler) => {
      handlers[name] = handler;
    },
  );
  mockConnect.mockResolvedValue(undefined);

  // Reset module cache so mocks take effect on fresh import
  const { runMcpServer } = await import('../../../src/mcp/server.js');
  await runMcpServer();

  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runMcpServer — MCP-REQ-0008: startup error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockConnect.mockResolvedValue(undefined);
  });

  it('exits 1 on ConfigParseError from createSession', async () => {
    const { ConfigParseError } = await import('../../../src/core/config.js');
    mockCreateSession.mockImplementation(() => {
      throw new ConfigParseError('bad config');
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error('exit'); });

    const { runMcpServer } = await import('../../../src/mcp/server.js');
    await expect(runMcpServer()).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Startup error'));
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits 1 on ManifestParseError from createSession', async () => {
    const { ManifestParseError } = await import('../../../src/core/manifest.js');
    mockCreateSession.mockImplementation(() => {
      throw new ManifestParseError('bad manifest');
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error('exit'); });

    const { runMcpServer } = await import('../../../src/mcp/server.js');
    await expect(runMcpServer()).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe('runMcpServer — MCP-REQ-0002: StdioServerTransport + McpServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCreateSession.mockReturnValue(makeSession());
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockConnect.mockResolvedValue(undefined);
  });

  it('constructs McpServer with package name and version', async () => {
    mockRegisterTool.mockImplementation(() => {});
    const { runMcpServer } = await import('../../../src/mcp/server.js');
    await runMcpServer();

    expect(MockMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'cerebro', version: '0.1.0' }),
    );
  });

  it('creates StdioServerTransport and calls connect', async () => {
    mockRegisterTool.mockImplementation(() => {});
    const { runMcpServer } = await import('../../../src/mcp/server.js');
    await runMcpServer();

    expect(MockStdioServerTransport).toHaveBeenCalled();
    expect(mockConnect).toHaveBeenCalledWith(expect.any(Object));
  });

  it('registers all 5 tools', async () => {
    mockRegisterTool.mockImplementation(() => {});
    const { runMcpServer } = await import('../../../src/mcp/server.js');
    await runMcpServer();

    const registeredNames = mockRegisterTool.mock.calls.map((c) => c[0]);
    expect(registeredNames).toContain('list_sources');
    expect(registeredNames).toContain('list_artifacts');
    expect(registeredNames).toContain('get_artifact_status');
    expect(registeredNames).toContain('install_artifact');
    expect(registeredNames).toContain('add_source');
  });
});

describe('tool: list_sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockConnect.mockResolvedValue(undefined);
  });

  it('returns all configured sources', async () => {
    const session = makeSession({
      config: makeConfig({
        sources: [TRUSTED_SOURCE, makeSource({ url: 'https://github.com/other/repo', trusted: false })],
      }),
    });
    mockCreateSession.mockReturnValue(session);
    const tools = await loadServerAndGetTools();

    const result = await tools['list_sources']({}) as { content: [{ text: string }] };
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.sources).toHaveLength(2);
    expect(parsed.sources[0].url).toBe(SOURCE_URL);
    expect(parsed.sources[0].trusted).toBe(true);
  });
});

describe('tool: list_artifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockConnect.mockResolvedValue(undefined);
  });

  it('MCP-REQ-0011: returns catalog artifacts', async () => {
    const session = makeSession({ config: makeConfig({ sources: [TRUSTED_SOURCE] }) });
    mockCreateSession.mockReturnValue(session);
    const artifact = makeArtifact();
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [artifact] });

    const tools = await loadServerAndGetTools();
    const result = await tools['list_artifacts']({ source_url: SOURCE_URL }) as { content: [{ text: string }] };
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.source).toBe('catalog');
    expect(parsed.total).toBe(1);
    expect(parsed.artifacts[0].id).toBe('git-commit-assistant');
  });

  it('MCP-REQ-0011: applies type and filter params to fetchCatalog', async () => {
    const session = makeSession({ config: makeConfig({ sources: [TRUSTED_SOURCE] }) });
    mockCreateSession.mockReturnValue(session);
    mockFetchCatalog.mockResolvedValue({ source: 'heuristic', artifacts: [] });

    const tools = await loadServerAndGetTools();
    await tools['list_artifacts']({ source_url: SOURCE_URL, type: 'skill', filter: 'git' });

    expect(mockFetchCatalog).toHaveBeenCalledWith(
      expect.anything(),
      'anthropics',
      'skills',
      expect.objectContaining({ type: 'skill', keyword: 'git' }),
    );
  });

  it('returns error content on network failure', async () => {
    const session = makeSession({ config: makeConfig({ sources: [TRUSTED_SOURCE] }) });
    mockCreateSession.mockReturnValue(session);
    mockFetchCatalog.mockRejectedValue(new Error('rate limited'));

    const tools = await loadServerAndGetTools();
    const result = await tools['list_artifacts']({ source_url: SOURCE_URL }) as { isError: boolean; content: [{ text: string }] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('rate limited');
  });
});

describe('tool: get_artifact_status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockConnect.mockResolvedValue(undefined);
  });

  it('MCP-REQ-0012: returns installed status', async () => {
    const session = makeSession({ config: makeConfig({ sources: [TRUSTED_SOURCE] }) });
    mockCreateSession.mockReturnValue(session);
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [makeArtifact()] });
    mockResolveInstallBase.mockReturnValue('/home/user/.claude/commands');
    mockGetArtifactStatus.mockReturnValue('installed');

    const tools = await loadServerAndGetTools();
    const result = await tools['get_artifact_status']({
      source_url: SOURCE_URL,
      artifact_id: 'git-commit-assistant',
      target: 'claude-code',
      scope: 'workspace',
    }) as { content: [{ text: string }] };
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe('installed');
    expect(parsed.artifact_id).toBe('git-commit-assistant');
  });

  it('returns error content when artifact not found', async () => {
    const session = makeSession({ config: makeConfig({ sources: [TRUSTED_SOURCE] }) });
    mockCreateSession.mockReturnValue(session);
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [] });

    const tools = await loadServerAndGetTools();
    const result = await tools['get_artifact_status']({
      source_url: SOURCE_URL,
      artifact_id: 'missing',
      target: 'claude-code',
      scope: 'workspace',
    }) as { isError: boolean; content: [{ text: string }] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("'missing' not found");
  });
});

describe('tool: install_artifact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockConnect.mockResolvedValue(undefined);
  });

  it('MCP-REQ-0005: returns trust_required when source not trusted and trust=false', async () => {
    const session = makeSession({
      config: makeConfig({ sources: [makeSource({ trusted: false })] }),
    });
    mockCreateSession.mockReturnValue(session);

    const tools = await loadServerAndGetTools();
    const result = await tools['install_artifact']({
      source_url: SOURCE_URL,
      artifact_id: 'git-commit-assistant',
      target: 'claude-code',
      scope: 'workspace',
      trust: false,
      overwrite: false,
    }) as { content: [{ text: string }] };
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe('trust_required');
    expect(parsed.source_url).toBe(SOURCE_URL);
    expect(mockInstallArtifact).not.toHaveBeenCalled();
  });

  it('MCP-REQ-0005: returns trust_required when source not in config and trust=false', async () => {
    const session = makeSession({ config: makeConfig({ sources: [] }) });
    mockCreateSession.mockReturnValue(session);

    const tools = await loadServerAndGetTools();
    const result = await tools['install_artifact']({
      source_url: SOURCE_URL,
      artifact_id: 'git-commit-assistant',
      target: 'claude-code',
      scope: 'workspace',
      trust: false,
      overwrite: false,
    }) as { content: [{ text: string }] };
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe('trust_required');
    expect(mockInstallArtifact).not.toHaveBeenCalled();
  });

  it('MCP-REQ-0006: calls trustSource and saves config when trust=true and source exists untrusted', async () => {
    const session = makeSession({
      config: makeConfig({ sources: [makeSource({ trusted: false })] }),
    });
    mockCreateSession.mockReturnValue(session);
    const trustedConfig = makeConfig({ sources: [TRUSTED_SOURCE] });
    mockTrustSource.mockReturnValue(trustedConfig);
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [makeArtifact()] });
    mockInstallArtifact.mockResolvedValue({ status: 'success', installedPath: '/some/path' });

    const tools = await loadServerAndGetTools();
    await tools['install_artifact']({
      source_url: SOURCE_URL,
      artifact_id: 'git-commit-assistant',
      target: 'claude-code',
      scope: 'workspace',
      trust: true,
      overwrite: false,
    });

    expect(mockTrustSource).toHaveBeenCalledWith(expect.anything(), SOURCE_URL);
  });

  it('MCP-REQ-0006: calls addSource with trusted=true when source not in config and trust=true', async () => {
    const session = makeSession({ config: makeConfig({ sources: [] }) });
    mockCreateSession.mockReturnValue(session);
    const trustedConfig = makeConfig({ sources: [TRUSTED_SOURCE] });
    mockAddSource.mockReturnValue(trustedConfig);
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [makeArtifact()] });
    mockInstallArtifact.mockResolvedValue({ status: 'success', installedPath: '/some/path' });

    const tools = await loadServerAndGetTools();
    await tools['install_artifact']({
      source_url: SOURCE_URL,
      artifact_id: 'git-commit-assistant',
      target: 'claude-code',
      scope: 'workspace',
      trust: true,
      overwrite: false,
    });

    expect(mockAddSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ url: SOURCE_URL, trusted: true }),
    );
  });

  it('returns success response on successful install', async () => {
    const session = makeSession({
      config: makeConfig({ sources: [TRUSTED_SOURCE] }),
    });
    mockCreateSession.mockReturnValue(session);
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [makeArtifact()] });
    mockInstallArtifact.mockResolvedValue({
      status: 'success',
      installedPath: '/home/user/.claude/commands/git-commit-assistant',
    });

    const tools = await loadServerAndGetTools();
    const result = await tools['install_artifact']({
      source_url: SOURCE_URL,
      artifact_id: 'git-commit-assistant',
      target: 'claude-code',
      scope: 'workspace',
      trust: false,
      overwrite: false,
    }) as { content: [{ text: string }] };
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe('success');
    expect(parsed.artifact_id).toBe('git-commit-assistant');
    expect(parsed.installed_path).toContain('git-commit-assistant');
  });

  it('returns skipped response when artifact already exists', async () => {
    const session = makeSession({
      config: makeConfig({ sources: [TRUSTED_SOURCE] }),
    });
    mockCreateSession.mockReturnValue(session);
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [makeArtifact()] });
    mockInstallArtifact.mockResolvedValue({ status: 'skipped', reason: 'exists' });
    mockResolveInstallBase.mockReturnValue('/home/user/.claude/commands');

    const tools = await loadServerAndGetTools();
    const result = await tools['install_artifact']({
      source_url: SOURCE_URL,
      artifact_id: 'git-commit-assistant',
      target: 'claude-code',
      scope: 'workspace',
      trust: false,
      overwrite: false,
    }) as { content: [{ text: string }] };
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe('skipped');
    expect(parsed.reason).toBe('exists');
    expect(parsed.message).toContain('overwrite: true');
  });

  it('MCP-REQ-0015: returns isError=true on install error', async () => {
    const session = makeSession({
      config: makeConfig({ sources: [TRUSTED_SOURCE] }),
    });
    mockCreateSession.mockReturnValue(session);
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [makeArtifact()] });
    mockInstallArtifact.mockResolvedValue({ status: 'error', message: 'write failed' });

    const tools = await loadServerAndGetTools();
    const result = await tools['install_artifact']({
      source_url: SOURCE_URL,
      artifact_id: 'git-commit-assistant',
      target: 'claude-code',
      scope: 'workspace',
      trust: false,
      overwrite: false,
    }) as { isError: boolean; content: [{ text: string }] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('write failed');
  });

  it('returns error when artifact not found in catalog', async () => {
    const session = makeSession({
      config: makeConfig({ sources: [TRUSTED_SOURCE] }),
    });
    mockCreateSession.mockReturnValue(session);
    mockFetchCatalog.mockResolvedValue({ source: 'catalog', artifacts: [] });

    const tools = await loadServerAndGetTools();
    const result = await tools['install_artifact']({
      source_url: SOURCE_URL,
      artifact_id: 'missing-id',
      target: 'claude-code',
      scope: 'workspace',
      trust: false,
      overwrite: false,
    }) as { isError: boolean; content: [{ text: string }] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("'missing-id' not found");
  });
});

describe('tool: add_source', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockParseRepoUrl.mockReturnValue({ owner: 'anthropics', repo: 'skills' });
    mockConnect.mockResolvedValue(undefined);
  });

  it('adds a source without trust by default', async () => {
    const session = makeSession({ config: makeConfig({ sources: [] }) });
    mockCreateSession.mockReturnValue(session);
    const updatedConfig = makeConfig({ sources: [makeSource({ trusted: false })] });
    mockAddSource.mockReturnValue(updatedConfig);

    const tools = await loadServerAndGetTools();
    const result = await tools['add_source']({
      url: SOURCE_URL,
      trust: false,
    }) as { content: [{ text: string }] };
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe('added');
    expect(mockAddSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ url: SOURCE_URL, trusted: false }),
    );
  });

  it('adds a source with trust=true', async () => {
    const session = makeSession({ config: makeConfig({ sources: [] }) });
    mockCreateSession.mockReturnValue(session);
    const updatedConfig = makeConfig({ sources: [TRUSTED_SOURCE] });
    mockAddSource.mockReturnValue(updatedConfig);

    const tools = await loadServerAndGetTools();
    const result = await tools['add_source']({
      url: SOURCE_URL,
      trust: true,
    }) as { content: [{ text: string }] };
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe('added');
    expect(mockAddSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ url: SOURCE_URL, trusted: true }),
    );
  });

  it('uses provided name as display name', async () => {
    const session = makeSession({ config: makeConfig({ sources: [] }) });
    mockCreateSession.mockReturnValue(session);
    mockAddSource.mockImplementation((_c, e) =>
      makeConfig({ sources: [e] }),
    );

    const tools = await loadServerAndGetTools();
    await tools['add_source']({ url: SOURCE_URL, name: 'my-skills', trust: false });

    expect(mockAddSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'my-skills' }),
    );
  });

  it('returns error content on invalid URL', async () => {
    mockParseRepoUrl.mockImplementation(() => { throw new Error('Invalid URL'); });
    const session = makeSession({ config: makeConfig({ sources: [] }) });
    mockCreateSession.mockReturnValue(session);

    const tools = await loadServerAndGetTools();
    const result = await tools['add_source']({ url: 'not-a-url', trust: false }) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
