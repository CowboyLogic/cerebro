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
// More specific pattern so it doesn't collide with other raw file URLs
const MANIFEST_URL = 'test-repo/main/cerebro.json';

describe('discoverComponents — heuristic', () => {
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

  describe('name sanitization', () => {
    it('strips path traversal sequences from component directory names', async () => {
      const tree = makeTreeResponse([
        { path: '../../.ssh/SKILL.md', type: 'blob', size: 100 },
      ]);
      seedResponse(TREE_URL, 200, JSON.stringify(tree));
      seedResponse(RAW_URL, 500, 'not found'); // enrichment not needed

      const { discoverComponents } = await import('../../../src/core/registry.js');
      const components = await discoverComponents(makeSource());
      // If any component was discovered, its name must not contain '..' or path separators
      for (const c of components) {
        expect(c.name).not.toContain('..');
        expect(c.name).not.toContain('/');
        expect(c.name).not.toContain('\\');
      }
    });

    it('strips path traversal from standalone file names', async () => {
      const tree = makeTreeResponse([
        { path: 'agents/../../../etc/passwd.md', type: 'blob', size: 100 },
      ]);
      seedResponse(TREE_URL, 200, JSON.stringify(tree));
      seedResponse(RAW_URL, 500, 'not found');

      const { discoverComponents } = await import('../../../src/core/registry.js');
      const components = await discoverComponents(makeSource());
      for (const c of components) {
        expect(c.name).not.toContain('..');
        expect(c.name).not.toContain('/');
      }
    });
  });

  it('flat-collection creates one component per file, not one per directory', async () => {
    const tree = makeTreeResponse([
      { path: 'agents/code-review.agent.md', type: 'blob', size: 200 },
      { path: 'agents/planner.md', type: 'blob', size: 180 },
      { path: 'agents/refactor.agent.md', type: 'blob', size: 220 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_AGENT_MD);

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    const agents = components.filter(c => c.type === 'agent');
    expect(agents).toHaveLength(3);
  });

  it('strips TYPE_SUFFIXES from flat-collection component names', async () => {
    const tree = makeTreeResponse([
      { path: 'agents/code-review.agent.md', type: 'blob', size: 200 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_AGENT_MD);

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    const agent = components.find(c => c.type === 'agent');
    expect(agent?.name).toBe('code-review');
  });

  it('ignores files nested deeper than one level inside flat-collection dirs', async () => {
    const tree = makeTreeResponse([
      { path: 'agents/my-agent/agent.md', type: 'blob', size: 100 },
      { path: 'agents/my-agent/README.md', type: 'blob', size: 80 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_AGENT_MD);

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    // agents/my-agent/agent.md is depth-3, so flat-collection ignores it.
    // Pass 1 (dir-marker) picks up agent.md as marker → one component named 'my-agent'.
    const flat = components.filter(c => c.path === 'agents/my-agent/agent.md');
    expect(flat).toHaveLength(0);
    // Dir-marker should have found it instead
    const dirMarker = components.find(c => c.name === 'my-agent');
    expect(dirMarker).toBeTruthy();
    expect(dirMarker?.type).toBe('agent');
  });

  it('dir-marker component prevents flat-collection from double-counting its files', async () => {
    const tree = makeTreeResponse([
      { path: 'skills/my-skill/SKILL.md', type: 'blob', size: 100 },
      { path: 'skills/my-skill/README.md', type: 'blob', size: 200 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_SKILL_MD);

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    const skills = components.filter(c => c.type === 'skill');
    // Should be exactly one, not duplicated
    expect(skills).toHaveLength(1);
    // And it should bundle both files
    expect(skills[0].files).toHaveLength(2);
  });
});

describe('discoverComponents — manifest (cerebro.json)', () => {
  it('uses manifest when cerebro.json is present', async () => {
    const manifest = {
      cerebro: '1',
      name: 'test-repo',
      components: [
        {
          name: 'my-skill',
          type: 'skill',
          description: 'A test skill',
          files: ['skills/my-skill/SKILL.md'],
          targets: ['claude-code'],
        },
      ],
    };
    // Seed manifest before RAW_URL so it wins the substring match for cerebro.json
    seedResponse(MANIFEST_URL, 200, JSON.stringify(manifest));
    seedResponse(RAW_URL, 200, SAMPLE_SKILL_MD);

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe('my-skill');
    expect(components[0].type).toBe('skill');
    expect(components[0].compatibleTargets).toContain('claude-code');
  });

  it('falls back to heuristic when cerebro.json is absent', async () => {
    // No manifest seeded — mock returns 404, loadManifest returns null
    const tree = makeTreeResponse([
      { path: 'agents/reviewer.md', type: 'blob', size: 200 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    // RAW_URL seeded for enrichment; cerebro.json URL also matches RAW_URL but
    // JSON.parse(SAMPLE_AGENT_MD) throws → loadManifest returns null → heuristic runs
    seedResponse(RAW_URL, 200, SAMPLE_AGENT_MD);

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    expect(components.some(c => c.type === 'agent')).toBe(true);
  });

  it('falls back to heuristic when cerebro.json contains invalid JSON', async () => {
    seedResponse(MANIFEST_URL, 200, 'not valid json {{{');
    const tree = makeTreeResponse([
      { path: 'agents/reviewer.md', type: 'blob', size: 200 },
    ]);
    seedResponse(TREE_URL, 200, JSON.stringify(tree));
    seedResponse(RAW_URL, 200, SAMPLE_AGENT_MD);

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    expect(components.some(c => c.type === 'agent')).toBe(true);
  });

  it('rejects path traversal in manifest file paths', async () => {
    const manifest = {
      cerebro: '1',
      components: [
        {
          name: 'evil',
          type: 'skill',
          // All paths are traversals — validateManifest should reject this component
          files: ['../../../etc/passwd', '..\\windows\\system32\\evil.txt'],
          targets: ['claude-code'],
        },
      ],
    };
    seedResponse(MANIFEST_URL, 200, JSON.stringify(manifest));
    // Manifest invalid → heuristic runs → seed empty tree so no components found
    seedResponse(TREE_URL, 200, JSON.stringify(makeTreeResponse([])));
    seedResponse(RAW_URL, 500, 'not found');

    const { discoverComponents } = await import('../../../src/core/registry.js');
    // No valid files → component dropped → manifest has 0 components → returns null → heuristic
    const components = await discoverComponents(makeSource());
    expect(components.find(c => c.name === 'evil')).toBeUndefined();
  });

  it('rejects manifest components with an invalid type', async () => {
    const manifest = {
      cerebro: '1',
      components: [
        {
          name: 'bad-type',
          type: 'malware', // not in VALID_TYPES
          files: ['skills/foo/SKILL.md'],
          targets: ['claude-code'],
        },
      ],
    };
    seedResponse(MANIFEST_URL, 200, JSON.stringify(manifest));
    // Manifest invalid → heuristic runs → seed empty tree so no components found
    seedResponse(TREE_URL, 200, JSON.stringify(makeTreeResponse([])));
    seedResponse(RAW_URL, 500, 'not found');

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    expect(components.find(c => c.name === 'bad-type')).toBeUndefined();
  });

  it('infers targets when manifest component omits the targets field', async () => {
    const manifest = {
      cerebro: '1',
      components: [
        {
          name: 'no-targets',
          type: 'prompt',
          files: ['prompts/foo.md'],
          // targets omitted — inferTargetsFromType('prompt') should apply
        },
      ],
    };
    seedResponse(MANIFEST_URL, 200, JSON.stringify(manifest));
    seedResponse(RAW_URL, 500, 'not found');

    const { discoverComponents } = await import('../../../src/core/registry.js');
    const components = await discoverComponents(makeSource());
    const comp = components.find(c => c.name === 'no-targets');
    expect(comp).toBeTruthy();
    // inferTargetsFromType('prompt') = ['claude-code', 'opencode', 'vscode', 'copilot']
    expect(comp?.compatibleTargets).toContain('claude-code');
    expect(comp?.compatibleTargets).toContain('vscode');
    expect(comp?.compatibleTargets).toContain('copilot');
  });
});
