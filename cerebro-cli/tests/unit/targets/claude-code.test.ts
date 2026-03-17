import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { ClaudeCodeInstaller } from '../../../src/targets/claude-code.js';
import { makeComponent } from '../../__fixtures__/tree-responses.js';
import { InstallOptions } from '../../../src/core/types.js';

vi.mock('node:fs', () => ({
  default: { existsSync: vi.fn(() => false), mkdirSync: vi.fn(), writeFileSync: vi.fn() },
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../src/utils/paths.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/utils/paths.js')>();
  return {
    ...original,
    findWorkspaceRoot: vi.fn(() => null),
    ensureDir: vi.fn(),
  };
});

const installer = new ClaudeCodeInstaller();

function makeOpts(overrides: Partial<InstallOptions> = {}): InstallOptions {
  return { component: makeComponent(), target: 'claude-code', scope: 'user', ...overrides };
}

describe('ClaudeCodeInstaller.getInstallDir (user scope)', () => {
  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    delete process.env.XDG_CONFIG_HOME;
  });

  it('skill → ~/.claude/skills/<name>', () => {
    const dir = installer.getInstallDir(makeOpts({ component: makeComponent({ name: 'my-skill', type: 'skill' }) }));
    expect(dir).toBe(path.join('/home/user', '.claude', 'skills', 'my-skill'));
  });

  it('agent → ~/.claude/agents', () => {
    const dir = installer.getInstallDir(makeOpts({ component: makeComponent({ name: 'bot', type: 'agent' }) }));
    expect(dir).toBe(path.join('/home/user', '.claude', 'agents'));
  });

  it('instruction → ~/.claude', () => {
    const dir = installer.getInstallDir(makeOpts({ component: makeComponent({ type: 'instruction' }) }));
    expect(dir).toBe(path.join('/home/user', '.claude'));
  });

  it('prompt → ~/.claude', () => {
    const dir = installer.getInstallDir(makeOpts({ component: makeComponent({ type: 'prompt' }) }));
    expect(dir).toBe(path.join('/home/user', '.claude'));
  });
});

describe('ClaudeCodeInstaller.getInstallDir (workspace scope)', () => {
  it('skill → <root>/.claude/skills/<name>', () => {
    const dir = installer.getInstallDir(makeOpts({
      scope: 'workspace',
      workspaceRoot: '/proj',
      component: makeComponent({ name: 'my-skill', type: 'skill' }),
    }));
    expect(dir).toBe(path.join('/proj', '.claude', 'skills', 'my-skill'));
  });

  it('uses explicit workspaceRoot over findWorkspaceRoot()', () => {
    const dir = installer.getInstallDir(makeOpts({
      scope: 'workspace',
      workspaceRoot: '/explicit-root',
      component: makeComponent({ type: 'skill' }),
    }));
    expect(dir).toContain('explicit-root');
  });
});

describe('ClaudeCodeInstaller.transformContent', () => {
  it('returns content unchanged', () => {
    const content = '# My Skill\nDoes stuff.';
    expect(installer.transformContent(content, makeOpts())).toBe(content);
  });
});

describe('ClaudeCodeInstaller.getTargetFileName', () => {
  it('SKILL.md stays as SKILL.md', () => {
    expect(installer.getTargetFileName('SKILL.md', makeOpts())).toBe('SKILL.md');
  });

  it('instruction .md file becomes CLAUDE.md', () => {
    const opts = makeOpts({ component: makeComponent({ type: 'instruction' }) });
    expect(installer.getTargetFileName('anything.md', opts)).toBe('CLAUDE.md');
  });

  it('other filenames are unchanged', () => {
    expect(installer.getTargetFileName('LICENSE.txt', makeOpts())).toBe('LICENSE.txt');
  });
});
