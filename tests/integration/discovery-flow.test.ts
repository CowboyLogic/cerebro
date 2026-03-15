import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  makeTreeResponse, makeSource,
  SAMPLE_SKILL_MD, SAMPLE_AGENT_MD, SAMPLE_INSTRUCTION_MD,
} from '../__fixtures__/tree-responses.js';
import { seedResponse, clearResponses } from '../__mocks__/node-https.js';

vi.mock('node:https', async () => {
  const mock = await import('../__mocks__/node-https.js');
  return { default: mock.default, ...mock.default };
});

beforeEach(() => clearResponses());

// makeSource() → { owner: 'test-owner', repo: 'test-repo' }
const TREE_URL = 'api.github.com/repos/test-owner/test-repo/git/trees/main';
const RAW_URL = 'raw.githubusercontent.com/test-owner/test-repo/main';

describe('discoverComponents — full mixed tree', () => {
  it('discovers components of multiple types', async () => {
    const tree = makeTreeResponse([
      { path: 'skills/my-skill/SKILL.md', type: 'blob', size: 512 },
      { path: 'agents/reviewer.md', type: 'blob', size: 400 },
      { path: 'prompts/summarize.md', type: 'blob', size: 200 },
      { path: '.github/copilot-instructions.md', type: 'blob', size: 150 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, '# Component\n\nA description here.');

    const { discoverComponents } = await import('../../src/core/registry.js');
    const components = await discoverComponents(makeSource());

    const types = components.map(c => c.type);
    expect(types).toContain('skill');
    expect(types).toContain('agent');
    expect(types).toContain('prompt');
    expect(types).toContain('instruction');
  });
});

describe('discoverComponents — deduplication', () => {
  it('emits only one component per directory', async () => {
    const tree = makeTreeResponse([
      { path: 'skills/my-skill/SKILL.md', type: 'blob', size: 100 },
      { path: 'skills/my-skill/README.md', type: 'blob', size: 200 },
      { path: 'skills/my-skill/LICENSE.txt', type: 'blob', size: 50 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_SKILL_MD);

    const { discoverComponents } = await import('../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    const skills = components.filter(c => c.name === 'my-skill');
    expect(skills).toHaveLength(1);
    // All files in the directory should be attached
    expect(skills[0].files.length).toBe(3);
  });
});

describe('discoverComponents — enrichDescription', () => {
  it('sets description from first non-heading line', async () => {
    const tree = makeTreeResponse([
      { path: 'skills/my-skill/SKILL.md', type: 'blob', size: 100 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_SKILL_MD);

    const { discoverComponents } = await import('../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    expect(components[0].description).toContain('comprehensive tests');
  });

  it('extracts tags from frontmatter-style tag line', async () => {
    const tree = makeTreeResponse([
      { path: 'skills/my-skill/SKILL.md', type: 'blob', size: 100 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_SKILL_MD);

    const { discoverComponents } = await import('../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    expect(components[0].tags).toContain('typescript');
  });

  it('truncates description longer than 100 chars', async () => {
    const longDesc = 'A'.repeat(110);
    const content = `# Skill\n\n${longDesc}`;
    const tree = makeTreeResponse([{ path: 'skills/test/SKILL.md', type: 'blob', size: 100 }]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, content);

    const { discoverComponents } = await import('../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    expect(components[0].description.length).toBeLessThanOrEqual(100);
    expect(components[0].description.endsWith('...')).toBe(true);
  });
});

describe('discoverComponents — main/master fallback', () => {
  it('falls back to master and succeeds', async () => {
    seedResponse('trees/main', 404, 'Not Found');
    const tree = makeTreeResponse([{ path: 'skills/test/SKILL.md', type: 'blob', size: 100 }]);
    seedResponse('trees/master', 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_SKILL_MD);

    const { discoverComponents } = await import('../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    expect(components.length).toBeGreaterThan(0);
  });
});

describe('discoverComponents — source.path filtering', () => {
  it('only returns components under the specified path prefix', async () => {
    const tree = makeTreeResponse([
      { path: 'skills/my-skill/SKILL.md', type: 'blob', size: 100 },
      { path: 'agents/bot.md', type: 'blob', size: 200 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_SKILL_MD);

    const { discoverComponents } = await import('../../src/core/registry.js');
    const components = await discoverComponents({ ...makeSource(), path: 'skills' });
    expect(components.every(c => c.type === 'skill')).toBe(true);
    expect(components.some(c => c.type === 'agent')).toBe(false);
  });
});
