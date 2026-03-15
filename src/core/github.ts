import https from 'node:https';
import { RepoSource, ComponentFile } from './types.js';

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
      'User-Agent': 'ai-artifact-installer/1.0',
      'Accept': 'application/vnd.github.v3+json',
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    https.get(url, { headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchJSON<T>(res.headers.location!).then(resolve, reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Failed to parse response: ${(e as Error).message}`)); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'User-Agent': 'ai-artifact-installer/1.0',
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    https.get(url, { headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchText(res.headers.location!).then(resolve, reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Fetch ${res.statusCode}: ${url}`));
          return;
        }
        resolve(data);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

export async function getRepoTree(source: RepoSource): Promise<GitHubTreeItem[]> {
  const branch = source.branch || 'main';
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${branch}?recursive=1`;

  try {
    const response = await fetchJSON<GitHubTreeResponse>(url);
    let items = response.tree;
    if (source.path) {
      const prefix = source.path.endsWith('/') ? source.path : source.path + '/';
      items = items.filter(item => item.path.startsWith(prefix));
    }
    return items;
  } catch (err) {
    // Fallback: try 'master' branch
    if (!source.branch) {
      const fallbackUrl = `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/master?recursive=1`;
      try {
        const response = await fetchJSON<GitHubTreeResponse>(fallbackUrl);
        return response.tree;
      } catch {
        throw err;
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
        } catch {
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
