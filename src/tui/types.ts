/**
 * SPEC-0007 — TUI: shared state types for the screen stack.
 *
 * CLI-0002: All cursor positions, sub-screen stages, and navigation state
 * live here. Screen components are pure render functions — they own no state.
 */
import type { ToolId, Scope, ArtifactType, Artifact } from '@cowboylogic/cerebro-schema';
import type { SourceEntry } from '../core/config.js';
import type { CatalogResult } from '../core/catalog.js';

// ---------------------------------------------------------------------------
// Screen identifiers
// ---------------------------------------------------------------------------

export type Screen =
  | 'repo-list'
  | 'trust-warning'
  | 'target-select'
  | 'scope-select'
  | 'scope-persist'     // "Save as default?" prompt — follows scope-select
  | 'type-menu'
  | 'item-list'
  | 'overwrite-confirm'
  | 'add-source'
  | 'add-source-save';  // "Save for future sessions?" prompt — follows URL validation

// ---------------------------------------------------------------------------
// Session-level TUI state (CLI-0002: all navigation state centralised here)
// ---------------------------------------------------------------------------

export interface TuiState {
  /** Screen currently visible */
  screen: Screen;

  /** True when the app should exit (Escape from repo-list, Ctrl-C) */
  exiting: boolean;

  // ── Cursor positions (one per screen that has a navigable list) ───────────

  /** repo-list: index into enabled sources + "Add custom source" */
  repoCursor: number;
  /** trust-warning: 0 = Trust, 1 = Cancel */
  trustCursor: number;
  /** target-select: index into MVP_TARGETS */
  targetCursor: number;
  /** scope-select: index into SCOPES */
  scopeCursor: number;
  /** scope-persist: 0 = Yes, 1 = No */
  scopePersistCursor: number;
  /** type-menu: index into distinct artifact types */
  typeCursor: number;
  /** item-list: index into current page items */
  itemCursor: number;
  /** overwrite-confirm: 0 = Yes, 1 = No */
  overwriteCursor: number;
  /** add-source-save: 0 = Yes, 1 = No */
  addSourceSaveCursor: number;

  // ── Session-level selections ───────────────────────────────────────────────

  /** Source the user selected from the repo list */
  activeSource: SourceEntry | null;
  /** Whether target + scope have been chosen this session (not re-prompted) */
  targetChosen: boolean;
  /** Chosen target tool for this session */
  target: ToolId | null;
  /** Chosen scope for this session */
  scope: Scope | null;
  /** Scope picked in scope-select, held until scope-persist is confirmed */
  pickedScope: Scope | null;

  // ── Catalog and artifact state ─────────────────────────────────────────────

  catalog: CatalogResult | null;
  selectedType: ArtifactType | null;
  pendingOverwrite: Artifact | null;

  // ── Item list navigation ───────────────────────────────────────────────────

  filter: string;
  page: number;

  // ── AddSource flow ─────────────────────────────────────────────────────────

  /** URL being typed in the add-source screen */
  addSourceUrl: string;
  /** Inline format-validation error before network check */
  addSourceFormatError: string | null;

  // ── Transient display state ────────────────────────────────────────────────

  loading: string | null;
  error: string | null;

  // ── Session trust tracking ─────────────────────────────────────────────────

  trustedThisSession: Set<string>;

  // ── Pagination ────────────────────────────────────────────────────────────

  /** Items shown per page — set at startup from config, falls back to 10 */
  pageSize: number;
}

export function makeInitialState(pageSize = 10): TuiState {
  return {
    screen: 'repo-list',
    exiting: false,
    repoCursor: 0,
    trustCursor: 0,
    targetCursor: 0,
    scopeCursor: 0,
    scopePersistCursor: 1, // default to "No" (safe default)
    typeCursor: 0,
    itemCursor: 0,
    overwriteCursor: 1,    // default to "No" (safe default)
    addSourceSaveCursor: 0,
    activeSource: null,
    targetChosen: false,
    target: null,
    scope: null,
    pickedScope: null,
    catalog: null,
    selectedType: null,
    pendingOverwrite: null,
    filter: '',
    page: 0,
    addSourceUrl: '',
    addSourceFormatError: null,
    loading: null,
    error: null,
    trustedThisSession: new Set(),
    pageSize,
  };
}
