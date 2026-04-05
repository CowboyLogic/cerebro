/**
 * SPEC-0007 — TUI: App root component + screen router.
 */

// ---------------------------------------------------------------------------

import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import path from 'node:path';
import type { Artifact, ArtifactType, Scope } from '@cowboylogic/cerebro-schema';
import type { Session } from '../core/session.js';

import {
  trustSource,
  addSource,
  resolveInstallBase,
  type SourceEntry,
} from '../core/config.js';
import { setTarget, setScope } from '../core/session.js';
import { fetchCatalog } from '../core/catalog.js';
import { installArtifact } from '../core/installer.js';
import { parseRepoUrl, resolveGitHubTokenSource } from '../core/provider.js';
import { Banner, type AuthSource } from './banner.js';
import { getArtifactStatus, type ArtifactStatus } from '../core/manifest.js';
import { makeInitialState, type TuiState } from './types.js';
import { handleKey, PAGE_SIZE, MVP_TARGETS, type KeyEvent, type TuiAction } from './transitions.js';
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
} from './screens.js';

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export interface AppProps {
  session: Session;
  pageSize?: number;
  authSource?: AuthSource;
}

export function App({ session, pageSize = PAGE_SIZE, authSource = 'none' }: AppProps) {
  const { exit } = useApp();

  const [state, setState] = useState<TuiState>(() => {
    const s = makeInitialState(pageSize);
    // Pre-populate target/scope from session (SES-REQ-0003/SES-REQ-0004)
    s.target = session.target;
    s.scope = session.scope;
    if (s.target && s.scope) s.targetChosen = true;
    return s;
  });

  // stateRef mirrors state so async handlers always read fresh values
  const stateRef = useRef(state);
  stateRef.current = state;

  // Actions queued by handleKey, dispatched via useEffect
  const pendingActionRef = useRef<TuiAction | null>(null);

  // -------------------------------------------------------------------------
  // Single keyboard handler (CLI-0002)
  // -------------------------------------------------------------------------

  function toKeyEvent(input: string, key: { upArrow?: boolean; downArrow?: boolean; leftArrow?: boolean; rightArrow?: boolean; return?: boolean; escape?: boolean; backspace?: boolean; delete?: boolean; ctrl?: boolean; meta?: boolean }): KeyEvent {
    const isSpecial = key.ctrl || key.meta || key.escape || key.return ||
      key.upArrow || key.downArrow || key.leftArrow || key.rightArrow ||
      key.backspace || key.delete;
    const isPrintable = !isSpecial && input.length >= 1 && input !== ' ';
    return {
      upArrow:    key.upArrow    ?? false,
      downArrow:  key.downArrow  ?? false,
      leftArrow:  key.leftArrow  ?? false,
      rightArrow: key.rightArrow ?? false,
      return:     (key.return ?? false) || input === '\r' || input === '\n',
      escape:     key.escape     ?? false,
      backspace:  key.backspace  ?? false,
      delete:     key.delete     ?? false,
      space:      input === ' '  && !key.ctrl && !key.meta,
      ctrl:       key.ctrl       ?? false,
      meta:       key.meta       ?? false,
      char:       isPrintable ? input : null,
    };
  }

  useInput((input, key) => {
    const ev = toKeyEvent(input, key);
    const enabledSources = session.config.sources.filter(s => s.enabled);

    setState(s => {
      const [newState, action] = handleKey(s, ev, enabledSources);
      if (action) pendingActionRef.current = action;
      return newState;
    });
  });

  useEffect(() => {
    const action = pendingActionRef.current;
    if (!action) return;
    pendingActionRef.current = null;

    switch (action.type) {
      case 'exit':           exit(); break;
      case 'select-source':  void handleSelectSource(action.source); break;
      case 'trust':          void handleTrust(action.source); break;
      case 'install':        void doInstall(action.artifact, action.overwrite); break;
      case 'validate-url':   void handleRequestValidate(action.url); break;
      case 'add-source':     void handleAddSource(action.url, action.save); break;
      case 'scope-selected': handleScopeComplete(action.scope, action.persist); break;
    }
  }, [state]); // runs after every state update

  // -------------------------------------------------------------------------
  // Async handlers
  // -------------------------------------------------------------------------

  async function handleSelectSource(source: SourceEntry) {
    const s = stateRef.current;
    const trusted = source.trusted || s.trustedThisSession.has(source.url);
    if (!trusted) {
      setState(prev => ({ ...prev, screen: 'trust-warning', activeSource: source, error: null }));
      return;
    }
    await loadCatalogAndProceed(source);
  }

  async function handleTrust(source: SourceEntry) {
    try {
      session.config = trustSource(session.config, source.url);
    } catch {
      const { owner, repo } = parseRepoUrl(source.url);
      session.config = addSource(session.config, {
        name: `${owner}/${repo}`,
        url: source.url,
        enabled: true,
        trusted: true,
      });
    }
    setState(prev => {
      const next = new Set(prev.trustedThisSession);
      next.add(source.url);
      return { ...prev, trustedThisSession: next };
    });
    await loadCatalogAndProceed(source);
  }

  async function loadCatalogAndProceed(source: SourceEntry) {
    // CACHE-REQ-0001/0002: check session cache before any network call
    const cached = session.catalogCache.get(source.url);
    if (cached) {
      if (!stateRef.current.targetChosen) {
        const defaultIdx = Math.max(0, MVP_TARGETS.findIndex(t => t.id === session.config.defaults?.target));
        setState(prev => ({ ...prev, activeSource: source, catalog: cached, loading: null, screen: 'target-select', targetCursor: defaultIdx }));
        return;
      }
      setState(prev => ({ ...prev, activeSource: source }));
      proceedToTypeMenu(cached);
      return;
    }

    setState(prev => ({ ...prev, loading: `Fetching catalog from ${source.name}…`, activeSource: source }));
    try {
      const { owner, repo } = parseRepoUrl(source.url);
      const provider = session.getProvider(source.url);
      const catalog = await fetchCatalog(provider, owner, repo);
      session.catalogCache.set(source.url, catalog); // CACHE-REQ-0003: write on success

      if (!stateRef.current.targetChosen) {
        const defaultIdx = Math.max(0, MVP_TARGETS.findIndex(t => t.id === session.config.defaults?.target));
        setState(prev => ({ ...prev, catalog, loading: null, screen: 'target-select', targetCursor: defaultIdx }));
        return;
      }
      proceedToTypeMenu(catalog);
    } catch (err) {
      // CACHE-REQ-0004: do NOT write to cache on failure
      setState(prev => ({ ...prev, loading: null, screen: 'repo-list', error: (err as Error).message }));
    }
  }

  function proceedToTypeMenu(catalog = stateRef.current.catalog!) {
    const types = [...new Set(catalog.artifacts.map(a => a.type))] as ArtifactType[];
    if (types.length === 0) {
      setState(prev => ({
        ...prev, catalog, loading: null, screen: 'type-menu',
        error: 'No artifacts were found in this source. This can happen if the repository has no matching artifacts or if GitHub rate limits were hit.',
      }));
      return;
    }
    if (types.length === 1) {
      setState(prev => ({
        ...prev, catalog, loading: null, screen: 'item-list',
        selectedType: types[0], itemCursor: 0, filter: '', page: 0,
      }));
      return;
    }
    setState(prev => ({ ...prev, catalog, loading: null, screen: 'type-menu', typeCursor: 0 }));
  }

  function handleScopeComplete(scope: Scope, persist: boolean) {
    setTarget(session, stateRef.current.target!, persist);
    setScope(session, scope, persist);
    setState(prev => ({ ...prev, scope, targetChosen: true }));
    proceedToTypeMenu();
  }

  async function doInstall(artifact: Artifact, overwrite: boolean) {
    const s = stateRef.current;
    setState(prev => ({ ...prev, loading: `Installing ${artifact.name}…`, error: null }));
    const { owner, repo } = parseRepoUrl(s.activeSource!.url);
    const provider = session.getProvider(s.activeSource!.url);
    const outcome = await installArtifact(
      artifact, owner, repo,
      s.target!, s.scope!,
      session.config, session.manifest, provider,
      { overwrite },
    );
    setState(prev => ({
      ...prev,
      loading: null,
      error: outcome.status === 'error' ? outcome.message : null,
    }));
  }

  async function handleRequestValidate(url: string) {
    setState(prev => ({ ...prev, loading: 'Validating…', error: null }));
    try {
      const { owner, repo } = parseRepoUrl(url);
      const provider = session.getProvider(url);
      await provider.listDirectory(owner, repo, '');
      setState(prev => ({ ...prev, loading: null, screen: 'add-source-save' }));
    } catch (err) {
      setState(prev => ({ ...prev, loading: null, error: (err as Error).message }));
    }
  }

  async function handleAddSource(url: string, save: boolean) {
    const { owner, repo } = parseRepoUrl(url);
    const entry: SourceEntry = { name: `${owner}/${repo}`, url, enabled: true, trusted: false };
    if (save) session.config = addSource(session.config, entry);
    setState(prev => ({
      ...prev, activeSource: entry, screen: 'trust-warning',
      error: null, addSourceUrl: '', addSourceFormatError: null,
    }));
  }

  // -------------------------------------------------------------------------
  // Status helper
  // -------------------------------------------------------------------------

  function getStatus(artifact: Artifact): ArtifactStatus {
    const s = stateRef.current;
    if (!s.target || !s.scope) return 'available';
    try {
      const base = resolveInstallBase(session.config, s.target, artifact.type, s.scope);
      const installPath = artifact.type === 'skill'
        ? path.join(base, artifact.id)
        : path.join(base, path.basename(artifact.source));
      return getArtifactStatus(
        session.manifest, artifact.id, s.activeSource?.url ?? '',
        s.target, s.scope, installPath,
      );
    } catch {
      return 'available';
    }
  }

  function resolveInstallPath(artifact: Artifact): string {
    const s = stateRef.current;
    const base = resolveInstallBase(session.config, s.target!, artifact.type, s.scope!);
    return artifact.type === 'skill'
      ? path.join(base, artifact.id)
      : path.join(base, path.basename(artifact.source));
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const { screen } = state;
  const enabledSources = session.config.sources.filter(s => s.enabled);

  return (
    <Box flexDirection="column">
      <Banner session={session} authSource={authSource} />

      {state.loading && <Loading message={state.loading} />}

      {!state.loading && screen === 'repo-list' && (
        <RepoList
          sources={enabledSources}
          cursor={state.repoCursor}
          error={state.error}
        />
      )}

      {!state.loading && screen === 'trust-warning' && state.activeSource && (
        <TrustWarning
          sourceUrl={state.activeSource.url}
          cursor={state.trustCursor}
        />
      )}

      {!state.loading && screen === 'target-select' && (
        <TargetSelect cursor={state.targetCursor} />
      )}

      {!state.loading && screen === 'scope-select' && (
        <ScopeSelect cursor={state.scopeCursor} />
      )}

      {!state.loading && screen === 'scope-persist' && (
        <ScopePersist cursor={state.scopePersistCursor} />
      )}

      {!state.loading && screen === 'type-menu' && state.catalog && (
        <TypeMenu
          sourceName={state.activeSource?.name ?? ''}
          target={state.target ?? 'claude-code'}
          scope={state.scope ?? 'workspace'}
          types={[...new Set(state.catalog.artifacts.map(a => a.type))] as ArtifactType[]}
          counts={state.catalog.artifacts.reduce<Record<string, number>>((acc, a) => {
            acc[a.type] = (acc[a.type] ?? 0) + 1; return acc;
          }, {})}
          cursor={state.typeCursor}
          error={state.error}
        />
      )}

      {!state.loading && screen === 'item-list' && state.catalog && (
        <ItemList
          sourceName={state.activeSource?.name ?? ''}
          selectedType={state.selectedType!}
          target={state.target ?? 'claude-code'}
          scope={state.scope ?? 'workspace'}
          artifacts={state.catalog.artifacts.filter(a => a.type === state.selectedType)}
          getStatus={getStatus}
          filter={state.filter}
          cursor={state.itemCursor}
          page={state.page}
          pageSize={state.pageSize}
          installing={state.loading}
          installError={state.error}
        />
      )}

      {!state.loading && screen === 'overwrite-confirm' && state.pendingOverwrite && (
        <OverwriteConfirm
          artifact={state.pendingOverwrite}
          installPath={resolveInstallPath(state.pendingOverwrite)}
          status={getStatus(state.pendingOverwrite)}
          cursor={state.overwriteCursor}
        />
      )}

      {!state.loading && screen === 'add-source' && (
        <AddSource
          url={state.addSourceUrl}
          formatError={state.addSourceFormatError}
          validating={false}
          error={state.error}
        />
      )}

      {!state.loading && screen === 'add-source-save' && (
        <AddSourceSave cursor={state.addSourceSaveCursor} />
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Entry-point
// ---------------------------------------------------------------------------

/** Launch the full TUI. Called when cerebro is invoked with no arguments. */
export async function runTui(): Promise<void> {
  const { createSession } = await import('../core/session.js');
  const { ConfigParseError } = await import('../core/config.js');
  const { ManifestParseError } = await import('../core/manifest.js');
  const { render } = await import('ink');

  let session;
  try {
    session = createSession();
  } catch (err) {
    if (err instanceof ConfigParseError || err instanceof ManifestParseError) {
      process.stderr.write(`${(err as Error).message}\n`);
      process.exit(1);
    }
    throw err;
  }

  // TUI-REQ-0017: switch to the alternate screen buffer (like vim/less) so the
  // terminal is fully restored to its prior state when the TUI exits.
  const ENTER_ALT = '\x1b[?1049h';
  const EXIT_ALT  = '\x1b[?1049l';
  const CURSOR_HOME = '\x1b[H';
  process.stdout.write(ENTER_ALT + CURSOR_HOME);
  try {
    const authSource = resolveGitHubTokenSource();
    const { waitUntilExit } = render(
      <App
        session={session}
        pageSize={session.config.defaults.ui?.pageSize ?? PAGE_SIZE}
        authSource={authSource}
      />,
    );
    await waitUntilExit();
  } finally {
    process.stdout.write(EXIT_ALT);
  }
}
