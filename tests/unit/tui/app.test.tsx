/**
 * Tests for SPEC-0007 — TUI App component
 *
 * Covers the bug fix: when fetchCatalog throws, the App must navigate back to
 * 'repo-list' (not 'type-menu') so a useInput handler remains active and Ink
 * does not exit prematurely.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import type { Session } from '../../../src/core/session.js';
import type { CerebroConfig, SourceEntry } from '../../../src/core/config.js';
import type { InstallManifest } from '../../../src/core/manifest.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetchCatalog = vi.fn();
vi.mock('../../../src/core/catalog.js', () => ({
  fetchCatalog: (...args: unknown[]) => mockFetchCatalog(...args),
}));

vi.mock('../../../src/core/config.js', () => ({
  trustSource: vi.fn().mockImplementation((_cfg: unknown, _url: string) => {
    throw new Error('Source not found');
  }),
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

vi.mock('../../../src/core/provider.js', () => ({
  parseRepoUrl: vi.fn((url: string) => {
    const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)/.exec(url);
    if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
    return { owner: match[1], repo: match[2] };
  }),
}));

vi.mock('../../../src/core/manifest.js', () => ({
  getArtifactStatus: vi.fn().mockReturnValue('available'),
}));

vi.mock('../../../src/core/installer.js', () => ({
  installArtifact: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const source: SourceEntry = {
  name: 'acme/skills',
  url: 'https://github.com/acme/skills',
  enabled: true,
  trusted: true, // pre-trusted so trust-warning is skipped
};

function makeSession(): Session {
  const config: CerebroConfig = {
    defaults: {},
    sources: [source],
    targets: {},
  };
  const manifest: InstallManifest = { installed: [] };
  const mockProvider = {
    domain: 'github.com',
    listDirectory: vi.fn().mockResolvedValue([]),
    fetchFileContent: vi.fn(),
    downloadDirectory: vi.fn(),
    downloadFile: vi.fn(),
  };

  return {
    config,
    manifest,
    getProvider: vi.fn().mockReturnValue(mockProvider),
    target: null,
    scope: null,
    catalogCache: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { App } from '../../../src/tui/app.js';

describe('App — catalog fetch error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns to repo-list and shows error when fetchCatalog rejects', async () => {
    const networkError = new Error('Unable to reach github.com. Check your internet connection.');
    mockFetchCatalog.mockRejectedValue(networkError);

    const session = makeSession();
    const { lastFrame, stdin } = render(<App session={session} />);

    // Initial state: repo-list is shown
    expect(lastFrame()).toContain('acme/skills');

    // User selects the trusted source (Enter on cursor=0)
    stdin.write('\r');

    // Wait for async state update (fetchCatalog rejection → setState)
    await new Promise((r) => setTimeout(r, 50));

    // After the error, the app must be back on repo-list (not silently exited)
    // and the error message must be visible
    expect(lastFrame()).toContain('acme/skills');
    expect(lastFrame()).toContain('Unable to reach github.com');
  });

  it('stays on repo-list (useInput active) after catalog fetch failure', async () => {
    mockFetchCatalog.mockRejectedValue(new Error('Rate limit reached.'));

    const session = makeSession();
    const { lastFrame, stdin } = render(<App session={session} />);

    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    // repo-list screen must be visible — meaning a useInput handler is active
    // (if Ink had exited, the frame would be empty or unchanged)
    expect(lastFrame()).toContain('Select a source repository');
  });
});
