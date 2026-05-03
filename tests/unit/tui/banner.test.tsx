/**
 * Tests for SPEC-0007 — <Banner> component
 * Requirement IDs: TUI-REQ-0020 through TUI-REQ-0025
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import type { Session } from '../../../src/core/session.js';
import type { CerebroConfig, SourceEntry } from '../../../src/core/config.js';
import type { InstallManifest } from '../../../src/core/manifest.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../src/core/provider.js', () => ({
  VERSION: '0.1.0',
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSession(configOverrides?: Partial<CerebroConfig>): Session {
  const config: CerebroConfig = {
    defaults: { target: 'claude-code', scope: 'workspace' },
    sources: [
      { name: 'acme/skills',    url: 'https://github.com/acme/skills',    enabled: true,  trusted: true  } as SourceEntry,
      { name: 'other/tools',    url: 'https://github.com/other/tools',    enabled: true,  trusted: true  } as SourceEntry,
      { name: 'disabled/repo',  url: 'https://github.com/disabled/repo',  enabled: false, trusted: false } as SourceEntry,
    ],
    targets: {},
    ...configOverrides,
  };
  const manifest: InstallManifest = { installed: [] };
  return {
    config,
    manifest,
    getProvider: vi.fn().mockImplementation(() => { throw new Error('not used by Banner'); }),
    target: null,
    scope: null,
    catalogCache: new Map(),
  } as unknown as Session;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { Banner } from '../../../src/tui/banner.js';

describe('<Banner>', () => {
  // ── TUI-REQ-0021: left pane — 6 rows of ASCII art ───────────────────────

  it('TUI-REQ-0021: renders ASCII art block characters (row 1 — top cap)', () => {
    const { lastFrame } = render(<Banner session={makeSession()} authSource="none" />);
    // Row 1 of every letter contains '██████╗' (top of block letters)
    expect(lastFrame()).toContain('██████╗');
  });

  it('TUI-REQ-0021: renders ASCII art block characters (row 6 — bottom cap)', () => {
    const { lastFrame } = render(<Banner session={makeSession()} authSource="none" />);
    // Row 6 of C glyph ends with '╚═════╝'
    expect(lastFrame()).toContain('╚═════╝');
  });

  // ── TUI-REQ-0022: right pane content ────────────────────────────────────

  it('TUI-REQ-0022: renders tagline', () => {
    const { lastFrame } = render(<Banner session={makeSession()} authSource="none" />);
    expect(lastFrame()).toContain('Install AI skills & agents into your IDE');
  });

  it('TUI-REQ-0022: renders Version label', () => {
    const { lastFrame } = render(<Banner session={makeSession()} authSource="none" />);
    expect(lastFrame()).toContain('Version:');
    expect(lastFrame()).toContain('0.1.0');
  });

  it('TUI-REQ-0022: renders Auth label', () => {
    const { lastFrame } = render(<Banner session={makeSession()} authSource="none" />);
    expect(lastFrame()).toContain('Auth:');
  });

  it('TUI-REQ-0022: renders Sources label with enabled count', () => {
    const session = makeSession(); // 2 enabled, 1 disabled
    const { lastFrame } = render(<Banner session={session} authSource="none" />);
    expect(lastFrame()).toContain('Sources:');
    expect(lastFrame()).toContain('2 enabled');
  });

  it('TUI-REQ-0022: renders Default label with target and scope when set', () => {
    const session = makeSession({ defaults: { target: 'claude-code', scope: 'workspace' } });
    const { lastFrame } = render(<Banner session={session} authSource="none" />);
    expect(lastFrame()).toContain('Default:');
    expect(lastFrame()).toContain('claude-code');
    expect(lastFrame()).toContain('workspace');
  });

  it('TUI-REQ-0022: renders "not set" when no defaults configured', () => {
    const session = makeSession({ defaults: {} });
    const { lastFrame } = render(<Banner session={session} authSource="none" />);
    expect(lastFrame()).toContain('Default:');
    expect(lastFrame()).toContain('not set');
  });

  // ── TUI-REQ-0023: auth source label — no token value ────────────────────

  it('TUI-REQ-0023: displays GITHUB_TOKEN label', () => {
    const { lastFrame } = render(<Banner session={makeSession()} authSource="GITHUB_TOKEN" />);
    expect(lastFrame()).toContain('GITHUB_TOKEN');
  });

  it('TUI-REQ-0023: displays GH_TOKEN label', () => {
    const { lastFrame } = render(<Banner session={makeSession()} authSource="GH_TOKEN" />);
    expect(lastFrame()).toContain('GH_TOKEN');
  });

  it('TUI-REQ-0023: displays gh CLI label', () => {
    const { lastFrame } = render(<Banner session={makeSession()} authSource="gh CLI" />);
    expect(lastFrame()).toContain('gh CLI');
  });

  it('TUI-REQ-0023: displays none label', () => {
    const { lastFrame } = render(<Banner session={makeSession()} authSource="none" />);
    expect(lastFrame()).toContain('none');
  });
});
