/**
 * Tests for SPEC-0007 / CLI-0002 — TUI centralized state machine (transitions.ts)
 *
 * All tests call handleKey() directly — no Ink, no React, no async.
 * Each test references the SPEC-0007 requirement it covers.
 */
import { describe, it, expect } from 'vitest';
import { handleKey, MVP_TARGETS, SCOPES, PAGE_SIZE } from '../../../src/tui/transitions.js';
import { makeInitialState } from '../../../src/tui/types.js';
import type { TuiState } from '../../../src/tui/types.js';
import type { SourceEntry } from '../../../src/core/config.js';
import type { Artifact } from '@cowboylogic/cerebro-schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sources: SourceEntry[] = [
  { name: 'acme/skills', url: 'https://github.com/acme/skills', enabled: true, trusted: true },
  { name: 'org/agents',  url: 'https://github.com/org/agents',  enabled: true, trusted: false },
];

function makeArtifact(id: string, name = id): Artifact {
  return { id, name, type: 'skill', source: `skills/${id}` };
}

function withScreen(screen: TuiState['screen'], patch: Partial<TuiState> = {}): TuiState {
  return { ...makeInitialState(), screen, ...patch };
}

// Minimal key event helpers
const UP    = { upArrow: true,    downArrow: false, leftArrow: false, rightArrow: false, return: false, escape: false, backspace: false, delete: false, space: false, ctrl: false, meta: false, char: null };
const DOWN  = { upArrow: false,   downArrow: true,  leftArrow: false, rightArrow: false, return: false, escape: false, backspace: false, delete: false, space: false, ctrl: false, meta: false, char: null };
const LEFT  = { upArrow: false,   downArrow: false, leftArrow: true,  rightArrow: false, return: false, escape: false, backspace: false, delete: false, space: false, ctrl: false, meta: false, char: null };
const RIGHT = { upArrow: false,   downArrow: false, leftArrow: false, rightArrow: true,  return: false, escape: false, backspace: false, delete: false, space: false, ctrl: false, meta: false, char: null };
const ENTER = { upArrow: false,   downArrow: false, leftArrow: false, rightArrow: false, return: true,  escape: false, backspace: false, delete: false, space: false, ctrl: false, meta: false, char: null };
const ESC   = { upArrow: false,   downArrow: false, leftArrow: false, rightArrow: false, return: false, escape: true,  backspace: false, delete: false, space: false, ctrl: false, meta: false, char: null };
const BKSP  = { upArrow: false,   downArrow: false, leftArrow: false, rightArrow: false, return: false, escape: false, backspace: true,  delete: false, space: false, ctrl: false, meta: false, char: null };
const SPACE = { upArrow: false,   downArrow: false, leftArrow: false, rightArrow: false, return: false, escape: false, backspace: false, delete: false, space: true,  ctrl: false, meta: false, char: null };
function CHAR(c: string) {
  return { upArrow: false, downArrow: false, leftArrow: false, rightArrow: false, return: false, escape: false, backspace: false, delete: false, space: false, ctrl: false, meta: false, char: c };
}

// ---------------------------------------------------------------------------
// repo-list (TUI-REQ-0003)
// ---------------------------------------------------------------------------

describe('repo-list — cursor navigation', () => {
  it('down arrow increments repoCursor', () => {
    const state = withScreen('repo-list', { repoCursor: 0 });
    const [next] = handleKey(state, DOWN, sources);
    expect(next.repoCursor).toBe(1);
  });

  it('up arrow decrements repoCursor', () => {
    const state = withScreen('repo-list', { repoCursor: 1 });
    const [next] = handleKey(state, UP, sources);
    expect(next.repoCursor).toBe(0);
  });

  it('down arrow wraps from last item back to 0', () => {
    // totalItems = sources.length + 1 (add-source entry)
    const totalItems = sources.length + 1;
    const state = withScreen('repo-list', { repoCursor: totalItems - 1 });
    const [next] = handleKey(state, DOWN, sources);
    expect(next.repoCursor).toBe(0);
  });

  it('up arrow wraps from 0 to last item', () => {
    const totalItems = sources.length + 1;
    const state = withScreen('repo-list', { repoCursor: 0 });
    const [next] = handleKey(state, UP, sources);
    expect(next.repoCursor).toBe(totalItems - 1);
  });
});

describe('repo-list — Enter (TUI-REQ-0003)', () => {
  it('Enter on a source fires select-source action with that source', () => {
    const state = withScreen('repo-list', { repoCursor: 0 });
    const [, action] = handleKey(state, ENTER, sources);
    expect(action).toEqual({ type: 'select-source', source: sources[0] });
  });

  it('Enter on second source fires select-source with second source', () => {
    const state = withScreen('repo-list', { repoCursor: 1 });
    const [, action] = handleKey(state, ENTER, sources);
    expect(action).toEqual({ type: 'select-source', source: sources[1] });
  });

  it('Enter on Add custom source navigates to add-source screen', () => {
    const state = withScreen('repo-list', { repoCursor: sources.length });
    const [next, action] = handleKey(state, ENTER, sources);
    expect(next.screen).toBe('add-source');
    expect(action).toBeNull();
  });
});

describe('repo-list — Escape (TUI-REQ-0003)', () => {
  it('Escape fires exit action', () => {
    const state = withScreen('repo-list');
    const [, action] = handleKey(state, ESC, sources);
    expect(action).toEqual({ type: 'exit' });
  });
});

// ---------------------------------------------------------------------------
// trust-warning (TUI-REQ-0004)
// ---------------------------------------------------------------------------

describe('trust-warning — cursor', () => {
  it('right arrow moves cursor from Trust (0) to Cancel (1)', () => {
    const state = withScreen('trust-warning', { trustCursor: 0 });
    const [next] = handleKey(state, RIGHT, sources);
    expect(next.trustCursor).toBe(1);
  });

  it('left arrow moves cursor from Cancel (1) to Trust (0)', () => {
    const state = withScreen('trust-warning', { trustCursor: 1 });
    const [next] = handleKey(state, LEFT, sources);
    expect(next.trustCursor).toBe(0);
  });
});

describe('trust-warning — Enter', () => {
  it('Enter with cursor=0 fires trust action with active source', () => {
    const state = withScreen('trust-warning', {
      trustCursor: 0,
      activeSource: sources[0],
    });
    const [, action] = handleKey(state, ENTER, sources);
    expect(action).toEqual({ type: 'trust', source: sources[0] });
  });

  it('Enter with cursor=1 (Cancel) navigates back to repo-list', () => {
    const state = withScreen('trust-warning', { trustCursor: 1 });
    const [next, action] = handleKey(state, ENTER, sources);
    expect(next.screen).toBe('repo-list');
    expect(action).toBeNull();
  });
});

describe('trust-warning — Escape (TUI-REQ-0003)', () => {
  it('Escape navigates back to repo-list', () => {
    const state = withScreen('trust-warning');
    const [next, action] = handleKey(state, ESC, sources);
    expect(next.screen).toBe('repo-list');
    expect(action).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// target-select (TUI-REQ-0005)
// ---------------------------------------------------------------------------

describe('target-select — cursor', () => {
  it('down arrow increments targetCursor', () => {
    const state = withScreen('target-select', { targetCursor: 0 });
    const [next] = handleKey(state, DOWN, sources);
    expect(next.targetCursor).toBe(1);
  });

  it('down arrow wraps at end of MVP_TARGETS', () => {
    const state = withScreen('target-select', { targetCursor: MVP_TARGETS.length - 1 });
    const [next] = handleKey(state, DOWN, sources);
    expect(next.targetCursor).toBe(0);
  });

  it('up arrow wraps from 0 to last target', () => {
    const state = withScreen('target-select', { targetCursor: 0 });
    const [next] = handleKey(state, UP, sources);
    expect(next.targetCursor).toBe(MVP_TARGETS.length - 1);
  });
});

describe('target-select — Enter', () => {
  it('Enter sets target from cursor and navigates to scope-select', () => {
    const state = withScreen('target-select', { targetCursor: 1 });
    const [next, action] = handleKey(state, ENTER, sources);
    expect(next.screen).toBe('scope-select');
    expect(next.target).toBe(MVP_TARGETS[1].id);
    expect(action).toBeNull();
  });
});

describe('target-select — Escape (TUI-REQ-0003)', () => {
  it('Escape navigates back to repo-list', () => {
    const state = withScreen('target-select');
    const [next] = handleKey(state, ESC, sources);
    expect(next.screen).toBe('repo-list');
  });
});

// ---------------------------------------------------------------------------
// scope-select (TUI-REQ-0005)
// ---------------------------------------------------------------------------

describe('scope-select — cursor', () => {
  it('down arrow increments scopeCursor', () => {
    const state = withScreen('scope-select', { scopeCursor: 0 });
    const [next] = handleKey(state, DOWN, sources);
    expect(next.scopeCursor).toBe(1);
  });

  it('down arrow wraps at end of SCOPES', () => {
    const state = withScreen('scope-select', { scopeCursor: SCOPES.length - 1 });
    const [next] = handleKey(state, DOWN, sources);
    expect(next.scopeCursor).toBe(0);
  });
});

describe('scope-select — Enter', () => {
  it('Enter stores pickedScope and transitions to scope-persist', () => {
    const state = withScreen('scope-select', { scopeCursor: 0 });
    const [next, action] = handleKey(state, ENTER, sources);
    expect(next.screen).toBe('scope-persist');
    expect(next.pickedScope).toBe(SCOPES[0].id);
    expect(next.scopePersistCursor).toBe(1); // default to No
    expect(action).toBeNull();
  });
});

describe('scope-select — Escape (TUI-REQ-0003)', () => {
  it('Escape navigates back to target-select', () => {
    const state = withScreen('scope-select');
    const [next] = handleKey(state, ESC, sources);
    expect(next.screen).toBe('target-select');
  });
});

// ---------------------------------------------------------------------------
// scope-persist
// ---------------------------------------------------------------------------

describe('scope-persist — cursor', () => {
  it('right arrow toggles from No (1) to Yes (0)', () => {
    const state = withScreen('scope-persist', { scopePersistCursor: 1 });
    const [next] = handleKey(state, RIGHT, sources);
    expect(next.scopePersistCursor).toBe(0);
  });

  it('left arrow toggles from Yes (0) to No (1)', () => {
    const state = withScreen('scope-persist', { scopePersistCursor: 0 });
    const [next] = handleKey(state, LEFT, sources);
    expect(next.scopePersistCursor).toBe(1);
  });
});

describe('scope-persist — Enter', () => {
  it('Enter with cursor=0 (Yes) fires scope-selected with persist=true', () => {
    const state = withScreen('scope-persist', {
      scopePersistCursor: 0,
      pickedScope: 'workspace',
    });
    const [, action] = handleKey(state, ENTER, sources);
    expect(action).toEqual({ type: 'scope-selected', scope: 'workspace', persist: true });
  });

  it('Enter with cursor=1 (No) fires scope-selected with persist=false', () => {
    const state = withScreen('scope-persist', {
      scopePersistCursor: 1,
      pickedScope: 'user',
    });
    const [, action] = handleKey(state, ENTER, sources);
    expect(action).toEqual({ type: 'scope-selected', scope: 'user', persist: false });
  });
});

describe('scope-persist — Escape', () => {
  it('Escape fires scope-selected with persist=false (skip saving)', () => {
    const state = withScreen('scope-persist', { pickedScope: 'workspace' });
    const [, action] = handleKey(state, ESC, sources);
    expect(action).toEqual({ type: 'scope-selected', scope: 'workspace', persist: false });
  });
});

// ---------------------------------------------------------------------------
// type-menu (TUI-REQ-0006)
// ---------------------------------------------------------------------------

describe('type-menu — cursor', () => {
  it('down arrow increments typeCursor', () => {
    const catalog = { source: 'catalog', artifacts: [makeArtifact('a'), { ...makeArtifact('b'), type: 'instruction' as const }] };
    const state = withScreen('type-menu', { typeCursor: 0, catalog });
    const [next] = handleKey(state, DOWN, sources);
    expect(next.typeCursor).toBe(1);
  });

  it('up arrow wraps to last type', () => {
    const catalog = { source: 'catalog', artifacts: [makeArtifact('a'), { ...makeArtifact('b'), type: 'instruction' as const }] };
    const state = withScreen('type-menu', { typeCursor: 0, catalog });
    const [next] = handleKey(state, UP, sources);
    expect(next.typeCursor).toBe(1); // 2 types, wraps from 0 → 1
  });
});

describe('type-menu — Enter', () => {
  it('Enter navigates to item-list with selectedType from cursor', () => {
    const catalog = { source: 'catalog', artifacts: [makeArtifact('a'), { ...makeArtifact('b'), type: 'instruction' as const }] };
    const state = withScreen('type-menu', { typeCursor: 1, catalog });
    const [next, action] = handleKey(state, ENTER, sources);
    expect(next.screen).toBe('item-list');
    expect(next.selectedType).toBe('instruction');
    expect(next.itemCursor).toBe(0);
    expect(next.filter).toBe('');
    expect(next.page).toBe(0);
    expect(action).toBeNull();
  });
});

describe('type-menu — Escape (TUI-REQ-0003)', () => {
  it('Escape navigates back to repo-list', () => {
    const state = withScreen('type-menu');
    const [next] = handleKey(state, ESC, sources);
    expect(next.screen).toBe('repo-list');
  });
});

// ---------------------------------------------------------------------------
// item-list — cursor (TUI-REQ-0007)
// ---------------------------------------------------------------------------

describe('item-list — cursor', () => {
  const artifacts = Array.from({ length: 5 }, (_, i) => makeArtifact(`skill-${i}`, `Skill ${i}`));
  const catalog = { source: 'catalog', artifacts };

  it('down arrow increments itemCursor', () => {
    const state = withScreen('item-list', { itemCursor: 0, catalog, selectedType: 'skill' });
    const [next] = handleKey(state, DOWN, sources);
    expect(next.itemCursor).toBe(1);
  });

  it('down arrow does not exceed last item on page', () => {
    const state = withScreen('item-list', { itemCursor: 4, catalog, selectedType: 'skill' });
    const [next] = handleKey(state, DOWN, sources);
    expect(next.itemCursor).toBe(4);
  });

  it('up arrow decrements itemCursor', () => {
    const state = withScreen('item-list', { itemCursor: 2, catalog, selectedType: 'skill' });
    const [next] = handleKey(state, UP, sources);
    expect(next.itemCursor).toBe(1);
  });

  it('up arrow clamps at 0', () => {
    const state = withScreen('item-list', { itemCursor: 0, catalog, selectedType: 'skill' });
    const [next] = handleKey(state, UP, sources);
    expect(next.itemCursor).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// item-list — pagination (TUI-REQ-0007 / TUI-REQ-0008)
// ---------------------------------------------------------------------------

describe('item-list — pagination', () => {
  it('TUI-REQ-0007: PAGE_SIZE fits within a standard terminal window (max 10)', () => {
    expect(PAGE_SIZE).toBe(10);
  });

  it('TUI-REQ-0008: spacebar advances to next page', () => {
    const artifacts = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => makeArtifact(`s${i}`));
    const catalog = { source: 'catalog', artifacts };
    const state = withScreen('item-list', { page: 0, catalog, selectedType: 'skill', itemCursor: 3, filter: 'x' });
    const [next] = handleKey(state, SPACE, sources);
    expect(next.page).toBe(1);
    expect(next.itemCursor).toBe(0);
    expect(next.filter).toBe('');
  });

  it('TUI-REQ-0008: spacebar wraps to page 0 from last page', () => {
    const artifacts = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => makeArtifact(`s${i}`));
    const catalog = { source: 'catalog', artifacts };
    const state = withScreen('item-list', { page: 1, catalog, selectedType: 'skill' });
    const [next] = handleKey(state, SPACE, sources);
    expect(next.page).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// item-list — filter (TUI-REQ-0009 / TUI-REQ-0010 / TUI-REQ-0011)
// ---------------------------------------------------------------------------

describe('item-list — filter', () => {
  const catalog = { source: 'catalog', artifacts: [makeArtifact('git-commit', 'Git Commit')] };

  it('TUI-REQ-0009: printable char appends to filter', () => {
    const state = withScreen('item-list', { filter: 'gi', catalog, selectedType: 'skill' });
    const [next] = handleKey(state, CHAR('t'), sources);
    expect(next.filter).toBe('git');
  });

  it('TUI-REQ-0009: typing resets page and cursor', () => {
    const state = withScreen('item-list', { filter: '', page: 1, itemCursor: 3, catalog, selectedType: 'skill' });
    const [next] = handleKey(state, CHAR('g'), sources);
    expect(next.page).toBe(0);
    expect(next.itemCursor).toBe(0);
  });

  it('backspace removes last character from filter', () => {
    const state = withScreen('item-list', { filter: 'git', catalog, selectedType: 'skill' });
    const [next] = handleKey(state, BKSP, sources);
    expect(next.filter).toBe('gi');
  });

  it('TUI-REQ-0011: Escape with active filter clears filter, stays on item-list', () => {
    const state = withScreen('item-list', { filter: 'git', catalog, selectedType: 'skill' });
    const [next] = handleKey(state, ESC, sources);
    expect(next.screen).toBe('item-list');
    expect(next.filter).toBe('');
  });

  it('TUI-REQ-0011: Escape with empty filter navigates back', () => {
    // Two types in catalog → back to type-menu
    const twoTypeCatalog = {
      source: 'catalog',
      artifacts: [makeArtifact('a'), { ...makeArtifact('b'), type: 'instruction' as const }],
    };
    const state = withScreen('item-list', { filter: '', catalog: twoTypeCatalog, selectedType: 'skill' });
    const [next] = handleKey(state, ESC, sources);
    expect(next.screen).toBe('type-menu');
  });

  it('TUI-REQ-0011: Escape with empty filter goes to repo-list when only one type', () => {
    // Single type → type-menu was skipped → back to repo-list
    const oneTypeCatalog = { source: 'catalog', artifacts: [makeArtifact('a'), makeArtifact('b')] };
    const state = withScreen('item-list', { filter: '', catalog: oneTypeCatalog, selectedType: 'skill' });
    const [next] = handleKey(state, ESC, sources);
    expect(next.screen).toBe('repo-list');
  });
});

// ---------------------------------------------------------------------------
// item-list — install (TUI-REQ-0014 / TUI-REQ-0015)
// ---------------------------------------------------------------------------

describe('item-list — Enter to install', () => {
  const artifacts = [makeArtifact('git-commit', 'Git Commit'), makeArtifact('linter', 'Linter')];
  const catalog = { source: 'catalog', artifacts };

  it('TUI-REQ-0014: Enter fires install action for the item at cursor', () => {
    const state = withScreen('item-list', { itemCursor: 1, catalog, selectedType: 'skill' });
    const [, action] = handleKey(state, ENTER, sources);
    expect(action).toEqual({ type: 'install', artifact: artifacts[1], overwrite: false });
  });

  it('Enter does nothing when catalog has no items on current page', () => {
    const emptyCatalog = { source: 'catalog', artifacts: [] };
    const state = withScreen('item-list', { itemCursor: 0, catalog: emptyCatalog, selectedType: 'skill' });
    const [, action] = handleKey(state, ENTER, sources);
    expect(action).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// overwrite-confirm (TUI-REQ-0015)
// ---------------------------------------------------------------------------

describe('overwrite-confirm', () => {
  const artifact = makeArtifact('git-commit');

  it('left/right toggles overwriteCursor', () => {
    const state = withScreen('overwrite-confirm', { overwriteCursor: 1 });
    const [next] = handleKey(state, LEFT, sources);
    expect(next.overwriteCursor).toBe(0);
  });

  it('Enter with cursor=0 (Yes) fires install with overwrite=true and goes to item-list', () => {
    const state = withScreen('overwrite-confirm', {
      overwriteCursor: 0,
      pendingOverwrite: artifact,
    });
    const [next, action] = handleKey(state, ENTER, sources);
    expect(action).toEqual({ type: 'install', artifact, overwrite: true });
    expect(next.screen).toBe('item-list');
  });

  it('Enter with cursor=1 (No) returns to item-list with no action', () => {
    const state = withScreen('overwrite-confirm', { overwriteCursor: 1, pendingOverwrite: artifact });
    const [next, action] = handleKey(state, ENTER, sources);
    expect(next.screen).toBe('item-list');
    expect(action).toBeNull();
  });

  it('Escape returns to item-list with no action', () => {
    const state = withScreen('overwrite-confirm', { pendingOverwrite: artifact });
    const [next, action] = handleKey(state, ESC, sources);
    expect(next.screen).toBe('item-list');
    expect(action).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// add-source (TUI-REQ-0016)
// ---------------------------------------------------------------------------

describe('add-source — URL input', () => {
  it('printable char appends to addSourceUrl', () => {
    const state = withScreen('add-source', { addSourceUrl: 'https://github.co' });
    const [next] = handleKey(state, CHAR('m'), sources);
    expect(next.addSourceUrl).toBe('https://github.com');
  });

  it('backspace removes last character from addSourceUrl', () => {
    const state = withScreen('add-source', { addSourceUrl: 'https://github.com/' });
    const [next] = handleKey(state, BKSP, sources);
    expect(next.addSourceUrl).toBe('https://github.com');
  });

  it('backspace clears addSourceFormatError', () => {
    const state = withScreen('add-source', { addSourceUrl: 'bad', addSourceFormatError: 'Invalid URL' });
    const [next] = handleKey(state, BKSP, sources);
    expect(next.addSourceFormatError).toBeNull();
  });

  it('TUI-REQ-0016: Enter on a valid GitHub URL fires validate-url action', () => {
    const state = withScreen('add-source', { addSourceUrl: 'https://github.com/owner/repo' });
    const [, action] = handleKey(state, ENTER, sources);
    expect(action).toEqual({ type: 'validate-url', url: 'https://github.com/owner/repo' });
  });

  it('TUI-REQ-0016: Enter on an invalid URL sets formatError, no action', () => {
    const state = withScreen('add-source', { addSourceUrl: 'not-a-url' });
    const [next, action] = handleKey(state, ENTER, sources);
    expect(action).toBeNull();
    expect(next.addSourceFormatError).toBeTruthy();
  });

  it('TUI-REQ-0016: Enter on a URL missing repo path sets formatError', () => {
    const state = withScreen('add-source', { addSourceUrl: 'https://github.com/owner' });
    const [next, action] = handleKey(state, ENTER, sources);
    expect(action).toBeNull();
    expect(next.addSourceFormatError).toBeTruthy();
  });

  it('Escape returns to repo-list and clears URL state', () => {
    const state = withScreen('add-source', { addSourceUrl: 'https://github.com/foo', addSourceFormatError: 'err' });
    const [next, action] = handleKey(state, ESC, sources);
    expect(next.screen).toBe('repo-list');
    expect(next.addSourceUrl).toBe('');
    expect(next.addSourceFormatError).toBeNull();
    expect(action).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// add-source-save
// ---------------------------------------------------------------------------

describe('add-source-save', () => {
  it('left/right toggles addSourceSaveCursor', () => {
    const state = withScreen('add-source-save', { addSourceSaveCursor: 0 });
    const [next] = handleKey(state, RIGHT, sources);
    expect(next.addSourceSaveCursor).toBe(1);
  });

  it('Enter with cursor=0 (Yes) fires add-source with save=true', () => {
    const state = withScreen('add-source-save', { addSourceSaveCursor: 0, addSourceUrl: 'https://github.com/o/r' });
    const [, action] = handleKey(state, ENTER, sources);
    expect(action).toEqual({ type: 'add-source', url: 'https://github.com/o/r', save: true });
  });

  it('Enter with cursor=1 (No) fires add-source with save=false', () => {
    const state = withScreen('add-source-save', { addSourceSaveCursor: 1, addSourceUrl: 'https://github.com/o/r' });
    const [, action] = handleKey(state, ENTER, sources);
    expect(action).toEqual({ type: 'add-source', url: 'https://github.com/o/r', save: false });
  });

  it('Escape returns to repo-list', () => {
    const state = withScreen('add-source-save');
    const [next] = handleKey(state, ESC, sources);
    expect(next.screen).toBe('repo-list');
  });
});

// ---------------------------------------------------------------------------
// item-list — configurable pageSize (TUI-REQ-0019)
// ---------------------------------------------------------------------------

describe('item-list — configurable pageSize (TUI-REQ-0019)', () => {
  it('TUI-REQ-0019: spacebar uses state.pageSize for page count, not PAGE_SIZE constant', () => {
    const customPageSize = 3;
    // 5 artifacts → 2 pages at pageSize=3 (but only 1 page at PAGE_SIZE=10)
    const artifacts = Array.from({ length: customPageSize + 2 }, (_, i) => makeArtifact(`s${i}`));
    const catalog = { source: 'catalog', artifacts };
    const state = withScreen('item-list', { page: 0, catalog, selectedType: 'skill', pageSize: customPageSize });
    const [next] = handleKey(state, SPACE, sources);
    expect(next.page).toBe(1);
  });

  it('TUI-REQ-0019: down arrow clamps at state.pageSize-1 when pageSize is smaller than PAGE_SIZE', () => {
    const customPageSize = 2;
    const artifacts = Array.from({ length: customPageSize }, (_, i) => makeArtifact(`s${i}`));
    const catalog = { source: 'catalog', artifacts };
    const state = withScreen('item-list', {
      itemCursor: customPageSize - 1,
      catalog,
      selectedType: 'skill',
      pageSize: customPageSize,
    });
    const [next] = handleKey(state, DOWN, sources);
    expect(next.itemCursor).toBe(customPageSize - 1);
  });

  it('TUI-REQ-0019: getPageItems uses state.pageSize to slice the artifact list', () => {
    const customPageSize = 4;
    const artifacts = Array.from({ length: 10 }, (_, i) => makeArtifact(`s${i}`));
    const catalog = { source: 'catalog', artifacts };
    const state = withScreen('item-list', { page: 1, catalog, selectedType: 'skill', pageSize: customPageSize });
    // page 1 with pageSize=4 → items 4-7, last item index = 3
    const [next] = handleKey(state, DOWN, sources);
    // cursor starts at 0, should advance
    expect(next.itemCursor).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Error state is cleared on navigation
// ---------------------------------------------------------------------------

describe('error cleared on navigation', () => {
  it('navigating away from repo-list clears error', () => {
    const state = withScreen('repo-list', { error: 'Network failed', repoCursor: 0 });
    const [next] = handleKey(state, ENTER, sources);
    // action fires (select-source), state error should be cleared
    expect(next.error).toBeNull();
  });

  it('Escape from trust-warning back to repo-list clears error', () => {
    const state = withScreen('trust-warning', { error: 'Something' });
    const [next] = handleKey(state, ESC, sources);
    expect(next.error).toBeNull();
  });
});
