/**
 * Tests for SPEC-0010 — Session Catalog Cache (app.tsx)
 * Requirement IDs: CACHE-REQ-0001 through CACHE-REQ-0005
 *
 * provider.js is mocked here (TUI tests only need parseRepoUrl stub).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import type { Session } from '../../../src/core/session.js';
import type { CerebroConfig, SourceEntry } from '../../../src/core/config.js';
import type { InstallManifest } from '../../../src/core/manifest.js';
import type { CatalogResult } from '../../../src/core/catalog.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetchCatalog = vi.fn();
vi.mock('../../../src/core/catalog.js', () => ({
  fetchCatalog: (...args: unknown[]) => mockFetchCatalog(...args),
}));

vi.mock('../../../src/core/config.js', () => ({
  trustSource: vi.fn().mockImplementation(() => { throw new Error('not found'); }),
  addSource: vi.fn().mockImplementation((cfg: CerebroConfig, entry: SourceEntry) => ({
    ...cfg,
    sources: [...cfg.sources, entry],
  })),
  resolveInstallBase: vi.fn().mockReturnValue('/tmp/install'),
}));

vi.mock('../../../src/core/session.js', () => ({
  setTarget: vi.fn(),
  setScope: vi.fn(),
}));

vi.mock('../../../src/core/manifest.js', () => ({
  getArtifactStatus: vi.fn().mockReturnValue('available'),
}));

vi.mock('../../../src/core/installer.js', () => ({
  installArtifact: vi.fn(),
}));

vi.mock('../../../src/core/provider.js', () => ({
  VERSION: '0.1.0',
  parseRepoUrl: vi.fn((url: string) => {
    const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)/.exec(url);
    if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
    return { owner: match[1], repo: match[2] };
  }),
  resolveGitHubToken: vi.fn().mockReturnValue(undefined),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedSource: SourceEntry = {
  name: 'acme/skills',
  url: 'https://github.com/acme/skills',
  enabled: true,
  trusted: true,
};

const catalogResult: CatalogResult = {
  source: 'catalog',
  artifacts: [{ id: 'git-commit', name: 'Git Commit', type: 'skill', source: 'skills/git-commit' }],
};

function makeSession(overrides?: Partial<Session>): Session {
  const config: CerebroConfig = {
    defaults: {},
    sources: [trustedSource],
    targets: {},
  };
  const manifest: InstallManifest = { installed: [] };
  return {
    config,
    manifest,
    getProvider: vi.fn().mockReturnValue({
      domain: 'github.com',
      listDirectory: vi.fn().mockResolvedValue([]),
      fetchFileContent: vi.fn(),
      downloadDirectory: vi.fn(),
      downloadFile: vi.fn(),
    }),
    target: null,
    scope: null,
    catalogCache: new Map(),
    ...overrides,
  };
}

import { App } from '../../../src/tui/app.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('App — catalog cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CACHE-REQ-0001/0002: uses cached result and does not call fetchCatalog on second source selection', async () => {
    mockFetchCatalog.mockResolvedValue(catalogResult);

    const session = makeSession();
    const { stdin } = render(<App session={session} />);

    // First selection — cache miss, network call expected
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);

    // Escape back to repo-list
    stdin.write('\x1B');
    await new Promise((r) => setTimeout(r, 50));

    // Second selection of the same source — should hit cache
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1); // still 1 — cache hit
  });

  it('CACHE-REQ-0003: writes to catalogCache on successful fetch', async () => {
    mockFetchCatalog.mockResolvedValue(catalogResult);

    const session = makeSession();
    const { stdin } = render(<App session={session} />);

    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    expect(session.catalogCache.has(trustedSource.url)).toBe(true);
    expect(session.catalogCache.get(trustedSource.url)).toBe(catalogResult);
  });

  it('CACHE-REQ-0004: does not write to catalogCache when fetchCatalog fails', async () => {
    mockFetchCatalog.mockRejectedValue(new Error('Network error'));

    const session = makeSession();
    const { stdin } = render(<App session={session} />);

    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    expect(session.catalogCache.has(trustedSource.url)).toBe(false);
  });

  it('CACHE-REQ-0002: a pre-populated cache is used immediately (zero fetchCatalog calls)', async () => {
    const session = makeSession();
    session.catalogCache.set(trustedSource.url, catalogResult);

    const { stdin } = render(<App session={session} />);
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetchCatalog).not.toHaveBeenCalled();
  });
});
