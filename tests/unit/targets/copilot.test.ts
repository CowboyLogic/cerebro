import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { CopilotInstaller } from '../../../src/targets/copilot.js';
import { makeComponent } from '../../__fixtures__/tree-responses.js';
import { InstallOptions } from '../../../src/core/types.js';

// Use vi.hoisted() so these refs are available inside the vi.mock() factory,
// which Vitest hoists to the very top of the file before any const declarations.
const { mockReadFileSync, mockWriteFileSync, mockMkdirSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(() => { throw new Error('ENOENT'); }),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: { readFileSync: mockReadFileSync, writeFileSync: mockWriteFileSync, mkdirSync: mockMkdirSync },
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
}));

vi.mock('../../../src/utils/paths.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/utils/paths.js')>();
  return { ...original, findWorkspaceRoot: vi.fn(() => null), ensureDir: vi.fn() };
});

const installer = new CopilotInstaller();

function makeOpts(overrides: Partial<InstallOptions> = {}): InstallOptions {
  return { component: makeComponent(), target: 'copilot', scope: 'user', ...overrides };
}

describe('CopilotInstaller.getInstallDir', () => {
  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
    vi.spyOn(os, 'platform').mockReturnValue('linux');
  });

  it('user → ~/.github', () => {
    const dir = installer.getInstallDir(makeOpts({ scope: 'user' }));
    expect(dir).toBe(path.join('/home/user', '.github'));
  });

  it('workspace → <root>/.github', () => {
    const dir = installer.getInstallDir(makeOpts({ scope: 'workspace', workspaceRoot: '/proj' }));
    expect(dir).toBe(path.join('/proj', '.github'));
  });
});

describe('CopilotInstaller.getTargetFileName', () => {
  it('instruction → copilot-instructions.md', () => {
    const opts = makeOpts({ component: makeComponent({ type: 'instruction' }) });
    expect(installer.getTargetFileName('anything.md', opts)).toBe('copilot-instructions.md');
  });

  it('agent → agents/<name>.md', () => {
    const opts = makeOpts({ component: makeComponent({ name: 'my-bot', type: 'agent' }) });
    expect(installer.getTargetFileName('agent.md', opts)).toBe(path.join('agents', 'my-bot.md'));
  });

  it('other types → source filename', () => {
    expect(installer.getTargetFileName('helper.md', makeOpts())).toBe('helper.md');
  });
});

describe('CopilotInstaller.install — instruction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
    vi.spyOn(os, 'platform').mockReturnValue('linux');
  });

  it('creates new copilot-instructions.md when none exists', async () => {
    const comp = makeComponent({ type: 'instruction' });
    comp.files[0].content = '# Instructions';
    const result = await installer.install(makeOpts({ component: comp }));

    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('appends to existing copilot-instructions.md with separator', async () => {
    mockReadFileSync.mockReturnValue('# Existing' as any);

    const comp = makeComponent({ type: 'instruction' });
    comp.files[0].content = '# New';
    await installer.install(makeOpts({ component: comp }));

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('# Existing');
    expect(written).toContain('# New');
  });

  it('dry run does not write', async () => {
    const comp = makeComponent({ type: 'instruction' });
    comp.files[0].content = '# Instructions';
    const result = await installer.install(makeOpts({ component: comp, dryRun: true }));

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(result.installedFiles[0]).toContain('[dry-run]');
  });
});

describe('CopilotInstaller.install — agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
    vi.spyOn(os, 'platform').mockReturnValue('linux');
  });

  it('writes to agents/<name>.md', async () => {
    const comp = makeComponent({ name: 'my-bot', type: 'agent' });
    comp.files[0].content = '# Bot';
    await installer.install(makeOpts({ component: comp }));

    const writePath = mockWriteFileSync.mock.calls[0][0] as string;
    expect(writePath).toContain(path.join('agents', 'my-bot.md'));
  });
});
