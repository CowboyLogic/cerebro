# SPEC-0010 — GitHub Authentication and Session Catalog Cache

**Product:** cerebro CLI
**Status:** Accepted
**Date:** 2026-04-05
**Related ADRs:** [CLI-0003](../adr/CLI-0003-github-auth-and-catalog-cache.md)
**Amends:** [SPEC-0003](SPEC-0003-provider.md) (adds `resolveGitHubToken`, amends `GitHubProvider` constructor), [SPEC-0007](SPEC-0007-tui.md) (amends `loadCatalogAndProceed`)

---

## Overview

Addresses GitHub API rate limiting (60 req/hour unauthenticated) by automatically detecting a GitHub token from the user's environment and wiring it into Octokit. Separately, eliminates redundant `fetchCatalog` network calls within a single session by checking `session.catalogCache` before making any API call.

Both features are transparent to the user — no configuration required, no new CLI flags, no UI changes.

---

## Scope

**In scope:**
- `resolveGitHubToken()` — tiered token lookup: env vars → `gh auth token`
- Wiring the detected token into `GitHubProvider` via Octokit's `auth` option
- `session.catalogCache` population and lookup in `app.tsx`

**Out of scope:**
- Private repository support (the token is used only for rate limit relief, not for auth-gated access)
- Persisting the catalog cache across sessions
- Surfacing token status in the UI (no "authenticated as X" display)
- OAuth flows or interactive authentication
- Token scoping validation (we accept any non-empty string; GitHub will reject an invalid one naturally)

---

## Public Interface

### New export: `resolveGitHubToken`

Added to `src/core/provider.ts`:

```typescript
/**
 * Attempts to resolve a GitHub personal access token from the environment.
 *
 * Lookup order:
 *   1. process.env.GITHUB_TOKEN
 *   2. process.env.GH_TOKEN
 *   3. stdout of `gh auth token` (GitHub CLI)
 *
 * Returns the first non-empty string found, or undefined if none is available.
 * MUST NOT throw under any circumstances — absent gh, non-zero exit, or malformed
 * output are all treated as "no token available".
 */
export function resolveGitHubToken(): string | undefined;
```

### Amended: `createProvider`

`createProvider(url)` now internally calls `resolveGitHubToken()` and passes the result to `GitHubProvider`. The `createProvider` signature is unchanged — callers are unaffected.

### Amended: `GitHubProvider` constructor (internal)

```typescript
// Internal — not part of the public SourceProvider interface
class GitHubProvider {
  constructor(token?: string);
}
```

The `token` argument, when provided, is passed as `auth: token` to the Octokit constructor. When absent, Octokit is constructed without `auth` (unauthenticated, as today).

### Session catalog cache (app.tsx, internal)

No new public interface. The existing `session.catalogCache: Map<string, CatalogResult>` field is populated and read within `loadCatalogAndProceed`. The cache key is the source URL string.

---

## Requirements

### Token Resolution

| ID | Keyword | Requirement |
|----|---------|-------------|
| AUTH-REQ-0001 | MUST | `resolveGitHubToken()` MUST check `process.env.GITHUB_TOKEN` first. If it is a non-empty string, return it immediately without checking further. |
| AUTH-REQ-0002 | MUST | If `GITHUB_TOKEN` is absent or empty, `resolveGitHubToken()` MUST check `process.env.GH_TOKEN`. If it is a non-empty string, return it immediately. |
| AUTH-REQ-0003 | MUST | If both env vars are absent or empty, `resolveGitHubToken()` MUST attempt to execute `gh auth token` as a child process with a timeout of 2,000 ms. |
| AUTH-REQ-0004 | MUST | If `gh auth token` exits with code 0 and produces non-empty stdout, `resolveGitHubToken()` MUST return the trimmed stdout string. |
| AUTH-REQ-0005 | MUST NOT | `resolveGitHubToken()` MUST NOT throw under any circumstances. If `gh` is not found, exits non-zero, times out, or produces empty output, the function MUST return `undefined`. |
| AUTH-REQ-0006 | MUST NOT | The resolved token value MUST NOT appear in any log, TUI output, error message, or console statement. |
| AUTH-REQ-0007 | MUST | `createProvider(url)` MUST call `resolveGitHubToken()` and pass the result to `GitHubProvider`. |
| AUTH-REQ-0008 | MUST | When a token is available, Octokit MUST be constructed with `auth: token`. When absent, Octokit MUST be constructed without `auth`. |

### Catalog Cache

| ID | Keyword | Requirement |
|----|---------|-------------|
| CACHE-REQ-0001 | MUST | Before calling `fetchCatalog`, `loadCatalogAndProceed` MUST check `session.catalogCache` using the active source URL as the key. |
| CACHE-REQ-0002 | MUST | On a cache hit, `loadCatalogAndProceed` MUST use the cached `CatalogResult` directly without making any network call. |
| CACHE-REQ-0003 | MUST | On a cache miss and successful `fetchCatalog`, `loadCatalogAndProceed` MUST write the result to `session.catalogCache` keyed by the source URL before proceeding. |
| CACHE-REQ-0004 | MUST NOT | On a cache miss and `fetchCatalog` failure, `loadCatalogAndProceed` MUST NOT write anything to `session.catalogCache`. The error path is unchanged. |
| CACHE-REQ-0005 | MUST NOT | The catalog cache MUST NOT be persisted to disk. It is session-scoped and discarded when the process exits. |

---

## Error Cases

No new error types are introduced.

| Condition | Behaviour |
|-----------|-----------|
| `gh` not installed | `resolveGitHubToken()` returns `undefined`; provider is unauthenticated |
| `gh auth token` times out (> 2 s) | `resolveGitHubToken()` returns `undefined`; provider is unauthenticated |
| `gh auth token` exits non-zero | `resolveGitHubToken()` returns `undefined`; provider is unauthenticated |
| Invalid/expired token | GitHub API returns 401; surfaces as `PrivateRepoError` (existing error class — unchanged) |
| Rate limit despite token | GitHub API returns 403/429; surfaces as `RateLimitError` (existing error class — unchanged) |

---

## Open Questions

*(none — all resolved in ADR CLI-0003)*
