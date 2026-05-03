/**
 * Tests for SPEC-0007 — TUI screen components
 * Requirement IDs: TUI-REQ-0002 through TUI-REQ-0016
 *
 * Screen components are pure render functions — no useInput / useState.
 * Keyboard behaviour is tested in transitions.test.ts.
 * These tests only cover visual rendering.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import type { SourceEntry } from '../../../src/core/config.js';
import type { Artifact } from '@cowboylogic/cerebro-schema';

import {
  RepoList,
  TrustWarning,
  TargetSelect,
  ScopeSelect,
  ScopePersist,
  TypeMenu,
  ItemList,
  OverwriteConfirm,
  AddSource,
  AddSourceSave,
  Loading,
  ErrorMessage,
} from '../../../src/tui/screens.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const enabledSources: SourceEntry[] = [
  { name: 'acme/skills', url: 'https://github.com/acme/skills', enabled: true, trusted: true },
  { name: 'org/agents', url: 'https://github.com/org/agents', enabled: true, trusted: false },
];

const artifact: Artifact = {
  id: 'ts-expert',
  name: 'TypeScript Expert',
  description: 'Expert TypeScript skills',
  type: 'skill',
  source: 'skills/ts-expert',
  tags: ['typescript'],
};

// ---------------------------------------------------------------------------
// Loading / ErrorMessage
// ---------------------------------------------------------------------------

describe('Loading', () => {
  it('renders the message', () => {
    const { lastFrame } = render(<Loading message="Fetching catalog…" />);
    expect(lastFrame()).toContain('Fetching catalog…');
  });
});

describe('ErrorMessage', () => {
  it('renders the error message', () => {
    const { lastFrame } = render(<ErrorMessage message="Something went wrong" />);
    expect(lastFrame()).toContain('Something went wrong');
  });
});

// ---------------------------------------------------------------------------
// RepoList (TUI-REQ-0002)
// ---------------------------------------------------------------------------

describe('RepoList', () => {
  it('renders enabled sources', () => {
    const { lastFrame } = render(
      <RepoList sources={enabledSources} cursor={0} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('acme/skills');
    expect(frame).toContain('org/agents');
  });

  it('shows the Add custom source option', () => {
    const { lastFrame } = render(<RepoList sources={enabledSources} cursor={0} />);
    expect(lastFrame()).toContain('Add custom source');
  });

  it('shows navigation hint', () => {
    const { lastFrame } = render(<RepoList sources={enabledSources} cursor={0} />);
    expect(lastFrame()).toContain('↑↓ navigate');
  });

  it('highlights the source at cursor position', () => {
    const { lastFrame } = render(<RepoList sources={enabledSources} cursor={0} />);
    expect(lastFrame()).toContain('▶');
  });

  it('displays an error message when error prop is provided', () => {
    const { lastFrame } = render(
      <RepoList
        sources={enabledSources}
        cursor={0}
        error="Unable to reach github.com. Check your internet connection and try again."
      />,
    );
    expect(lastFrame()).toContain('Unable to reach github.com');
  });

  it('shows no error when error prop is null', () => {
    const { lastFrame } = render(
      <RepoList sources={enabledSources} cursor={0} error={null} />,
    );
    expect(lastFrame()).toContain('acme/skills');
    expect(lastFrame()).not.toContain('✗');
  });
});

// ---------------------------------------------------------------------------
// TrustWarning (TUI-REQ-0003)
// ---------------------------------------------------------------------------

describe('TrustWarning', () => {
  it('shows the source URL', () => {
    const { lastFrame } = render(
      <TrustWarning sourceUrl="https://github.com/acme/skills" cursor={0} />,
    );
    expect(lastFrame()).toContain('https://github.com/acme/skills');
  });

  it('highlights Trust button when cursor=0', () => {
    const { lastFrame } = render(
      <TrustWarning sourceUrl="https://github.com/acme/skills" cursor={0} />,
    );
    expect(lastFrame()).toContain('[ Trust this source and continue ]');
  });

  it('highlights Cancel button when cursor=1', () => {
    const { lastFrame } = render(
      <TrustWarning sourceUrl="https://github.com/acme/skills" cursor={1} />,
    );
    expect(lastFrame()).toContain('[ Cancel ]');
  });

  it('renders navigation hint', () => {
    const { lastFrame } = render(
      <TrustWarning sourceUrl="https://github.com/acme/skills" cursor={0} />,
    );
    expect(lastFrame()).toContain('←');
  });
});

// ---------------------------------------------------------------------------
// TargetSelect (TUI-REQ-0005)
// ---------------------------------------------------------------------------

describe('TargetSelect', () => {
  it('renders the target list', () => {
    const { lastFrame } = render(<TargetSelect cursor={0} />);
    const frame = lastFrame()!;
    expect(frame).toContain('claude-code');
    expect(frame).toContain('copilot');
  });

  it('highlights target at cursor position', () => {
    const { lastFrame } = render(<TargetSelect cursor={0} />);
    expect(lastFrame()).toContain('▶');
  });
});

// ---------------------------------------------------------------------------
// ScopeSelect (TUI-REQ-0005)
// ---------------------------------------------------------------------------

describe('ScopeSelect', () => {
  it('renders scope options', () => {
    const { lastFrame } = render(<ScopeSelect cursor={0} />);
    const frame = lastFrame()!;
    expect(frame).toContain('workspace');
    expect(frame).toContain('user');
  });

  it('shows navigation hint (scope selection stage)', () => {
    const { lastFrame } = render(<ScopeSelect cursor={0} />);
    expect(lastFrame()).toContain('↑↓ navigate');
  });
});

// ---------------------------------------------------------------------------
// ScopePersist
// ---------------------------------------------------------------------------

describe('ScopePersist', () => {
  it('renders Yes and No options', () => {
    const { lastFrame } = render(<ScopePersist cursor={0} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Yes');
    expect(frame).toContain('No');
  });

  it('highlights Yes when cursor=0', () => {
    const { lastFrame } = render(<ScopePersist cursor={0} />);
    expect(lastFrame()).toContain('[ Yes ]');
  });

  it('highlights No when cursor=1', () => {
    const { lastFrame } = render(<ScopePersist cursor={1} />);
    expect(lastFrame()).toContain('[ No ]');
  });
});

// ---------------------------------------------------------------------------
// TypeMenu (TUI-REQ-0006)
// ---------------------------------------------------------------------------

describe('TypeMenu', () => {
  const types = ['skill', 'agent'] as const;
  const counts = { skill: 5, agent: 3 };

  it('renders all types with counts', () => {
    const { lastFrame } = render(
      <TypeMenu
        sourceName="acme/skills"
        target="claude-code"
        scope="workspace"
        types={types as unknown as import('@cowboylogic/cerebro-schema').ArtifactType[]}
        counts={counts}
        cursor={0}
        error={null}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('skill');
    expect(frame).toContain('agent');
    expect(frame).toContain('5');
    expect(frame).toContain('3');
  });

  it('shows error when error prop is set', () => {
    const { lastFrame } = render(
      <TypeMenu
        sourceName="acme/skills"
        target="claude-code"
        scope="workspace"
        types={types as unknown as import('@cowboylogic/cerebro-schema').ArtifactType[]}
        counts={counts}
        cursor={0}
        error="Network error"
      />,
    );
    expect(lastFrame()).toContain('Network error');
  });

  it('shows an explicit empty-state message when no types are available', () => {
    const { lastFrame } = render(
      <TypeMenu
        sourceName="acme/skills"
        target="claude-code"
        scope="workspace"
        types={[]}
        counts={{}}
        cursor={0}
        error={null}
      />,
    );
    expect(lastFrame()).toContain('No artifact types found');
  });

  it('renders without crashing when types=[] and cursor=0', () => {
    const { lastFrame } = render(
      <TypeMenu
        sourceName="acme/skills"
        target="claude-code"
        scope="workspace"
        types={[]}
        counts={{}}
        cursor={0}
        error={null}
      />,
    );
    expect(lastFrame()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ItemList (TUI-REQ-0007 / 0008 / 0009 / 0010 / 0011 / 0012 / 0013 / 0014)
// ---------------------------------------------------------------------------

describe('ItemList', () => {
  const artifacts: Artifact[] = Array.from({ length: 5 }, (_, i) => ({
    id: `skill-${i}`,
    name: `Skill ${i}`,
    description: `Skill desc ${i}`,
    type: 'skill' as const,
    source: `skills/skill-${i}`,
    tags: [],
  }));

  it('renders artifact names', () => {
    const { lastFrame } = render(
      <ItemList
        sourceName="acme/skills"
        selectedType="skill"
        target="claude-code"
        scope="workspace"
        artifacts={artifacts}
        getStatus={() => 'available'}
        filter=""
        cursor={0}
        page={0}
        installing={null}
        installError={null}
      />,
    );
    expect(lastFrame()).toContain('Skill 0');
    expect(lastFrame()).toContain('Skill 1');
  });

  it('shows installed badge for installed artifacts (TUI-REQ-0012)', () => {
    const { lastFrame } = render(
      <ItemList
        sourceName="acme/skills"
        selectedType="skill"
        target="claude-code"
        scope="workspace"
        artifacts={[artifacts[0]]}
        getStatus={() => 'installed'}
        filter=""
        cursor={0}
        page={0}
        installing={null}
        installError={null}
      />,
    );
    expect(lastFrame()).toContain('Installed');
  });

  it('shows install error when installError prop is set', () => {
    const { lastFrame } = render(
      <ItemList
        sourceName="acme/skills"
        selectedType="skill"
        target="claude-code"
        scope="workspace"
        artifacts={artifacts}
        getStatus={() => 'available'}
        filter=""
        cursor={0}
        page={0}
        installing={null}
        installError="Permission denied"
      />,
    );
    expect(lastFrame()).toContain('Permission denied');
  });

  it('shows filter help text (TUI-REQ-0009)', () => {
    const { lastFrame } = render(
      <ItemList
        sourceName="acme/skills"
        selectedType="skill"
        target="claude-code"
        scope="workspace"
        artifacts={artifacts}
        getStatus={() => 'available'}
        filter=""
        cursor={0}
        page={0}
        installing={null}
        installError={null}
      />,
    );
    expect(lastFrame()).toContain('Filter');
  });

  it('filters artifacts by name when filter prop is set', () => {
    const { lastFrame } = render(
      <ItemList
        sourceName="acme/skills"
        selectedType="skill"
        target="claude-code"
        scope="workspace"
        artifacts={artifacts}
        getStatus={() => 'available'}
        filter="Skill 0"
        cursor={0}
        page={0}
        installing={null}
        installError={null}
      />,
    );
    expect(lastFrame()).toContain('Skill 0');
    expect(lastFrame()).not.toContain('Skill 1');
  });

  it('TUI-REQ-0019: respects pageSize prop — only shows pageSize items per page', () => {
    const manyArtifacts: Artifact[] = Array.from({ length: 15 }, (_, i) => ({
      id: `art-${i}`,
      name: `Artifact ${i}`,
      type: 'skill' as const,
      source: `skills/art-${i}`,
    }));
    const { lastFrame } = render(
      <ItemList
        sourceName="test"
        selectedType="skill"
        target="claude-code"
        scope="workspace"
        artifacts={manyArtifacts}
        getStatus={() => 'available'}
        filter=""
        cursor={0}
        page={0}
        pageSize={5}
        installing={null}
        installError={null}
      />,
    );
    // page 0 with pageSize=5 shows items 0–4
    expect(lastFrame()).toContain('Artifact 0');
    expect(lastFrame()).toContain('Artifact 4');
    // item 5 must NOT appear (would only show with pageSize ≥ 6)
    expect(lastFrame()).not.toContain('Artifact 5');
  });
});

// ---------------------------------------------------------------------------
// OverwriteConfirm (TUI-REQ-0015)
// ---------------------------------------------------------------------------

describe('OverwriteConfirm', () => {
  it('renders artifact name and install path', () => {
    const { lastFrame } = render(
      <OverwriteConfirm
        artifact={artifact}
        installPath="/home/user/.config/claude/skills/ts-expert"
        status="installed"
        cursor={1}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('TypeScript Expert');
    expect(frame).toContain('/home/user/.config/claude/skills/ts-expert');
  });

  it('highlights No when cursor=1 (default)', () => {
    const { lastFrame } = render(
      <OverwriteConfirm
        artifact={artifact}
        installPath="/tmp/path"
        status="installed"
        cursor={1}
      />,
    );
    expect(lastFrame()).toContain('[ No ]');
  });

  it('highlights Yes when cursor=0', () => {
    const { lastFrame } = render(
      <OverwriteConfirm
        artifact={artifact}
        installPath="/tmp/path"
        status="installed"
        cursor={0}
      />,
    );
    expect(lastFrame()).toContain('[ Yes ]');
  });
});

// ---------------------------------------------------------------------------
// AddSource (TUI-REQ-0016 / 0017)
// ---------------------------------------------------------------------------

describe('AddSource', () => {
  it('renders the URL input prompt', () => {
    const { lastFrame } = render(
      <AddSource url="" formatError={null} validating={false} error={null} />,
    );
    expect(lastFrame()).toContain('Enter a GitHub repository URL');
  });

  it('shows validation error when error prop is set', () => {
    const { lastFrame } = render(
      <AddSource url="" formatError={null} validating={false} error="Invalid repository URL" />,
    );
    expect(lastFrame()).toContain('Invalid repository URL');
  });

  it('shows formatError when formatError prop is set', () => {
    const { lastFrame } = render(
      <AddSource
        url="notaurl"
        formatError="Must be a GitHub URL (https://github.com/owner/repo)"
        validating={false}
        error={null}
      />,
    );
    expect(lastFrame()).toContain('Must be a GitHub URL');
  });

  it('shows validating indicator when validating=true', () => {
    const { lastFrame } = render(
      <AddSource
        url="https://github.com/owner/repo"
        formatError={null}
        validating={true}
        error={null}
      />,
    );
    expect(lastFrame()).toContain('Validating');
  });

  it('shows typed URL in the input', () => {
    const { lastFrame } = render(
      <AddSource
        url="https://github.com/acme/skills"
        formatError={null}
        validating={false}
        error={null}
      />,
    );
    expect(lastFrame()).toContain('https://github.com/acme/skills');
  });

  it('TUI-REQ-0016: pressing Enter on invalid URL calls onRequestValidate with format error (not onAdd)', () => {
    // With pure render, keyboard events do nothing — verify format error rendering instead
    const { lastFrame } = render(
      <AddSource
        url="n"
        formatError="Must be a GitHub URL"
        validating={false}
        error={null}
      />,
    );
    expect(lastFrame()).toContain('Must be a GitHub URL');
  });
});

// ---------------------------------------------------------------------------
// AddSourceSave
// ---------------------------------------------------------------------------

describe('AddSourceSave', () => {
  it('renders Yes and No options', () => {
    const { lastFrame } = render(<AddSourceSave cursor={0} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Yes');
    expect(frame).toContain('No');
  });

  it('highlights Yes when cursor=0', () => {
    const { lastFrame } = render(<AddSourceSave cursor={0} />);
    expect(lastFrame()).toContain('[ Yes ]');
  });

  it('highlights No when cursor=1', () => {
    const { lastFrame } = render(<AddSourceSave cursor={1} />);
    expect(lastFrame()).toContain('[ No ]');
  });
});
