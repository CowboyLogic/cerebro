/**
 * SPEC-0004 — Session
 *
 * Holds all in-memory state for a single Cerebro process run.
 * Created once at startup, passed into every operation.
 * Never persisted to disk directly.
 */

import { loadConfig, saveConfig, type CerebroConfig } from './config.js';
import { loadManifest, type InstallManifest } from './manifest.js';
import { createProvider, type SourceProvider } from './provider.js';
import type { ToolId, Scope } from '@cowboylogic/cerebro-schema';
import type { CatalogResult } from './catalog.js';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface Session {
  config: CerebroConfig;
  manifest: InstallManifest;
  getProvider(url: string): SourceProvider;
  target: ToolId | null;
  scope: Scope | null;
  catalogCache: Map<string, CatalogResult>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** SES-REQ-0001 through SES-REQ-0004 */
export function createSession(): Session {
  const config = loadConfig();
  const manifest = loadManifest();

  // Provider factory with domain-scoped cache (SES-REQ-0002)
  const providerCache = new Map<string, SourceProvider>();

  const session: Session = {
    config,
    manifest,

    getProvider(url: string): SourceProvider {
      const provider = createProvider(url);
      // The domain-level caching is handled inside createProvider (PRV-REQ-0011),
      // but the session also caches for the "same instance" guarantee at session scope.
      if (!providerCache.has(provider.domain)) {
        providerCache.set(provider.domain, provider);
      }
      return providerCache.get(provider.domain)!;
    },

    // SES-REQ-0003: pre-populate from config defaults
    target: config.defaults.target ?? null,
    // SES-REQ-0004:
    scope: config.defaults.scope ?? null,
    catalogCache: new Map(),
  };

  return session;
}

/** SES-REQ-0005: update session.target; persist to config.defaults if requested */
export function setTarget(session: Session, target: ToolId, persist: boolean): void {
  session.target = target;
  if (persist) {
    session.config = { ...session.config, defaults: { ...session.config.defaults, target } };
    saveConfig(session.config);
  }
}

/** SES-REQ-0006: update session.scope; persist to config.defaults if requested */
export function setScope(session: Session, scope: Scope, persist: boolean): void {
  session.scope = scope;
  if (persist) {
    session.config = { ...session.config, defaults: { ...session.config.defaults, scope } };
    saveConfig(session.config);
  }
}

/** Store a catalog result in the session cache */
export function cacheCatalog(
  session: Session,
  owner: string,
  repo: string,
  result: CatalogResult,
): void {
  session.catalogCache.set(`${owner}/${repo}`, result);
}

/** SES-REQ-0007: returns null if not yet fetched this session */
export function getCachedCatalog(
  session: Session,
  owner: string,
  repo: string,
): CatalogResult | null {
  return session.catalogCache.get(`${owner}/${repo}`) ?? null;
}

/** SES-REQ-0008: updates in-memory manifest only — no disk write */
export function updateManifest(session: Session, manifest: InstallManifest): void {
  session.manifest = manifest;
}
