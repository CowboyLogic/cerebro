import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  makeTreeResponse, makeSource,
  SAMPLE_SKILL_MD, SAMPLE_AGENT_MD,
} from '../../__fixtures__/tree-responses.js';

vi.mock('node:https', async () => {
  const mock = await import('../../__mocks__/node-https.js');
  return { default: mock.default, ...mock.default };
});

import { seedResponse, clearResponses } from '../../__mocks__/node-https.js';

beforeEach(() => clearResponses());

// makeSource() returns { owner: 'test-owner', repo: 'test-repo' }
const TREE_URL = 'api.github.com/repos/test-owner/test-repo/git/trees/main';
const RAW_URL = 'raw.githubusercontent.com/test-owner/test-repo/main';

describe('discoverComponents', () => {
  it('discovers skills from SKILL.md pattern', async () => {
    const tree = makeTreeResponse([
      { path: 'skills/my-skill', type: 'tree' },
      { path: 'skills/my-skill/SKILL.md', type: 'blob', size: 100 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_SKILL_MD);

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    const skill = components.find(c => c.name === 'my-skill');
    expect(skill).toBeTruthy();
    expect(skill?.type).toBe('skill');
    expect(skill?.compatibleTargets).toContain('claude-code');
  });

  it('discovers standalone markdown files in known directories', async () => {
    const tree = makeTreeResponse([
      { path: 'agents/reviewer.md', type: 'blob', size: 200 },
      { path: 'prompts/summarize.md', type: 'blob', size: 150 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_AGENT_MD);

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    expect(components.some(c => c.type === 'agent')).toBe(true);
    expect(components.some(c => c.type === 'prompt')).toBe(true);
  });

  it('deduplicates components from the same directory', async () => {
    const tree = makeTreeResponse([
      { path: 'skills/my-skill/SKILL.md', type: 'blob', size: 100 },
      { path: 'skills/my-skill/README.md', type: 'blob', size: 200 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_SKILL_MD);

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    const skills = components.filter(c => c.name === 'my-skill');
    expect(skills).toHaveLength(1);
  });

  it('returns empty array for tree with no matching patterns', async () => {
    const tree = makeTreeResponse([
      { path: 'src/index.ts', type: 'blob' },
      { path: 'package.json', type: 'blob' },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    expect(components).toHaveLength(0);
  });

  it('enriches description from file content', async () => {
    const tree = makeTreeResponse([
      { path: 'skills/my-skill/SKILL.md', type: 'blob', size: 100 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_SKILL_MD);

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    const skill = components.find(c => c.name === 'my-skill');
    expect(skill?.description).toContain('comprehensive tests');
  });

  it('extracts tags from file content', async () => {
    const tree = makeTreeResponse([
      { path: 'skills/my-skill/SKILL.md', type: 'blob', size: 100 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_SKILL_MD);

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    const skill = components.find(c => c.name === 'my-skill');
    expect(skill?.tags).toContain('typescript');
    expect(skill?.tags).toContain('testing');
  });

  it('gracefully handles description enrichment failure', async () => {
    const tree = makeTreeResponse([
      { path: 'skills/my-skill/SKILL.md', type: 'blob', size: 100 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 500, 'Internal Server Error');

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    expect(Array.isArray(components)).toBe(true);
  });

  it('discovers copilot-instructions.md as instruction type', async () => {
    const tree = makeTreeResponse([
      { path: '.github/copilot-instructions.md', type: 'blob', size: 200 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, '# Instructions\n\nFollow these rules.');

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    const inst = components.find(c => c.type === 'instruction');
    expect(inst).toBeTruthy();
    expect(inst?.compatibleTargets).toContain('copilot');
  });
});
