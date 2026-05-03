/**
 * SPEC-0003 — Source Provider
 *
 * Defines the SourceProvider interface and the GitHubProvider MVP implementation.
 * No module outside this file has knowledge of GitHub-specific APIs.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Octokit } from '@octokit/rest';

// Read version from package.json for the User-Agent header
export const VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RepoItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  downloadUrl: string | null;
  sha: string;
}

export interface SourceProvider {
  readonly domain: string;
  listDirectory(owner: string, repo: string, path: string): Promise<RepoItem[]>;
  fetchFileContent(owner: string, repo: string, path: string): Promise<string>;
  downloadDirectory(
    owner: string,
    repo: string,
    sourcePath: string,
    destPath: string,
  ): Promise<void>;
  downloadFile(
    owner: string,
    repo: string,
    sourcePath: string,
    destPath: string,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class UnsupportedProviderError extends Error {
  readonly domain: string;
  constructor(domain: string) {
    super(`'${domain}' is not a supported source provider. Supported: github.com`);
    this.name = 'UnsupportedProviderError';
    this.domain = domain;
  }
}

export class InvalidRepoIdentifierError extends Error {
  constructor(value: string) {
    super(
      `Invalid repository identifier: '${value}'. ` +
        'Only alphanumeric characters, hyphens, underscores, and dots are allowed.',
    );
    this.name = 'InvalidRepoIdentifierError';
  }
}

export class RepoNotFoundError extends Error {
  constructor(owner: string, repo: string) {
    super(
      `Repository '${owner}/${repo}' not found or inaccessible. ` +
        'Make sure it exists and that your token has access to it.',
    );
    this.name = 'RepoNotFoundError';
  }
}

export class FileNotFoundError extends Error {
  constructor(owner: string, repo: string, filePath: string) {
    super(`File '${filePath}' not found in '${owner}/${repo}'.`);
    this.name = 'FileNotFoundError';
  }
}

export class PrivateRepoError extends Error {
  constructor(owner: string, repo: string) {
    super(
      `Authentication failed for '${owner}/${repo}'. ` +
        'Your token may be invalid or expired.',
    );
    this.name = 'PrivateRepoError';
  }
}

export class RateLimitError extends Error {
  constructor() {
    super(
      'Rate limit reached. Please wait a few minutes. ' +
        'Unauthenticated requests are limited to 60/hour.',
    );
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends Error {
  constructor(domain: string, cause: unknown) {
    super(`Unable to reach ${domain}. Check your internet connection and try again.`);
    this.name = 'NetworkError';
    if (cause instanceof Error) this.cause = cause;
  }
}

export class PathConfinementError extends Error {
  constructor(target: string, base: string) {
    super(`Path confinement violation: '${target}' escapes '${base}'`);
    this.name = 'PathConfinementError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const IDENTIFIER_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const MAX_IDENTIFIER_LENGTH = 100;

function validateIdentifiers(owner: string, repo: string): void {
  for (const [label, value] of [['owner', owner], ['repo', repo]] as const) {
    if (
      !IDENTIFIER_PATTERN.test(value) ||
      value.length > MAX_IDENTIFIER_LENGTH ||
      value.includes('..')
    ) {
      throw new InvalidRepoIdentifierError(value);
    }
  }
}

function assertConfined(base: string, target: string): void {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  const separator = path.sep;
  if (
    resolvedTarget !== resolvedBase &&
    !resolvedTarget.startsWith(resolvedBase + separator)
  ) {
    throw new PathConfinementError(target, base);
  }
}

function mapApiError(err: unknown, owner: string, repo: string, domain: string): never {
  const status = (err as Record<string, unknown>)?.status;
  if (status === 404) throw new RepoNotFoundError(owner, repo);
  if (status === 401) throw new PrivateRepoError(owner, repo);
  if (status === 403 || status === 429) throw new RateLimitError();
  throw new NetworkError(domain, err);
}

/**
 * AUTH-REQ-0001–0006: Tiered GitHub token detection.
 * Checks GITHUB_TOKEN → GH_TOKEN → `gh auth token` CLI. Never throws.
 */
export function resolveGitHubToken(): string | undefined {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    const out = execSync('gh auth token', { timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] });
    const trimmed = out.toString().trim();
    return trimmed || undefined;
  } catch {
    return undefined;
  }
}

/**
 * PRV-REQ-0018: Returns a human-readable label for the active GitHub auth
 * source. Detection order mirrors resolveGitHubToken. Never returns a token
 * value — only a label string.
 */
export function resolveGitHubTokenSource(): 'GITHUB_TOKEN' | 'GH_TOKEN' | 'gh CLI' | 'none' {
  if (process.env.GITHUB_TOKEN) return 'GITHUB_TOKEN';
  if (process.env.GH_TOKEN) return 'GH_TOKEN';
  try {
    const out = execSync('gh auth token', { timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] });
    const trimmed = out.toString().trim();
    if (trimmed) return 'gh CLI';
  } catch {
    // fall through
  }
  return 'none';
}

// ---------------------------------------------------------------------------
// GitHubProvider
// ---------------------------------------------------------------------------

class GitHubProvider implements SourceProvider {
  readonly domain = 'github.com';
  private readonly _octokit: Octokit;
  private readonly _cache = new Map<string, RepoItem[] | string>();

  constructor(token?: string) {
    this._octokit = new Octokit({
      userAgent: `Cerebro-CLI/${VERSION}`,
      ...(token ? { auth: token } : {}),
      headers: {
        accept: 'application/vnd.github+json',
      },
      // Suppress Octokit's built-in HTTP logging — errors surface through our
      // own error classes (RateLimitError, RepoNotFoundError, etc.) and must
      // not bleed raw log lines into the Ink TUI output.
      log: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    });
  }

  async listDirectory(owner: string, repo: string, dirPath: string): Promise<RepoItem[]> {
    // PRV-REQ-0001/0002: validate before any network call
    validateIdentifiers(owner, repo);

    const cacheKey = `dir:${owner}/${repo}/${dirPath}`;
    const cached = this._cache.get(cacheKey);
    if (cached !== undefined) return cached as RepoItem[];

    let response: Awaited<ReturnType<typeof this._octokit.rest.repos.getContent>>;
    try {
      response = await this._octokit.rest.repos.getContent({ owner, repo, path: dirPath });
    } catch (err) {
      mapApiError(err, owner, repo, this.domain);
    }

    const items = Array.isArray(response!.data) ? response!.data : [];
    const result: RepoItem[] = items.map((item) => ({
      name: item.name,
      path: item.path,
      type: (item.type === 'dir' ? 'dir' : 'file') as 'file' | 'dir',
      sha: item.sha ?? '',
      downloadUrl: (item as Record<string, unknown>).download_url as string | null ?? null,
    }));

    this._cache.set(cacheKey, result);
    return result;
  }

  async fetchFileContent(owner: string, repo: string, filePath: string): Promise<string> {
    validateIdentifiers(owner, repo);

    const cacheKey = `file:${owner}/${repo}/${filePath}`;
    const cached = this._cache.get(cacheKey);
    if (cached !== undefined) return cached as string;

    let response: Awaited<ReturnType<typeof this._octokit.rest.repos.getContent>>;
    try {
      response = await this._octokit.rest.repos.getContent({ owner, repo, path: filePath });
    } catch (err) {
      const status = (err as Record<string, unknown>)?.status;
      if (status === 404) throw new FileNotFoundError(owner, repo, filePath);
      mapApiError(err, owner, repo, this.domain);
    }

    const data = response!.data as Record<string, unknown>;
    if (Array.isArray(data)) {
      throw new Error(`Path '${filePath}' is a directory, not a file`);
    }

    // Empty files have content === '' — return empty string rather than throwing
    if (!data['content']) {
      this._cache.set(cacheKey, '');
      return '';
    }

    // PRV-REQ-0017: base64 decode to UTF-8
    const content = Buffer.from(
      (data['content'] as string).replace(/\n/g, ''),
      'base64',
    ).toString('utf-8');

    this._cache.set(cacheKey, content);
    return content;
  }

  async downloadDirectory(
    owner: string,
    repo: string,
    sourcePath: string,
    destPath: string,
  ): Promise<void> {
    validateIdentifiers(owner, repo);

    const items = await this.listDirectory(owner, repo, sourcePath);
    fs.mkdirSync(destPath, { recursive: true });

    for (const item of items) {
      const relName = item.name;
      const localPath = path.join(destPath, relName);

      // PRV-REQ-0006: confine every write
      assertConfined(destPath, localPath);

      if (item.type === 'dir') {
        await this.downloadDirectory(owner, repo, item.path, localPath);
      } else {
        const content = await this.fetchFileContent(owner, repo, item.path);
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, content, 'utf8');
      }
    }
  }

  async downloadFile(
    owner: string,
    repo: string,
    sourcePath: string,
    destPath: string,
  ): Promise<void> {
    validateIdentifiers(owner, repo);

    // PRV-REQ-0006: confine the write
    assertConfined(path.dirname(destPath), destPath);

    const content = await this.fetchFileContent(owner, repo, sourcePath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content, 'utf8');
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Module-level provider instance cache keyed by domain+token (PRV-REQ-0011) */
const _providerCache = new Map<string, SourceProvider>();

export function createProvider(url: string): SourceProvider {
  const domain = extractDomain(url);
  const token = resolveGitHubToken();
  const cacheKey = `${domain}:${token ?? ''}`;

  if (_providerCache.has(cacheKey)) return _providerCache.get(cacheKey)!;

  let provider: SourceProvider;
  switch (domain) {
    case 'github.com':
      provider = new GitHubProvider(token);
      break;
    default:
      throw new UnsupportedProviderError(domain);
  }

  _providerCache.set(cacheKey, provider);
  return provider;
}

export function parseRepoUrl(url: string): { owner: string; repo: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: '${url}'`);
  }
  // Strip leading slash and trailing slash, then split on '/'
  const parts = parsed.pathname.replace(/^\//, '').replace(/\/$/, '').split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Cannot parse owner/repo from URL '${url}'. Expected format: https://github.com/owner/repo`,
    );
  }
  return { owner: parts[0], repo: parts[1] };
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    throw new UnsupportedProviderError(url);
  }
}
