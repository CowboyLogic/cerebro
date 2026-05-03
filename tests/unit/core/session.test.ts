/**
 * Tests for SPEC-0004 — Session
 * Requirement IDs: SES-REQ-0001 through SES-REQ-0009
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock config and manifest modules
// ---------------------------------------------------------------------------
const mockLoadConfig = vi.fn();
const mockSaveConfig = vi.fn();
const mockLoadManifest = vi.fn();
const mockSaveManifest = vi.fn();

vi.mock('../../../src/core/config.js', () => ({
  loadConfig: mockLoadConfig,
  saveConfig: mockSaveConfig,
}));

vi.mock('../../../src/core/manifest.js', () => ({
  loadManifest: mockLoadManifest,
  saveManifest: mockSaveManifest,
}));

// ---------------------------------------------------------------------------
// Mock provider — createProvider returns a stub
// ---------------------------------------------------------------------------
const mockProviderInstance = {
  domain: 'github.com',
  listDirectory: vi.fn(),
  fetchFileContent: vi.fn(),
  downloadDirectory: vi.fn(),
  downloadFile: vi.fn(),
};

vi.mock('../../../src/core/provider.js', () => ({
  createProvider: vi.fn().mockReturnValue(mockProviderInstance),
  UnsupportedProviderError: class UnsupportedProviderError extends Error {},
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
import type { CerebroConfig } from '../../../src/core/config.js';
import type { InstallManifest } from '../../../src/core/manifest.js';

function makeConfig(overrides: Partial<CerebroConfig['defaults']> = {}): CerebroConfig {
  return {
    defaults: overrides,
    sources: [],
    targets: {},
  };
}

function makeManifest(): InstallManifest {
  return { installed: [] };
}

// ---------------------------------------------------------------------------
// SES-REQ-0001: createSession loads config and manifest
// ---------------------------------------------------------------------------
describe('createSession — initialisation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockReturnValue(makeConfig());
    mockLoadManifest.mockReturnValue(makeManifest());
  });

  it('SES-REQ-0001: calls loadConfig() on creation', async () => {
    const { createSession } = await import('../../../src/core/session.js');
    createSession();
    expect(mockLoadConfig).toHaveBeenCalledOnce();
  });

  it('SES-REQ-0001: calls loadManifest() on creation', async () => {
    const { createSession } = await import('../../../src/core/session.js');
    createSession();
    expect(mockLoadManifest).toHaveBeenCalledOnce();
  });

  it('SES-REQ-0001: session.config holds the loaded config', async () => {
    const config = makeConfig({ target: 'claude-code' });
    mockLoadConfig.mockReturnValue(config);

    const { createSession } = await import('../../../src/core/session.js');
    const session = createSession();

    expect(session.config).toBe(config);
  });

  it('SES-REQ-0001: session.manifest holds the loaded manifest', async () => {
    const manifest = makeManifest();
    mockLoadManifest.mockReturnValue(manifest);

    const { createSession } = await import('../../../src/core/session.js');
    const session = createSession();

    expect(session.manifest).toBe(manifest);
  });
});

// ---------------------------------------------------------------------------
// SES-REQ-0002: provider factory exposed via getProvider()
// ---------------------------------------------------------------------------
describe('createSession — provider factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockReturnValue(makeConfig());
    mockLoadManifest.mockReturnValue(makeManifest());
  });

  it('SES-REQ-0002: session.getProvider() returns a provider for a valid URL', async () => {
    const { createSession } = await import('../../../src/core/session.js');
    const session = createSession();
    const provider = session.getProvider('https://github.com/anthropics/skills');
    expect(provider).toBeDefined();
    expect(provider.domain).toBe('github.com');
  });

  it('SES-REQ-0002: getProvider() caches by domain — same instance on second call', async () => {
    const { createSession } = await import('../../../src/core/session.js');
    const session = createSession();
    const a = session.getProvider('https://github.com/anthropics/skills');
    const b = session.getProvider('https://github.com/github/awesome-copilot');
    expect(a).toBe(b); // same domain → cached instance
  });
});

// ---------------------------------------------------------------------------
// SES-REQ-0003 + SES-REQ-0004: pre-population from config.defaults
// ---------------------------------------------------------------------------
describe('createSession — defaults pre-population', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadManifest.mockReturnValue(makeManifest());
  });

  it('SES-REQ-0003: pre-populates session.target from config.defaults.target', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({ target: 'copilot' }));

    const { createSession } = await import('../../../src/core/session.js');
    const session = createSession();

    expect(session.target).toBe('copilot');
  });

  it('SES-REQ-0003: session.target is null when config.defaults.target is not set', async () => {
    mockLoadConfig.mockReturnValue(makeConfig());

    const { createSession } = await import('../../../src/core/session.js');
    const session = createSession();

    expect(session.target).toBeNull();
  });

  it('SES-REQ-0004: pre-populates session.scope from config.defaults.scope', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({ scope: 'user' }));

    const { createSession } = await import('../../../src/core/session.js');
    const session = createSession();

    expect(session.scope).toBe('user');
  });

  it('SES-REQ-0004: session.scope is null when config.defaults.scope is not set', async () => {
    mockLoadConfig.mockReturnValue(makeConfig());

    const { createSession } = await import('../../../src/core/session.js');
    const session = createSession();

    expect(session.scope).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SES-REQ-0005 + SES-REQ-0006: setTarget / setScope persistence
// ---------------------------------------------------------------------------
describe('setTarget / setScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockReturnValue(makeConfig());
    mockLoadManifest.mockReturnValue(makeManifest());
  });

  it('SES-REQ-0005: setTarget updates session.target', async () => {
    const { createSession, setTarget } = await import('../../../src/core/session.js');
    const session = createSession();
    setTarget(session, 'claude-code', false);
    expect(session.target).toBe('claude-code');
  });

  it('SES-REQ-0005: setTarget with persist:true calls saveConfig', async () => {
    const { createSession, setTarget } = await import('../../../src/core/session.js');
    const session = createSession();
    setTarget(session, 'claude-code', true);
    expect(mockSaveConfig).toHaveBeenCalled();
  });

  it('SES-REQ-0005: setTarget with persist:false does NOT call saveConfig', async () => {
    const { createSession, setTarget } = await import('../../../src/core/session.js');
    const session = createSession();
    setTarget(session, 'claude-code', false);
    expect(mockSaveConfig).not.toHaveBeenCalled();
  });

  it('SES-REQ-0006: setScope updates session.scope', async () => {
    const { createSession, setScope } = await import('../../../src/core/session.js');
    const session = createSession();
    setScope(session, 'user', false);
    expect(session.scope).toBe('user');
  });

  it('SES-REQ-0006: setScope with persist:true calls saveConfig', async () => {
    const { createSession, setScope } = await import('../../../src/core/session.js');
    const session = createSession();
    setScope(session, 'workspace', true);
    expect(mockSaveConfig).toHaveBeenCalled();
  });

  it('SES-REQ-0006: setScope with persist:false does NOT call saveConfig', async () => {
    const { createSession, setScope } = await import('../../../src/core/session.js');
    const session = createSession();
    setScope(session, 'workspace', false);
    expect(mockSaveConfig).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SES-REQ-0007: catalog cache
// ---------------------------------------------------------------------------
describe('catalog cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockReturnValue(makeConfig());
    mockLoadManifest.mockReturnValue(makeManifest());
  });

  it('SES-REQ-0007: getCachedCatalog returns null when repo not yet fetched', async () => {
    const { createSession, getCachedCatalog } = await import('../../../src/core/session.js');
    const session = createSession();
    const result = getCachedCatalog(session, 'anthropics', 'skills');
    expect(result).toBeNull();
  });

  it('SES-REQ-0007: getCachedCatalog returns stored result after cacheCatalog', async () => {
    const { createSession, cacheCatalog, getCachedCatalog } = await import(
      '../../../src/core/session.js'
    );
    const session = createSession();
    const fakeResult = { source: 'heuristic' as const, artifacts: [] };
    cacheCatalog(session, 'anthropics', 'skills', fakeResult);
    const cached = getCachedCatalog(session, 'anthropics', 'skills');
    expect(cached).toBe(fakeResult);
  });

  it('SES-REQ-0007: getCachedCatalog for different repo returns null', async () => {
    const { createSession, cacheCatalog, getCachedCatalog } = await import(
      '../../../src/core/session.js'
    );
    const session = createSession();
    cacheCatalog(session, 'anthropics', 'skills', { source: 'heuristic', artifacts: [] });
    const result = getCachedCatalog(session, 'github', 'awesome-copilot');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SES-REQ-0008: no disk writes except via saveConfig / saveManifest
// ---------------------------------------------------------------------------
describe('updateManifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockReturnValue(makeConfig());
    mockLoadManifest.mockReturnValue(makeManifest());
  });

  it('SES-REQ-0008: updateManifest updates in-memory manifest without saving to disk', async () => {
    const { createSession, updateManifest } = await import('../../../src/core/session.js');
    const session = createSession();
    const newManifest = makeManifest();
    updateManifest(session, newManifest);

    expect(session.manifest).toBe(newManifest);
    // No disk write should happen from updateManifest itself
    expect(mockSaveManifest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SES-REQ-0009: single session per process (modules must not hold global state)
// ---------------------------------------------------------------------------
describe('session isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockReturnValue(makeConfig());
    mockLoadManifest.mockReturnValue(makeManifest());
  });

  it('SES-REQ-0009: two createSession() calls produce independent session objects', async () => {
    const { createSession, setTarget } = await import('../../../src/core/session.js');
    const s1 = createSession();
    const s2 = createSession();

    setTarget(s1, 'claude-code', false);

    // s2 must not be affected by a mutation to s1
    expect(s2.target).toBeNull();
  });
});
