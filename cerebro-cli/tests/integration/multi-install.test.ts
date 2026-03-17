import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeComponent, SAMPLE_SKILL_MD } from '../__fixtures__/tree-responses.js';

vi.mock('node:fs', () => ({
  default: { writeFileSync: vi.fn(), mkdirSync: vi.fn(), readFileSync: vi.fn(() => { throw new Error('ENOENT'); }) },
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => { throw new Error('ENOENT'); }),
}));

vi.mock('../../src/utils/paths.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/utils/paths.js')>();
  return { ...original, findWorkspaceRoot: vi.fn(() => null), ensureDir: vi.fn() };
});

vi.mock('../../src/core/github.js', () => ({
  getFileContents: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('installMultiple — sequential install', () => {
  it('installs all components and returns results for each', async () => {
    const { getFileContents } = await import('../../src/core/github.js');
    vi.mocked(getFileContents).mockResolvedValue([
      { path: 'skills/c/SKILL.md', name: 'SKILL.md', content: SAMPLE_SKILL_MD },
    ]);

    const { installMultiple } = await import('../../src/core/installer.js');
    const comps = [
      makeComponent({ name: 'comp-a' }),
      makeComponent({ name: 'comp-b' }),
      makeComponent({ name: 'comp-c' }),
    ];
    const results = await installMultiple(comps, 'claude-code', 'user');

    expect(results).toHaveLength(3);
    expect(results.every(r => r.success)).toBe(true);
  });
});

describe('installMultiple — partial failure does not abort', () => {
  it('continues after a failed component', async () => {
    const { getFileContents } = await import('../../src/core/github.js');

    let callCount = 0;
    vi.mocked(getFileContents).mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        // Second component: return file with no content to trigger failure
        return [{ path: 'skills/b/SKILL.md', name: 'SKILL.md' }];
      }
      return [{ path: 'skills/a/SKILL.md', name: 'SKILL.md', content: SAMPLE_SKILL_MD }];
    });

    const { installMultiple } = await import('../../src/core/installer.js');
    const comps = [
      makeComponent({ name: 'comp-a' }),
      makeComponent({ name: 'comp-b' }), // will fail
      makeComponent({ name: 'comp-c' }),
    ];
    const results = await installMultiple(comps, 'claude-code', 'user');

    expect(results).toHaveLength(3);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[2].success).toBe(true);
  });
});
