# SPEC-0004 — Session

**Product:** cerebro CLI
**Status:** Draft
**Date:** 2026-03-29
**Area:** core
**Depends on:** SPEC-0001 (Config), SPEC-0002 (Manifest), SPEC-0003 (GitHub Client)
**Consumed by:** All TUI screens, CLI mode, MCP mode

---

## Overview

Holds all in-memory state for a single Cerebro run. The session is created once at startup, loaded with config and manifest data, and passed into every operation. It is the single point of truth for the current target, scope, cached catalog results, and live config/manifest state.

Session state is never persisted between runs — it exists only for the duration of the process. Persistence of user choices (target, scope, trust) is handled by writing back to config or manifest via their respective modules.

---

## Scope

**In scope:**
- Aggregating config, manifest, and GitHub client into a single session object
- Holding the current target and scope selections (set once per session in TUI mode)
- Caching catalog fetch results (delegated to the GitHub client cache, surfaced here for convenience)
- Providing initialisation defaults from config

**Out of scope:**
- Loading or saving config (SPEC-0001)
- Loading or saving the manifest (SPEC-0002)
- Network calls (SPEC-0003)
- Any UI or presentation logic

---

## Public Interface

```typescript
import type { ToolId, Scope } from '@cowboylogic/cerebro-schema';
import type { CerebroConfig } from './config.js';
import type { InstallManifest } from './manifest.js';
import type { GitHubClient } from './github.js';
import type { CatalogResult } from './catalog.js';

export interface Session {
  /** Loaded user config (merged with bundled defaults). */
  config: CerebroConfig;
  /** Loaded install manifest. */
  manifest: InstallManifest;
  /** GitHub API client (owns the session-scoped response cache). */
  github: GitHubClient;
  /**
   * The target tool selected for this session.
   * Null until set by the TUI, CLI args, or MCP call.
   * Pre-populated from config.defaults.target if present.
   */
  target: ToolId | null;
  /**
   * The install scope selected for this session.
   * Null until set. Pre-populated from config.defaults.scope if present.
   */
  scope: Scope | null;
  /**
   * Catalog results cached by 'owner/repo'.
   * Populated on first repo visit; reused on return visits within the session.
   */
  catalogCache: Map<string, CatalogResult>;
}

/**
 * Initialise a new session.
 * Loads config and manifest from disk. Creates a fresh GitHub client.
 * Pre-populates target and scope from config.defaults if present.
 */
export function createSession(): Session;

/**
 * Set the session target and optionally persist to config.defaults.
 */
export function setTarget(session: Session, target: ToolId, persist: boolean): void;

/**
 * Set the session scope and optionally persist to config.defaults.
 */
export function setScope(session: Session, scope: Scope, persist: boolean): void;

/**
 * Store a catalog result in the session cache.
 */
export function cacheCatalog(session: Session, owner: string, repo: string, result: CatalogResult): void;

/**
 * Retrieve a cached catalog result. Returns null if not yet fetched this session.
 */
export function getCachedCatalog(session: Session, owner: string, repo: string): CatalogResult | null;

/**
 * Update the session's in-memory manifest after an install operation.
 * Does not write to disk — the Installer (SPEC-0006) is responsible for that.
 */
export function updateManifest(session: Session, manifest: InstallManifest): void;
```

---

## Requirements

| ID | Keyword | Requirement |
|----|---------|-------------|
| SES-REQ-0001 | MUST | `createSession()` MUST call `loadConfig()` and `loadManifest()` and store the results on the session object. |
| SES-REQ-0002 | MUST | `createSession()` MUST create a new `GitHubClient` instance (SPEC-0003) and store it on the session. |
| SES-REQ-0003 | MUST | If `config.defaults.target` is set, `createSession()` MUST pre-populate `session.target` with that value. |
| SES-REQ-0004 | MUST | If `config.defaults.scope` is set, `createSession()` MUST pre-populate `session.scope` with that value. |
| SES-REQ-0005 | MUST | `setTarget()` with `persist: true` MUST call `saveConfig()` with the updated defaults. |
| SES-REQ-0006 | MUST | `setScope()` with `persist: true` MUST call `saveConfig()` with the updated defaults. |
| SES-REQ-0007 | MUST | `getCachedCatalog()` MUST return `null` (not throw) if the repo has not been fetched this session. |
| SES-REQ-0008 | MUST NOT | Session state MUST NOT be written to disk in any form other than explicit calls to `saveConfig()` or `saveManifest()`. |
| SES-REQ-0009 | MUST | There MUST be exactly one `Session` instance per process invocation. All modules that need session state MUST receive it as a parameter; they MUST NOT maintain their own global state. |

---

## Error Cases

Session creation errors are propagated from their originating modules:

| Condition | Source | Behaviour |
|-----------|--------|-----------|
| Config file corrupt | SPEC-0001 | `createSession()` propagates `ConfigParseError` — process exits with message |
| Manifest file corrupt | SPEC-0002 | `createSession()` propagates `ManifestParseError` — process exits with message |
| Config directory not writable | SPEC-0001 | Propagated on first-run creation; process exits with message |

---

## Notes

- The session object is a plain mutable object, not a class. This keeps it easy to pass across module boundaries and simple to test.
- `catalogCache` is intentionally separate from the GitHub client cache. The GitHub client caches raw API responses; the catalog cache stores parsed, validated `CatalogResult` objects that have already been through the catalog module's heuristic or validation logic.
- `updateManifest()` only updates the in-memory `session.manifest` reference. The Installer (SPEC-0006) is responsible for calling `saveManifest()` after a successful install.
