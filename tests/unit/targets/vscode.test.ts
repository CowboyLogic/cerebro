import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { VSCodeInstaller } from '../../../src/targets/vscode.js';
import { makeComponent } from '../../__fixtures__/tree-responses.js';
import { InstallOptions } from '../../../src/core/types.js';

// Use vi.hoisted() so these refs are available inside the vi.mock() factory,
// which Vitest hoists to the very top of the file before any const declarations.
const { mockReadFileSync, mockWriteFileSync, mockMkdirSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: { readFileSync: mockReadFileSync, writeFileSync: mockWriteFileSync, mkdirSync: mockMkdirSync, existsSync: vi.fn(() => false) },
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  existsSync: vi.fn(() => false),
}));

vi.mock('../../../src/utils/paths.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/utils/paths.js')>();
  return { ...original, findWorkspaceRoot: vi.fn(() => null), ensureDir: vi.fn() };
});

const installer = new VSCodeInstaller();

function makeOpts(overrides: Partial<InstallOptions> = {}): InstallOptions {
  return { component: makeComponent(), target: 'vscode', scope: 'workspace', workspaceRoot: '/proj', ...overrides };
}

describe('VSCodeInstaller.getInstallDir', () => {
  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
    vi.spyOn(os, 'platform').mockReturnValue('linux');
  });

  it('workspace → <root>/.vscode', () => {
    const dir = installer.getInstallDir(makeOpts({ scope: 'workspace', workspaceRoot: '/proj' }));
    expect(dir).toBe(path.join('/proj', '.vscode'));
  });
});

describe('VSCodeInstaller.transformContent', () => {
  it('returns instruction content unchanged', () => {
    const content = '# Instructions';
    const opts = makeOpts({ component: makeComponent({ type: 'instruction' }) });
    expect(installer.transformContent(content, opts)).toBe(content);
  });

  it('returns valid snippet JSON unchanged', () => {
    const json = JSON.stringify({ mySnippet: { prefix: 'ms', body: ['line'], description: 'test' } }, null, 2);
    const opts = makeOpts({ component: makeComponent({ type: 'snippet' }) });
    expect(installer.transformContent(json, opts)).toBe(json);
  });

  it('wraps invalid snippet text as valid JSON', () => {
    const opts = makeOpts({ component: makeComponent({ name: 'my-snip', type: 'snippet' }) });
    const result = installer.transformContent('line one\nline two', opts);
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed['my-snip']).toBeDefined();
    expect(Array.isArray(parsed['my-snip'].body)).toBe(true);
  });
});

describe('VSCodeInstaller.getTargetFileName', () => {
  it('instruction → .github/copilot-instructions.md', () => {
    const opts = makeOpts({ component: makeComponent({ type: 'instruction' }) });
    expect(installer.getTargetFileName('anything.md', opts)).toBe(path.join('.github', 'copilot-instructions.md'));
  });

  it('prompt → .github/copilot-instructions.md', () => {
    const opts = makeOpts({ component: makeComponent({ type: 'prompt' }) });
    expect(installer.getTargetFileName('prompt.md', opts)).toBe(path.join('.github', 'copilot-instructions.md'));
  });

  it('snippet → snippets/<name>.code-snippets', () => {
    const opts = makeOpts({ component: makeComponent({ name: 'my-snip', type: 'snippet' }) });
    expect(installer.getTargetFileName('file.json', opts)).toBe(path.join('snippets', 'my-snip.code-snippets'));
  });
});

describe('VSCodeInstaller.install — instruction appending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileSync.mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });
  });

  it('creates a new file when none exists', async () => {
    const comp = makeComponent({ type: 'instruction' });
    comp.files[0].content = '# New Instructions';
    const result = await installer.install(makeOpts({ component: comp }));

    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('appends to existing file with separator', async () => {
    mockReadFileSync.mockReturnValue('# Existing Content' as any);

    const comp = makeComponent({ type: 'instruction' });
    comp.files[0].content = '# New Instructions';
    await installer.install(makeOpts({ component: comp }));

    const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
    expect(writtenContent).toContain('# Existing Content');
    expect(writtenContent).toContain('# New Instructions');
  });

  it('dry run does not write files', async () => {
    const comp = makeComponent({ type: 'instruction' });
    comp.files[0].content = '# Instructions';
    const result = await installer.install(makeOpts({ component: comp, dryRun: true }));

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(result.installedFiles[0]).toContain('[dry-run]');
  });
});
