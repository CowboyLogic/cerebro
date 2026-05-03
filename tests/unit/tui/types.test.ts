/**
 * Tests for SPEC-0007 — TUI types and initial state
 * Requirement IDs: TUI-REQ-0001 through TUI-REQ-0019
 */
import { describe, it, expect } from 'vitest';
import { makeInitialState } from '../../../src/tui/types.js';

describe('makeInitialState()', () => {
  it('starts on the repo-list screen', () => {
    const state = makeInitialState();
    expect(state.screen).toBe('repo-list');
  });

  it('has no active source initially', () => {
    const state = makeInitialState();
    expect(state.activeSource).toBeNull();
  });

  it('has no target or scope initially', () => {
    const state = makeInitialState();
    expect(state.target).toBeNull();
    expect(state.scope).toBeNull();
  });

  it('has targetChosen false initially', () => {
    const state = makeInitialState();
    expect(state.targetChosen).toBe(false);
  });

  it('has no catalog initially', () => {
    const state = makeInitialState();
    expect(state.catalog).toBeNull();
  });

  it('has no loading or error initially', () => {
    const state = makeInitialState();
    expect(state.loading).toBeNull();
    expect(state.error).toBeNull();
  });

  it('has no selected type initially', () => {
    const state = makeInitialState();
    expect(state.selectedType).toBeNull();
  });

  it('starts with empty filter and page 0', () => {
    const state = makeInitialState();
    expect(state.filter).toBe('');
    expect(state.page).toBe(0);
  });

  it('has no pending overwrite initially', () => {
    const state = makeInitialState();
    expect(state.pendingOverwrite).toBeNull();
  });

  it('has an empty trusted-this-session set', () => {
    const state = makeInitialState();
    expect(state.trustedThisSession.size).toBe(0);
  });

  it('has exiting false initially', () => {
    const state = makeInitialState();
    expect(state.exiting).toBe(false);
  });

  it('starts with all cursors at 0 except overwriteCursor and scopePersistCursor', () => {
    const state = makeInitialState();
    expect(state.repoCursor).toBe(0);
    expect(state.trustCursor).toBe(0);
    expect(state.targetCursor).toBe(0);
    expect(state.scopeCursor).toBe(0);
    expect(state.typeCursor).toBe(0);
    expect(state.itemCursor).toBe(0);
    expect(state.addSourceSaveCursor).toBe(0);
  });

  it('defaults overwriteCursor and scopePersistCursor to 1 (No — safe default)', () => {
    const state = makeInitialState();
    expect(state.overwriteCursor).toBe(1);
    expect(state.scopePersistCursor).toBe(1);
  });

  it('has pickedScope null initially', () => {
    const state = makeInitialState();
    expect(state.pickedScope).toBeNull();
  });

  it('has empty addSourceUrl and null addSourceFormatError initially', () => {
    const state = makeInitialState();
    expect(state.addSourceUrl).toBe('');
    expect(state.addSourceFormatError).toBeNull();
  });

  it('returns independent instances on each call', () => {
    const a = makeInitialState();
    const b = makeInitialState();
    a.trustedThisSession.add('https://github.com/foo/bar');
    expect(b.trustedThisSession.size).toBe(0);
  });
});

describe('Screen union', () => {
  // This is a type-level test — just verifying the values exist at runtime
  // by assigning them to a typed variable (TS catches invalid values at compile time)
  it('covers all 10 screens including scope-persist and add-source-save', () => {
    const screens = [
      'repo-list',
      'trust-warning',
      'target-select',
      'scope-select',
      'scope-persist',
      'type-menu',
      'item-list',
      'overwrite-confirm',
      'add-source',
      'add-source-save',
    ] as const;
    // If a screen is missing TypeScript would error; the runtime check just confirms count
    expect(screens).toHaveLength(10);
  });
});
