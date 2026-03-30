# SPEC-0003 — Source Provider

**Product:** cerebro CLI
**Status:** Draft
**Date:** 2026-03-29
**Area:** core
**Depends on:** none
**Consumed by:** SPEC-0004 (Session), SPEC-0005 (Catalog), SPEC-0006 (Installer)

---

## Overview

Defines the `SourceProvider` interface — the contract that any source repository host must satisfy for Cerebro to browse and download artifacts from it. The MVP ships one concrete implementation: `GitHubProvider`. Future providers (GitLab, Bitbucket, Azure DevOps, etc.) implement the same interface without changes to any other module.

A factory function (`createProvider`) detects the correct provider from a source URL's domain and returns a provider instance. Provider instances are cached per domain for the session to avoid redundant initialisation.

No module outside this one has any knowledge of GitHub-specific APIs, endpoints, or response formats.

---

## Scope

**In scope:**
- The `SourceProvider` interface (the binding contract for all providers)
- `RepoItem` — the provider-agnostic representation of a repository item
- `createProvider(url)` — factory that detects provider from URL and returns an instance
- `GitHubProvider` — MVP concrete implementation for `github.com`
- Session-scoped in-memory response caching (per provider instance)
- Input validation of owner and repo identifiers

**Out of scope:**
- Authentication / private repositories (MVP is public only)
- Parsing catalog files or detecting artifact types (SPEC-0005)
- Resolving install paths (SPEC-0001)
- Writing to the install manifest (SPEC-0002)

---

## Public Interface

```typescript
/**
 * Provider-agnostic representation of a single item in a repository.
 */
export interface RepoItem {
  /** File or directory name. */
  name: string;
  /** Full path within the repository. */
  path: string;
  /** Whether this item is a file or directory. */
  type: 'file' | 'dir';
  /** Direct URL to download raw file content (null for directories). */
  downloadUrl: string | null;
  /**
   * Provider's content hash / tree SHA for this item.
   * Used for cache keying and — when stored in the manifest — update detection.
   */
  sha: string;
}

/**
 * The contract that every source provider must satisfy.
 * All parameters use the provider-agnostic (owner, repo, path) model.
 *
 * 'owner' maps to: GitHub user/org, GitLab namespace, Bitbucket workspace, etc.
 * 'repo'  maps to: GitHub repo name, GitLab project name, Bitbucket repo slug, etc.
 */
export interface SourceProvider {
  /** The domain this provider handles. Example: 'github.com' */
  readonly domain: string;

  /**
   * List the contents of a directory.
   * Results are cached by owner/repo/path for the session.
   */
  listDirectory(owner: string, repo: string, path: string): Promise<RepoItem[]>;

  /**
   * Fetch the text content of a single file.
   * Results are cached by owner/repo/path for the session.
   */
  fetchFileContent(owner: string, repo: string, path: string): Promise<string>;

  /**
   * Recursively download a directory tree to a local destination path.
   * Preserves internal directory structure under destPath.
   * Used by the Installer to copy skill folders.
   */
  downloadDirectory(
    owner: string,
    repo: string,
    sourcePath: string,
    destPath: string
  ): Promise<void>;

  /**
   * Download a single file to a local path.
   * Creates parent directories if they do not exist.
   * Used by the Installer to copy instruction files.
   */
  downloadFile(
    owner: string,
    repo: string,
    sourcePath: string,
    destPath: string
  ): Promise<void>;
}

/**
 * Parses a source URL into its owner and repo components.
 * Works for any supported provider URL format.
 *
 * Example: parseRepoUrl('https://github.com/anthropics/skills')
 *   → { owner: 'anthropics', repo: 'skills' }
 */
export function parseRepoUrl(url: string): { owner: string; repo: string };

/**
 * Returns a SourceProvider instance appropriate for the given URL.
 * Detects the provider from the URL domain.
 * Provider instances are cached by domain — subsequent calls with the
 * same domain return the same instance.
 *
 * Throws UnsupportedProviderError if the URL's domain is not supported.
 */
export function createProvider(url: string): SourceProvider;

/**
 * Thrown when a source URL's domain does not match any supported provider.
 */
export class UnsupportedProviderError extends Error {
  readonly domain: string;
}
```

---

## MVP Provider: GitHubProvider

The `GitHubProvider` handles all `github.com` URLs. It is the only provider shipped in the MVP.

**Implementation details (informative, not binding):**
- Uses `@octokit/rest` for HTTP (header management, response parsing, TypeScript types)
- API base: `https://api.github.com/repos/{owner}/{repo}/contents/{path}`
- Response caching: in-memory `Map<string, RepoItem[] | string>` keyed by `owner/repo/path`
- File content: base64-decoded from GitHub API response to UTF-8 text
- `User-Agent` header: `Cerebro-CLI/{version}`
- `Accept` header: `application/vnd.github+json`

---

## Requirements

### Interface Requirements (apply to ALL providers)

| ID | Keyword | Requirement |
|----|---------|-------------|
| PRV-REQ-0001 | MUST | `owner` and `repo` MUST be validated before any network call. Valid pattern: `^[a-zA-Z0-9_.-]+$`, max 100 characters, MUST NOT contain path separators or `..`. |
| PRV-REQ-0002 | MUST | If `owner` or `repo` fail validation, the provider MUST throw `InvalidRepoIdentifierError` synchronously before any network call. |
| PRV-REQ-0003 | MUST | All responses MUST be cached in-memory for the session. Subsequent calls with the same `owner/repo/path` key MUST return the cached value without a network request. |
| PRV-REQ-0004 | MUST | The cache MUST be scoped to the provider instance. It MUST NOT persist to disk. |
| PRV-REQ-0005 | MUST | `downloadDirectory()` MUST recursively traverse all subdirectories and download all files, preserving structure under `destPath`. |
| PRV-REQ-0006 | MUST NOT | `downloadDirectory()` and `downloadFile()` MUST NOT write any file outside of `destPath`. Every resolved write path MUST be checked with `assertConfined(destPath, resolvedPath)` before writing. |
| PRV-REQ-0007 | MUST NOT | Providers MUST NOT write to `stdout`. All diagnostic output MUST use `stderr` or be suppressed (MCP-REQ-0014). |
| PRV-REQ-0008 | MUST NOT | Providers MUST NOT support private repositories in the MVP. A 401 / authentication-required response MUST surface as `PrivateRepoError`. |

### Factory Requirements

| ID | Keyword | Requirement |
|----|---------|-------------|
| PRV-REQ-0009 | MUST | `createProvider(url)` MUST parse the URL's domain and return the matching provider instance. |
| PRV-REQ-0010 | MUST | `createProvider(url)` MUST throw `UnsupportedProviderError` if the domain does not match any supported provider, with a message listing supported domains. |
| PRV-REQ-0011 | MUST | `createProvider(url)` MUST return the same provider instance for repeated calls with the same domain within a process (instance cache). |
| PRV-REQ-0012 | MUST | `parseRepoUrl(url)` MUST correctly extract `owner` and `repo` from a standard two-part repository URL path for all supported providers. |

### GitHubProvider-Specific Requirements

| ID | Keyword | Requirement |
|----|---------|-------------|
| PRV-REQ-0013 | MUST | GitHub requests MUST include a `User-Agent: Cerebro-CLI/{version}` header. |
| PRV-REQ-0014 | SHOULD | GitHub requests SHOULD include `Accept: application/vnd.github+json`. |
| PRV-REQ-0015 | MUST | HTTP 404 MUST surface as `RepoNotFoundError`. |
| PRV-REQ-0016 | MUST | HTTP 403 / 429 MUST surface as `RateLimitError` with a message noting the 60 req/hour unauthenticated limit. |
| PRV-REQ-0017 | MUST | File content from the GitHub API (base64-encoded) MUST be decoded to UTF-8 in `fetchFileContent()`. |

---

## Error Cases

| Condition | Error type | User-visible message |
|-----------|-----------|----------------------|
| Unsupported URL domain | `UnsupportedProviderError` | `'{domain}' is not a supported source provider. Supported: github.com` |
| Invalid owner / repo | `InvalidRepoIdentifierError` | `Invalid repository identifier: '{value}'. Only alphanumeric characters, hyphens, underscores, and dots are allowed.` |
| Repo not found / inaccessible | `RepoNotFoundError` | `Repository '{owner}/{repo}' not found. Make sure it exists and is public.` |
| Private repo (401) | `PrivateRepoError` | `'{owner}/{repo}' appears to be private. Cerebro currently supports public repositories only.` |
| Rate limit (403/429) | `RateLimitError` | `Rate limit reached. Please wait a few minutes. Unauthenticated requests are limited to 60/hour.` |
| Network failure | `NetworkError` | `Unable to reach {domain}. Check your internet connection and try again.` |
| Write path escapes destPath | `PathConfinementError` | (internal — never user-visible; indicates a Cerebro bug) |

---

## Notes

- `owner/repo` is an intentionally simple model that maps naturally to all major Git hosting providers. Provider-specific URL structures (e.g., GitLab sub-groups like `org/group/project`) are an implementation detail handled inside each provider's `parseRepoUrl` logic.
- Adding a new provider in a future release requires only: (1) implementing `SourceProvider`, (2) registering the domain in `createProvider`. No changes to catalog, installer, session, TUI, CLI, or MCP modules.
- The unauthenticated GitHub rate limit is 60 requests/hour per IP. For typical browsing sessions this is sufficient. Authentication (which raises the limit to 5,000/hour) is deferred to a future release.
