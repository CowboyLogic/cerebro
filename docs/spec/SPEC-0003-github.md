# SPEC-0003 — GitHub API Client

**Product:** cerebro CLI
**Status:** Draft
**Date:** 2026-03-29
**Area:** core
**Depends on:** none
**Consumed by:** SPEC-0005 (Catalog), SPEC-0006 (Installer)

---

## Overview

Provides access to public GitHub repositories via the GitHub REST API. Handles fetching directory listings, individual file contents, and downloading artifact trees to local disk. All responses are cached in-memory for the session to avoid redundant API calls when the user navigates back to a previously-visited repo.

This module has no knowledge of artifact types, catalog formats, or install paths — it is a pure GitHub access layer.

---

## Scope

**In scope:**
- Fetching directory contents (listing) from a GitHub repo
- Fetching a single file's text content from a GitHub repo
- Downloading a directory tree (artifact folder) to a local destination
- Session-scoped in-memory response caching
- Input validation of owner and repo identifiers

**Out of scope:**
- Authentication / private repositories (MVP is public only)
- Parsing catalog files or detecting artifact types (SPEC-0005)
- Resolving install paths (SPEC-0001)
- Writing to the install manifest (SPEC-0002)

---

## Public Interface

```typescript
export interface RepoItem {
  /** File or directory name. */
  name: string;
  /** Full path within the repository. */
  path: string;
  /** Whether this item is a file or directory. */
  type: 'file' | 'dir';
  /** Direct download URL for file content (null for directories). */
  downloadUrl: string | null;
  /** Git blob SHA (used for cache keying). */
  sha: string;
}

export interface GitHubClient {
  /**
   * List the contents of a directory in a GitHub repo.
   * Results are cached by owner/repo/path for the session.
   */
  listDirectory(owner: string, repo: string, path: string): Promise<RepoItem[]>;

  /**
   * Fetch the text content of a single file.
   * Results are cached by owner/repo/path for the session.
   */
  fetchFileContent(owner: string, repo: string, path: string): Promise<string>;

  /**
   * Recursively download a directory tree from a GitHub repo to a local destination.
   * Creates the destination directory if it does not exist.
   * Used by the Installer to copy skill folders to the install path.
   */
  downloadDirectory(
    owner: string,
    repo: string,
    sourcePath: string,
    destPath: string
  ): Promise<void>;

  /**
   * Download a single file from a GitHub repo to a local path.
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
 * Create a new GitHub client instance bound to a session cache.
 * One client instance should be created per session (see SPEC-0004).
 */
export function createGitHubClient(): GitHubClient;
```

---

## Requirements

| ID | Keyword | Requirement |
|----|---------|-------------|
| GH-REQ-0001 | MUST | All requests MUST target the GitHub REST API (`https://api.github.com/repos/{owner}/{repo}/contents/{path}`). |
| GH-REQ-0002 | MUST | `owner` and `repo` MUST be validated before any network call. Valid pattern: `^[a-zA-Z0-9_.-]+$`, max 100 characters each, MUST NOT contain path separators or `..`. |
| GH-REQ-0003 | MUST | If `owner` or `repo` fail validation, the client MUST throw synchronously before making any network call. |
| GH-REQ-0004 | MUST | All responses MUST be cached in-memory keyed by `owner/repo/path`. Subsequent calls with the same key MUST return the cached value without a network request. |
| GH-REQ-0005 | MUST | The cache MUST be scoped to the client instance (session-scoped). It MUST NOT persist to disk. |
| GH-REQ-0006 | MUST | `downloadDirectory()` MUST recursively traverse all subdirectories and download all files, preserving the directory structure under `destPath`. |
| GH-REQ-0007 | MUST NOT | `downloadDirectory()` and `downloadFile()` MUST NOT write any file outside of `destPath`. The resolved absolute write path MUST be checked with `assertConfined(destPath, resolvedFilePath)` before each write. |
| GH-REQ-0008 | MUST | HTTP 404 responses MUST be surfaced as a `RepoNotFoundError` with the owner/repo/path in the message. |
| GH-REQ-0009 | MUST | HTTP 403 / 429 (rate limit) responses MUST be surfaced as a `RateLimitError` with a user-friendly message indicating the issue. |
| GH-REQ-0010 | MUST | All requests MUST include a `User-Agent` header identifying Cerebro (e.g., `Cerebro-CLI/1.0`). |
| GH-REQ-0011 | SHOULD | Requests SHOULD include an `Accept: application/vnd.github+json` header per GitHub API best practices. |
| GH-REQ-0012 | MUST NOT | The client MUST NOT support private repositories in the MVP. If a 401 response is received, it MUST surface a `PrivateRepoError` explaining that only public repositories are supported. |
| GH-REQ-0013 | MUST | File content returned by the GitHub API (base64-encoded) MUST be decoded to UTF-8 text in `fetchFileContent()`. |

---

## Error Cases

| Condition | Error type | User-visible message |
|-----------|-----------|----------------------|
| Invalid owner or repo identifier | `InvalidRepoIdentifierError` | `Invalid repository identifier: '{value}'. Only alphanumeric characters, hyphens, underscores, and dots are allowed.` |
| HTTP 404 | `RepoNotFoundError` | `Repository '{owner}/{repo}' not found or is not accessible. Make sure the repository exists and is public.` |
| HTTP 401 | `PrivateRepoError` | `'{owner}/{repo}' appears to be a private repository. Cerebro currently supports public repositories only.` |
| HTTP 403 / 429 | `RateLimitError` | `GitHub API rate limit reached. Please wait a few minutes and try again. Unauthenticated requests are limited to 60/hour.` |
| Network failure | `NetworkError` | `Unable to reach GitHub. Check your internet connection and try again.` |
| Write path escapes destPath | `PathConfinementError` | (internal — never exposed to user directly; indicates a Cerebro bug) |

---

## Notes

- The `@octokit/rest` library is used to implement the HTTP layer (see architecture tech decisions). It handles header management, response parsing, and provides TypeScript types for GitHub API responses.
- `assertConfined(base, target)` is a security utility (carried forward from provisional code) that calls `path.resolve()` on both arguments and throws `PathConfinementError` if `target` does not start with `base`. It MUST be called before every file write in `downloadDirectory()` and `downloadFile()`.
- The unauthenticated rate limit is 60 requests/hour per IP. For typical browsing sessions this is sufficient. Authentication support is deferred to a future release.
