/**
 * SPEC-0007 / CLI-0002 — TUI centralized state machine.
 *
 * Pure function: handleKey(state, key, sources) → [newState, action | null]
 * No Ink import. No React. No side effects.
 */

import type { SourceEntry } from '../core/config.js';
import type { Scope, Artifact, ArtifactType } from '@cowboylogic/cerebro-schema';
import type { TuiState } from './types.js';
import type { CatalogResult } from '../core/catalog.js';

// ---------------------------------------------------------------------------
// Constants (shared with screens.tsx for rendering)
// ---------------------------------------------------------------------------

export const PAGE_SIZE = 10;

export const MVP_TARGETS = [
  { id: 'agents' as const,      label: 'agents          (.agents standard)' },
  { id: 'claude-code' as const, label: 'claude-code     (Claude Code CLI)' },
  { id: 'copilot' as const,     label: 'copilot         (GitHub Copilot)' },
] as const;

export const SCOPES = [
  { id: 'workspace' as const, label: 'workspace    (current project only)' },
  { id: 'user' as const,      label: 'user         (all projects, your home directory)' },
] as const;

// ---------------------------------------------------------------------------
// KeyEvent (maps from Ink's useInput parameters)
// ---------------------------------------------------------------------------

export interface KeyEvent {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  return: boolean;
  escape: boolean;
  backspace: boolean;
  delete: boolean;
  space: boolean;
  ctrl: boolean;
  meta: boolean;
  /** Single printable non-space character, or null */
  char: string | null;
}

// ---------------------------------------------------------------------------
// TuiAction (side effects app.tsx must execute after a key press)
// ---------------------------------------------------------------------------

export type TuiAction =
  | { type: 'select-source'; source: SourceEntry }
  | { type: 'trust'; source: SourceEntry }
  | { type: 'install'; artifact: Artifact; overwrite: boolean }
  | { type: 'validate-url'; url: string }
  | { type: 'add-source'; url: string; save: boolean }
  | { type: 'scope-selected'; scope: Scope; persist: boolean }
  | { type: 'exit' };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getDistinctTypes(catalog: CatalogResult | null): ArtifactType[] {
  if (!catalog) return [];
  return [...new Set(catalog.artifacts.map(a => a.type))] as ArtifactType[];
}

function getFilteredArtifacts(state: TuiState): Artifact[] {
  if (!state.catalog || !state.selectedType) return [];
  const lower = state.filter.toLowerCase();
  return state.catalog.artifacts
    .filter(a => a.type === state.selectedType)
    .filter(a => !state.filter || a.name.toLowerCase().includes(lower));
}

function getPageCount(state: TuiState): number {
  return Math.max(1, Math.ceil(getFilteredArtifacts(state).length / PAGE_SIZE));
}

function getPageItems(state: TuiState): Artifact[] {
  const filtered = getFilteredArtifacts(state);
  return filtered.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
}

function isValidGitHubUrl(url: string): boolean {
  return /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(url);
}

/** Clear error whenever we navigate away */
function clearError(state: TuiState): TuiState {
  return { ...state, error: null };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function handleKey(
  state: TuiState,
  key: KeyEvent,
  sources: SourceEntry[],
): [TuiState, TuiAction | null] {
  switch (state.screen) {
    case 'repo-list':       return handleRepoList(state, key, sources);
    case 'trust-warning':   return handleTrustWarning(state, key);
    case 'target-select':   return handleTargetSelect(state, key);
    case 'scope-select':    return handleScopeSelect(state, key);
    case 'scope-persist':   return handleScopePersist(state, key);
    case 'type-menu':       return handleTypeMenu(state, key);
    case 'item-list':       return handleItemList(state, key);
    case 'overwrite-confirm': return handleOverwriteConfirm(state, key);
    case 'add-source':      return handleAddSource(state, key);
    case 'add-source-save': return handleAddSourceSave(state, key);
    default:                return [state, null];
  }
}

// ---------------------------------------------------------------------------
// Per-screen handlers
// ---------------------------------------------------------------------------

function handleRepoList(
  state: TuiState,
  key: KeyEvent,
  sources: SourceEntry[],
): [TuiState, TuiAction | null] {
  const totalItems = sources.length + 1; // +1 for "Add custom source"

  if (key.escape) {
    return [clearError(state), { type: 'exit' }];
  }

  if (key.downArrow) {
    const next = (state.repoCursor + 1) % totalItems;
    return [{ ...state, repoCursor: next }, null];
  }

  if (key.upArrow) {
    const next = (state.repoCursor - 1 + totalItems) % totalItems;
    return [{ ...state, repoCursor: next }, null];
  }

  if (key.return) {
    const s = clearError(state);
    if (state.repoCursor === sources.length) {
      // "Add custom source" row
      return [{ ...s, screen: 'add-source', addSourceUrl: '', addSourceFormatError: null }, null];
    }
    const source = sources[state.repoCursor];
    return [s, { type: 'select-source', source }];
  }

  return [state, null];
}

function handleTrustWarning(
  state: TuiState,
  key: KeyEvent,
): [TuiState, TuiAction | null] {
  if (key.escape) {
    return [{ ...clearError(state), screen: 'repo-list' }, null];
  }

  if (key.rightArrow) {
    return [{ ...state, trustCursor: Math.min(1, state.trustCursor + 1) }, null];
  }

  if (key.leftArrow) {
    return [{ ...state, trustCursor: Math.max(0, state.trustCursor - 1) }, null];
  }

  if (key.return) {
    if (state.trustCursor === 1) {
      // Cancel
      return [{ ...clearError(state), screen: 'repo-list' }, null];
    }
    // Trust (cursor === 0)
    const source = state.activeSource!;
    return [clearError(state), { type: 'trust', source }];
  }

  return [state, null];
}

function handleTargetSelect(
  state: TuiState,
  key: KeyEvent,
): [TuiState, TuiAction | null] {
  const count = MVP_TARGETS.length;

  if (key.escape) {
    return [{ ...clearError(state), screen: 'repo-list' }, null];
  }

  if (key.downArrow) {
    return [{ ...state, targetCursor: (state.targetCursor + 1) % count }, null];
  }

  if (key.upArrow) {
    return [{ ...state, targetCursor: (state.targetCursor - 1 + count) % count }, null];
  }

  if (key.return) {
    const target = MVP_TARGETS[state.targetCursor].id;
    return [{ ...clearError(state), screen: 'scope-select', target }, null];
  }

  return [state, null];
}

function handleScopeSelect(
  state: TuiState,
  key: KeyEvent,
): [TuiState, TuiAction | null] {
  const count = SCOPES.length;

  if (key.escape) {
    return [{ ...clearError(state), screen: 'target-select' }, null];
  }

  if (key.downArrow) {
    return [{ ...state, scopeCursor: (state.scopeCursor + 1) % count }, null];
  }

  if (key.upArrow) {
    return [{ ...state, scopeCursor: (state.scopeCursor - 1 + count) % count }, null];
  }

  if (key.return) {
    const pickedScope = SCOPES[state.scopeCursor].id;
    return [{
      ...clearError(state),
      screen: 'scope-persist',
      pickedScope,
      scopePersistCursor: 1, // default to No
    }, null];
  }

  return [state, null];
}

function handleScopePersist(
  state: TuiState,
  key: KeyEvent,
): [TuiState, TuiAction | null] {
  if (key.escape) {
    // Treat Escape as "skip saving" — fire scope-selected with persist=false
    const scope = state.pickedScope!;
    return [clearError(state), { type: 'scope-selected', scope, persist: false }];
  }

  if (key.rightArrow || key.leftArrow) {
    // Both arrows toggle the binary Yes(0)/No(1) choice
    return [{ ...state, scopePersistCursor: state.scopePersistCursor ^ 1 }, null];
  }

  if (key.return) {
    const scope = state.pickedScope!;
    const persist = state.scopePersistCursor === 0; // 0 = Yes
    return [clearError(state), { type: 'scope-selected', scope, persist }];
  }

  return [state, null];
}

function handleTypeMenu(
  state: TuiState,
  key: KeyEvent,
): [TuiState, TuiAction | null] {
  const types = getDistinctTypes(state.catalog);
  const count = types.length;

  if (key.escape) {
    return [{ ...clearError(state), screen: 'repo-list' }, null];
  }

  if (count === 0) return [state, null];

  if (key.downArrow) {
    return [{ ...state, typeCursor: (state.typeCursor + 1) % count }, null];
  }

  if (key.upArrow) {
    return [{ ...state, typeCursor: (state.typeCursor - 1 + count) % count }, null];
  }

  if (key.return) {
    const selectedType = types[state.typeCursor];
    return [{
      ...clearError(state),
      screen: 'item-list',
      selectedType,
      itemCursor: 0,
      filter: '',
      page: 0,
    }, null];
  }

  return [state, null];
}

function handleItemList(
  state: TuiState,
  key: KeyEvent,
): [TuiState, TuiAction | null] {
  // Escape: clear filter first, then navigate back
  if (key.escape) {
    if (state.filter) {
      return [{ ...state, filter: '', itemCursor: 0, page: 0 }, null];
    }
    // Navigate back: if >1 distinct type, go to type-menu; else repo-list
    const types = getDistinctTypes(state.catalog);
    const backScreen = types.length > 1 ? 'type-menu' : 'repo-list';
    return [{ ...clearError(state), screen: backScreen }, null];
  }

  // Pagination — compute from unfiltered list (SPACE also clears filter)
  if (key.space) {
    if (!state.catalog || !state.selectedType) return [state, null];
    const allOfType = state.catalog.artifacts.filter(a => a.type === state.selectedType);
    const pageCount = Math.max(1, Math.ceil(allOfType.length / PAGE_SIZE));
    const nextPage = (state.page + 1) % pageCount;
    return [{ ...state, page: nextPage, itemCursor: 0, filter: '' }, null];
  }

  // Cursor navigation
  const pageItems = getPageItems(state);
  const lastIdx = Math.max(0, pageItems.length - 1);

  if (key.downArrow) {
    return [{ ...state, itemCursor: Math.min(lastIdx, state.itemCursor + 1) }, null];
  }

  if (key.upArrow) {
    return [{ ...state, itemCursor: Math.max(0, state.itemCursor - 1) }, null];
  }

  // Install
  if (key.return) {
    if (pageItems.length === 0) return [state, null];
    const artifact = pageItems[state.itemCursor];
    return [clearError(state), { type: 'install', artifact, overwrite: false }];
  }

  // Filter input
  if (key.backspace) {
    const filter = state.filter.slice(0, -1);
    return [{ ...state, filter, itemCursor: 0, page: 0 }, null];
  }

  if (key.char !== null) {
    const filter = state.filter + key.char;
    return [{ ...state, filter, itemCursor: 0, page: 0 }, null];
  }

  return [state, null];
}

function handleOverwriteConfirm(
  state: TuiState,
  key: KeyEvent,
): [TuiState, TuiAction | null] {
  if (key.escape) {
    return [{ ...clearError(state), screen: 'item-list' }, null];
  }

  if (key.leftArrow) {
    return [{ ...state, overwriteCursor: 0 }, null];
  }

  if (key.rightArrow) {
    return [{ ...state, overwriteCursor: 1 }, null];
  }

  if (key.return) {
    const artifact = state.pendingOverwrite!;
    if (state.overwriteCursor === 0) {
      // Yes — overwrite
      return [{ ...clearError(state), screen: 'item-list' }, { type: 'install', artifact, overwrite: true }];
    }
    // No — cancel
    return [{ ...clearError(state), screen: 'item-list' }, null];
  }

  return [state, null];
}

function handleAddSource(
  state: TuiState,
  key: KeyEvent,
): [TuiState, TuiAction | null] {
  if (key.escape) {
    return [{
      ...clearError(state),
      screen: 'repo-list',
      addSourceUrl: '',
      addSourceFormatError: null,
    }, null];
  }

  if (key.return) {
    const url = state.addSourceUrl.trim();
    if (!isValidGitHubUrl(url)) {
      return [{
        ...state,
        addSourceFormatError: 'Enter a valid GitHub URL: https://github.com/owner/repo',
      }, null];
    }
    return [clearError(state), { type: 'validate-url', url }];
  }

  if (key.backspace) {
    const addSourceUrl = state.addSourceUrl.slice(0, -1);
    return [{ ...state, addSourceUrl, addSourceFormatError: null }, null];
  }

  if (key.char !== null) {
    const addSourceUrl = state.addSourceUrl + key.char;
    return [{ ...state, addSourceUrl, addSourceFormatError: null }, null];
  }

  return [state, null];
}

function handleAddSourceSave(
  state: TuiState,
  key: KeyEvent,
): [TuiState, TuiAction | null] {
  if (key.escape) {
    return [{ ...clearError(state), screen: 'repo-list' }, null];
  }

  if (key.leftArrow) {
    return [{ ...state, addSourceSaveCursor: 0 }, null];
  }

  if (key.rightArrow) {
    return [{ ...state, addSourceSaveCursor: 1 }, null];
  }

  if (key.return) {
    const url = state.addSourceUrl;
    const save = state.addSourceSaveCursor === 0; // 0 = Yes
    return [clearError(state), { type: 'add-source', url, save }];
  }

  return [state, null];
}
