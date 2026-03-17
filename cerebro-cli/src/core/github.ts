import https from 'node:https';
import { RepoSource, ComponentFile } from './types.js';
import { logger } from '../utils/logger.js';

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

interface GitHubContentItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  download_url: string | null;
  content?: string;
  encoding?: string;
}

function fetchJSON<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'User-Agent': 'cerebro/1.0',
      'Accept': 'application/vnd.github.v3+json',
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    const t0 = Date.now();
    logger.debug(`fetchJSON → ${url}`);

    https.get(url, { headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        logger.debug(`fetchJSON redirect ${res.statusCode} → ${res.headers.location}`);
        fetchJSON<T>(res.headers.location!).then(resolve, reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const ms = Date.now() - t0;
        if (res.statusCode !== 200) {
          logger.warn(`fetchJSON ${res.statusCode} (${ms}ms) ${url}`, { body: data.slice(0, 300) });
          reject(new Error(`GitHub API ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        logger.debug(`fetchJSON 200 (${ms}ms) ${url}  bytes=${data.length}`);
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Failed to parse response: ${(e as Error).message}`)); }
      });
      res.on('error', (err) => {
        logger.error(`fetchJSON socket-error  ${url}  ${err.message}`);
        reject(err);
      });
    }).on('error', (err: Error) => {
      logger.error(`fetchJSON request-error  ${url}  ${err.message}`);
      reject(err);
    });
  });
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'User-Agent': 'cerebro/1.0',
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    const t0 = Date.now();
    logger.debug(`fetchText → ${url}`);

    https.get(url, { headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        logger.debug(`fetchText redirect ${res.statusCode} → ${res.headers.location}`);
        fetchText(res.headers.location!).then(resolve, reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const ms = Date.now() - t0;
        if (res.statusCode !== 200) {
          logger.warn(`fetchText ${res.statusCode} (${ms}ms) ${url}`);
          reject(new Error(`Fetch ${res.statusCode}: ${url}`));
          return;
        }
        logger.debug(`fetchText 200 (${ms}ms) ${url}  bytes=${data.length}`);
        resolve(data);
      });
      res.on('error', (err) => {
        logger.error(`fetchText socket-error  ${url}  ${err.message}`);
        reject(err);
      });
    }).on('error', (err: Error) => {
      logger.error(`fetchText request-error  ${url}  ${err.message}`);
      reject(err);
    });
  });
}

export async function getRepoTree(source: RepoSource): Promise<GitHubTreeItem[]> {
  const branch = source.branch || 'main';
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${branch}?recursive=1`;

  logger.info(`getRepoTree ${source.owner}/${source.repo}  branch=${branch}`);

  try {
    const response = await fetchJSON<GitHubTreeResponse>(url);
    let items = response.tree;
    if (source.path) {
      const prefix = source.path.endsWith('/') ? source.path : source.path + '/';
      items = items.filter(item => item.path.startsWith(prefix));
    }
    logger.debug(`getRepoTree result  items=${items.length}  truncated=${response.truncated}`);
    return items;
  } catch (err) {
    // Fallback: try 'master' branch
    if (!source.branch) {
      logger.debug(`getRepoTree 'main' failed, trying 'master'  error=${(err as Error).message}`);
      const fallbackUrl = `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/master?recursive=1`;
      try {
        const response = await fetchJSON<GitHubTreeResponse>(fallbackUrl);
        logger.debug(`getRepoTree master result  items=${response.tree.length}  truncated=${response.truncated}`);
        return response.tree;
      } catch (masterErr) {
        logger.warn(`getRepoTree 'master' branch also failed  ${(masterErr as Error).message}`);
        throw err; // throw the original 'main' error
      }
    }
    throw err;
  }
}

export async function getRepoContents(source: RepoSource, dirPath: string): Promise<GitHubContentItem[]> {
  const branch = source.branch || 'main';
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/contents/${dirPath}?ref=${branch}`;
  return fetchJSON<GitHubContentItem[]>(url);
}

export async function getFileContent(source: RepoSource, filePath: string): Promise<string> {
  const branch = source.branch || 'main';
  const rawUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${branch}/${filePath}`;
  return fetchText(rawUrl);
}

export async function getFileContents(source: RepoSource, filePaths: string[]): Promise<ComponentFile[]> {
  const results: ComponentFile[] = [];
  // Fetch in parallel batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (fp) => {
        try {
          const content = await getFileContent(source, fp);
          return { path: fp, name: fp.split('/').pop()!, content };
        } catch (err) {
          logger.warn(`getFileContents fetch-failed  path=${fp}  ${(err as Error).message}`);
          return { path: fp, name: fp.split('/').pop()! };
        }
      })
    );
    results.push(...batchResults);
  }
  return results;
}

// GitHub identifier validation patterns
const OWNER_RE = /^[a-zA-Z0-9][a-zA-Z0-9\-]{0,38}$/;
const REPO_RE = /^[a-zA-Z0-9][a-zA-Z0-9\-_.]{0,99}$/;

function validateGitHubIdentifiers(owner: string, repo: string, input: string): void {
  if (!OWNER_RE.test(owner)) {
    throw new Error(`Invalid GitHub owner "${owner}" in "${input}". Must be 1-39 alphanumeric characters or hyphens.`);
  }
  if (!REPO_RE.test(repo)) {
    throw new Error(`Invalid GitHub repository name "${repo}" in "${input}". Must be 1-100 alphanumeric characters, hyphens, underscores, or dots.`);
  }
}

export function parseRepoUrl(input: string): RepoSource {
  // Handle: owner/repo, https://github.com/owner/repo, github.com/owner/repo
  const cleaned = input
    .replace(/^https?:\/\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');

  const parts = cleaned.split('/');
  if (parts.length < 2) {
    throw new Error(`Invalid repository format: "${input}". Use owner/repo or a GitHub URL.`);
  }

  const owner = parts[0];
  const repo = parts[1];
  validateGitHubIdentifiers(owner, repo, input);

  return {
    owner,
    repo,
    path: parts.length > 2 ? parts.slice(2).join('/') : undefined,
  };
}
