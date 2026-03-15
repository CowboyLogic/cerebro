import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { OpenCodeInstaller } from '../../../src/targets/opencode.js';
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
  return { ...original, findWorkspaceRoot: vi.fn(() => null), ensureDir: vi.fn() };
});

const installer = new OpenCodeInstaller();

function makeOpts(overrides: Partial<InstallOptions> = {}): InstallOptions {
  return { component: makeComponent(), target: 'opencode', scope: 'user', ...overrides };
}

describe('OpenCodeInstaller.getInstallDir (user scope)', () => {
  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    delete process.env.XDG_CONFIG_HOME;
  });

  it('agent → <configDir>/opencode/agents', () => {
    const dir = installer.getInstallDir(makeOpts({ component: makeComponent({ type: 'agent' }) }));
    expect(dir).toContain(path.join('opencode', 'agents'));
  });

  it('instruction/prompt → <configDir>/opencode base', () => {
    const iDir = installer.getInstallDir(makeOpts({ component: makeComponent({ type: 'instruction' }) }));
    const pDir = installer.getInstallDir(makeOpts({ component: makeComponent({ type: 'prompt' }) }));
    expect(iDir).toMatch(/opencode$/);
    expect(pDir).toMatch(/opencode$/);
  });
});

describe('OpenCodeInstaller.getInstallDir (workspace scope)', () => {
  it('resolves to <root>/.opencode', () => {
    const dir = installer.getInstallDir(makeOpts({ scope: 'workspace', workspaceRoot: '/proj' }));
    expect(dir).toContain('.opencode');
  });
});

describe('OpenCodeInstaller.transformContent', () => {
  it('prepends HTML comment header with source info', () => {
    const comp = makeComponent();
    const opts = makeOpts({ component: comp });
    const result = installer.transformContent('# Original', opts);
    expect(result).toContain('<!-- Installed by cerebro');
    expect(result).toContain('test-owner/test-repo');
    expect(result).toContain('# Original');
  });
});

describe('OpenCodeInstaller.getTargetFileName', () => {
  it('instruction .md → AGENTS.md', () => {
    const opts = makeOpts({ component: makeComponent({ type: 'instruction' }) });
    expect(installer.getTargetFileName('instructions.md', opts)).toBe('AGENTS.md');
  });

  it('SKILL.md → <name>.md', () => {
    const opts = makeOpts({ component: makeComponent({ name: 'my-skill' }) });
    expect(installer.getTargetFileName('SKILL.md', opts)).toBe('my-skill.md');
  });

  it('other files unchanged', () => {
    expect(installer.getTargetFileName('helper.ts', makeOpts())).toBe('helper.ts');
  });
});
