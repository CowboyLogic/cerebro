/**
 * Tests for SPEC-0007 / SPEC-0008 — runTui() entry point
 *
 * TUI-REQ-0017: runTui renders with altScreen:true so the terminal is fully
 *               restored on exit (like vim / less).
 * TUI-REQ-0018: pageSize is read from config.defaults.ui.pageSize and passed
 *               to Page_SIZE fallback (10) when not configured.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ---------------------------------------------------------------------------
// Mutable session stub — tests mutate .config between cases
// ---------------------------------------------------------------------------

const mockSession = {
  config: {
    defaults: {} as Record<string, unknown>,
    sources: [],
    targets: {},
  },
  manifest: { installed: [] },
  getProvider: vi.fn(),
  target: null,
  scope: null,
  catalogCache: new Map(),
};

// ---------------------------------------------------------------------------
// ink mock — capture render() call args; never actually render the component
// vi.hoisted() ensures these variables are available inside the hoisted factory
// ---------------------------------------------------------------------------

const { mockWaitUntilExit, mockRender } = vi.hoisted(() => ({
  mockWaitUntilExit: vi.fn(),
  mockRender: vi.fn(),
}));

vi.mock('ink', () => ({
  render: mockRender,
  Box: 'div',
  Text: 'span',
  useApp: () => ({ exit: vi.fn() }),
  useInput: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Core module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../src/core/session.js', () => ({
  createSession: () => mockSession,
  setTarget: vi.fn(),
  setScope: vi.fn(),
}));

vi.mock('../../../src/core/config.js', () => ({
  ConfigParseError: class ConfigParseError extends Error {},
  trustSource: vi.fn(),
  addSource: vi.fn(),
  resolveInstallBase: vi.fn().mockReturnValue('/tmp/install'),
}));

vi.mock('../../../src/core/manifest.js', () => ({
  ManifestParseError: class ManifestParseError extends Error {},
  getArtifactStatus: vi.fn().mockReturnValue('available'),
}));

vi.mock('../../../src/core/catalog.js', () => ({
  fetchCatalog: vi.fn().mockRejectedValue(new Error('not reached')),
}));

vi.mock('../../../src/core/installer.js', () => ({
  installArtifact: vi.fn(),
}));

vi.mock('../../../src/core/provider.js', () => ({
  VERSION: '0.1.0',
  parseRepoUrl: vi.fn(),
  resolveGitHubTokenSource: vi.fn().mockReturnValue('none'),
}));

// ---------------------------------------------------------------------------
// Import runTui after mocks are in place
// ---------------------------------------------------------------------------

import { runTui } from '../../../src/tui/app.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runTui', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWaitUntilExit.mockResolvedValue(undefined);
    mockRender.mockReturnValue({ waitUntilExit: mockWaitUntilExit });
    mockSession.config = { defaults: {}, sources: [], targets: {} };
  });

  // ── TUI-REQ-0017: altScreen ────────────────────────────────────────────────

  it('TUI-REQ-0017: writes ANSI enter-alt-screen before render and exit-alt-screen after', async () => {
    const writes: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    });

    await runTui();

    writeSpy.mockRestore();
    expect(writes[0]).toBe('\x1b[?1049h\x1b[H');
    expect(writes[writes.length - 1]).toBe('\x1b[?1049l');
  });

  // ── TUI-REQ-0018: pageSize from config ────────────────────────────────────

  it('TUI-REQ-0018: passes pageSize from config defaults.ui.pageSize to App', async () => {
    mockSession.config.defaults = { ui: { pageSize: 7 } };
    await runTui();
    const [appElement] = mockRender.mock.calls[0];
    expect(appElement.props.pageSize).toBe(7);
  });

  it('TUI-REQ-0018: falls back to PAGE_SIZE (10) when config does not set pageSize', async () => {
    mockSession.config.defaults = {};
    await runTui();
    const [appElement] = mockRender.mock.calls[0];
    expect(appElement.props.pageSize).toBe(10);
  });
});
