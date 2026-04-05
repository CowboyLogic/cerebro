# CLI-0003: GitHub Token Detection and Session-Level Catalog Cache

**Level:** CLI
**Status:** Accepted
**Date:** 2026-04-05

## Context

The Cerebro CLI communicates with the GitHub API through Octokit. Without authentication, the API enforces a rate limit of 60 requests per hour per IP address. A typical TUI session — source selection, catalog fetch, heuristic directory walk — consumes 10–30 requests per source. Users who browse multiple sources, or who have a NAT-shared IP, hit the limit quickly and receive `RateLimitError` within a single session.

Two patterns exist in the developer ecosystem for resolving this:

1. **Token detection** — check well-known environment variables (`GITHUB_TOKEN`, `GH_TOKEN`) and, as a further fallback, run `gh auth token` to read the GitHub CLI's stored token. No user action required if the token already exists. Authenticated requests have a 5,000 req/hour limit.
2. **Shallow clone** — replace API calls with a `git clone --depth 1` of the target repo so all browsing becomes local filesystem operations. Eliminates rate limits but requires `git` on `PATH`, downloads the full working tree before the user has chosen anything, introduces temp directory lifecycle, and breaks the on-demand browsing model.

A third, complementary problem exists independently of authentication: navigating back to the source list and re-selecting a source triggers a fresh `fetchCatalog` call even though the result is identical to the previous one. The `Session` object already carries a `catalogCache: Map<string, CatalogResult>` field that is never populated.

## Decision

1. **Token detection at provider construction time.** `GitHubProvider` is constructed with an optional `token` argument. The factory (`createProvider`) calls a new `resolveGitHubToken()` function that checks, in order: `process.env.GITHUB_TOKEN`, `process.env.GH_TOKEN`, and the output of `gh auth token` (run as a child process, silently). The first non-empty string wins. If none is found, the provider is constructed without a token (unauthenticated as today).

2. **Session-level catalog cache in `app.tsx`.** Before calling `fetchCatalog`, `loadCatalogAndProceed` checks `session.catalogCache` keyed by `sourceUrl`. On a hit the result is used immediately — no network call. On a miss the result is written to the cache after a successful fetch.

## Rationale

**Token detection over shallow clone.** Clone requires `git` on `PATH` as a runtime dependency (currently none beyond Node.js), downloads the full working tree before user intent is known, breaks on-demand browsing, and adds temp-directory cleanup. Token detection is a pure environment read with one optional child process — no new runtime dependencies, no architecture change to the browsing model.

**Tiered token lookup order.** `GITHUB_TOKEN` is the canonical environment variable used by GitHub Actions and most CI systems; it is the most likely to be set in a power user's shell profile. `GH_TOKEN` is the variable set by the GitHub CLI itself when running commands. `gh auth token` handles users who have `gh` installed and authenticated but have not exported the token as an env var. Checking environment variables first avoids spawning a child process in the common case.

**`gh auth token` via child process.** The alternative — reading `gh`'s token store directly from `~/.config/gh/hosts.yml` — is a private file format subject to change without notice. Running `gh auth token` uses the supported public interface.

**Cache keyed by source URL at session scope.** The existing `session.catalogCache` field is the correct place to hold this — it is session-scoped (never persisted), already transported to every call site via the `session` argument, and documents the intent. Keying by URL means the cache is invalidated naturally if the user adds a new source mid-session.

**Cache population in `app.tsx`, not in `catalog.ts`.** The catalog module's responsibility is fetching and parsing; caching navigation state belongs in the consumer. Putting it in `catalog.ts` would require the module to accept and mutate a cache argument, leaking session concerns into a stateless utility.

Alternatives considered and rejected:
- **Shallow clone** — see above.
- **Require users to set `GITHUB_TOKEN` with documentation only** — adds friction; most users will not read docs before hitting the error.
- **Persist catalog to disk across sessions** — stale catalog risk; adds a file format and invalidation strategy; out of scope for MVP.

## Consequences

**Easier:**
- Users who have `gh` installed or `GITHUB_TOKEN` set get 5,000 req/hour automatically, transparent to them.
- Re-selecting a source in the current session is instant (no network round-trip).
- `RateLimitError` should become rare in normal interactive use.

**Harder / new obligations:**
- `resolveGitHubToken()` must be unit-tested with the child process mocked; it must not throw if `gh` is absent or exits non-zero.
- `GitHubProvider` constructor must accept an optional token and pass it to Octokit — this is a breaking change to the constructor signature (internal; no external callers outside `createProvider`).
- `app.tsx` gains a cache-check path in `loadCatalogAndProceed`; the test suite must cover both hit and miss.
- The token discovery output should **never** be logged at any level — it must not appear in TUI output or in any log file.

## Compliance

- `resolveGitHubToken()` MUST be exported from `provider.ts` and MUST NOT throw under any circumstances (no `gh`, wrong token format, child process crash — all treated as "no token").
- `GitHubProvider` MUST accept an optional `token` string in its constructor and pass it as the `auth` option to Octokit when present.
- `createProvider` MUST call `resolveGitHubToken()` and pass the result to `GitHubProvider`.
- `loadCatalogAndProceed` in `app.tsx` MUST check `session.catalogCache` before calling `fetchCatalog`, and MUST write the result to `session.catalogCache` on success.
- No log statement, `console.log`, or TUI text may reference token values.

---

*Supersedes: (none)*
*Related: [SPEC-0003](../spec/SPEC-0003-provider.md), [SPEC-0004](../spec/SPEC-0004-session.md), [SPEC-0007](../spec/SPEC-0007-tui.md)*
