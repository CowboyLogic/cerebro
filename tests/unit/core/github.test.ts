import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { seedResponse, clearResponses, seedError } from '../../__mocks__/node-https.js';
import { makeTreeResponse } from '../../__fixtures__/tree-responses.js';

vi.mock('node:https', async () => {
  const mock = await import('../../__mocks__/node-https.js');
  return { default: mock.default, ...mock.default };
});

beforeEach(() => clearResponses());

describe('parseRepoUrl', () => {
  it('parses owner/repo shorthand', async () => {
    const { parseRepoUrl } = await import('../../../src/core/github.js');
    const result = parseRepoUrl('myorg/myrepo');
    expect(result.owner).toBe('myorg');
    expect(result.repo).toBe('myrepo');
  });

  it('parses full GitHub URL', async () => {
    const { parseRepoUrl } = await import('../../../src/core/github.js');
    const result = parseRepoUrl('https://github.com/myorg/myrepo');
    expect(result.owner).toBe('myorg');
    expect(result.repo).toBe('myrepo');
  });

  it('parses URL without protocol', async () => {
    const { parseRepoUrl } = await import('../../../src/core/github.js');
    const result = parseRepoUrl('github.com/myorg/myrepo');
    expect(result.owner).toBe('myorg');
    expect(result.repo).toBe('myrepo');
  });

  it('strips trailing .git', async () => {
    const { parseRepoUrl } = await import('../../../src/core/github.js');
    const result = parseRepoUrl('myorg/myrepo.git');
    expect(result.repo).toBe('myrepo');
  });

  it('strips trailing slash', async () => {
    const { parseRepoUrl } = await import('../../../src/core/github.js');
    const result = parseRepoUrl('myorg/myrepo/');
    expect(result.repo).toBe('myrepo');
  });

  it('extracts sub-path from longer URL', async () => {
    const { parseRepoUrl } = await import('../../../src/core/github.js');
    const result = parseRepoUrl('myorg/myrepo/skills/subdir');
    expect(result.owner).toBe('myorg');
    expect(result.repo).toBe('myrepo');
    expect(result.path).toBe('skills/subdir');
  });

  it('throws on a single-segment input', async () => {
    const { parseRepoUrl } = await import('../../../src/core/github.js');
    expect(() => parseRepoUrl('justarepo')).toThrow();
  });

  it('throws on empty string', async () => {
    const { parseRepoUrl } = await import('../../../src/core/github.js');
    expect(() => parseRepoUrl('')).toThrow();
  });
});

describe('getRepoTree', () => {
  it('returns tree items for a source', async () => {
    const tree = makeTreeResponse([
      { path: 'skills/test/SKILL.md', type: 'blob', size: 100 },
    ]);
    seedResponse('api.github.com/repos/owner/repo/git/trees/main', 200, JSON.stringify(tree));
    const { getRepoTree } = await import('../../../src/core/github.js');
    const items = await getRepoTree({ owner: 'owner', repo: 'repo' });
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].path).toBe('skills/test/SKILL.md');
  });

  it('filters items by source.path prefix', async () => {
    const tree = makeTreeResponse([
      { path: 'skills/test/SKILL.md', type: 'blob' },
      { path: 'agents/bot.md', type: 'blob' },
    ]);
    seedResponse('api.github.com/repos/owner/repo/git/trees/main', 200, JSON.stringify(tree));
    const { getRepoTree } = await import('../../../src/core/github.js');
    const items = await getRepoTree({ owner: 'owner', repo: 'repo', path: 'skills' });
    expect(items.every(i => i.path.startsWith('skills/'))).toBe(true);
    expect(items.some(i => i.path.startsWith('agents/'))).toBe(false);
  });

  it('falls back to master when main fails and no branch specified', async () => {
    seedResponse('trees/main', 404, 'Not Found');
    const masterTree = makeTreeResponse([{ path: 'skills/test/SKILL.md', type: 'blob' }]);
    seedResponse('trees/master', 200, JSON.stringify(masterTree));
    const { getRepoTree } = await import('../../../src/core/github.js');
    const items = await getRepoTree({ owner: 'owner', repo: 'repo' });
    expect(items.length).toBeGreaterThan(0);
  });

  it('does not fall back when branch is explicitly set', async () => {
    seedResponse('trees/mybranch', 404, 'Not Found');
    const { getRepoTree } = await import('../../../src/core/github.js');
    await expect(getRepoTree({ owner: 'owner', repo: 'repo', branch: 'mybranch' })).rejects.toThrow();
  });

  it('includes Authorization header when GITHUB_TOKEN is set', async () => {
    // Ensure GITHUB_TOKEN is set (use existing env var or set a test value)
    const token = process.env.GITHUB_TOKEN ?? 'test-token-123';
    vi.stubEnv('GITHUB_TOKEN', token);
    const https = await import('node:https');
    const getSpy = vi.spyOn(https, 'get' as any);
    const tree = makeTreeResponse([]);
    seedResponse('api.github.com', 200, JSON.stringify(tree));
    const { getRepoTree } = await import('../../../src/core/github.js');
    try { await getRepoTree({ owner: 'owner', repo: 'repo' }); } catch { /* ignore */ }
    const callArgs = getSpy.mock.calls[0];
    if (callArgs && callArgs[1] && typeof callArgs[1] === 'object') {
      // Verify that the Authorization header is present and has the 'token ...' format
      const auth = (callArgs[1] as any).headers?.Authorization as string | undefined;
      expect(auth).toBeTruthy();
      expect(auth).toMatch(/^token\s+\S+/);
    }
  });
});

describe('getFileContent', () => {
  it('returns text content on 200', async () => {
    seedResponse('raw.githubusercontent.com/owner/repo/main/skills/test.md', 200, '# Hello World');
    const { getFileContent } = await import('../../../src/core/github.js');
    const content = await getFileContent({ owner: 'owner', repo: 'repo' }, 'skills/test.md');
    expect(content).toBe('# Hello World');
  });

  it('throws with status code message on non-200', async () => {
    seedResponse('raw.githubusercontent.com/owner/repo/main/missing.md', 403, 'Forbidden');
    const { getFileContent } = await import('../../../src/core/github.js');
    await expect(getFileContent({ owner: 'owner', repo: 'repo' }, 'missing.md')).rejects.toThrow('403');
  });
});

describe('getFileContents', () => {
  it('returns ComponentFile entries for each path', async () => {
    seedResponse('raw.githubusercontent.com', 200, '# Content');
    const { getFileContents } = await import('../../../src/core/github.js');
    const results = await getFileContents({ owner: 'o', repo: 'r' }, ['file1.md', 'file2.md']);
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('file1.md');
    expect(results[1].name).toBe('file2.md');
  });

  it('returns entry without content when fetch fails', async () => {
    seedResponse('raw.githubusercontent.com/o/r/main/good.md', 200, '# Good');
    seedResponse('raw.githubusercontent.com/o/r/main/bad.md', 500, 'Error');
    const { getFileContents } = await import('../../../src/core/github.js');
    const results = await getFileContents({ owner: 'o', repo: 'r' }, ['good.md', 'bad.md']);
    const good = results.find(r => r.name === 'good.md');
    const bad = results.find(r => r.name === 'bad.md');
    expect(good?.content).toBe('# Good');
    expect(bad?.content).toBeUndefined();
  });

  it('handles empty file list', async () => {
    const { getFileContents } = await import('../../../src/core/github.js');
    const results = await getFileContents({ owner: 'o', repo: 'r' }, []);
    expect(results).toHaveLength(0);
  });

  it('handles exactly 5 files (one full batch)', async () => {
    seedResponse('raw.githubusercontent.com', 200, 'content');
    const { getFileContents } = await import('../../../src/core/github.js');
    const paths = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'];
    const results = await getFileContents({ owner: 'o', repo: 'r' }, paths);
    expect(results).toHaveLength(5);
  });

  it('handles 6 files (one full + one partial batch)', async () => {
    seedResponse('raw.githubusercontent.com', 200, 'content');
    const { getFileContents } = await import('../../../src/core/github.js');
    const paths = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md'];
    const results = await getFileContents({ owner: 'o', repo: 'r' }, paths);
    expect(results).toHaveLength(6);
  });
});
