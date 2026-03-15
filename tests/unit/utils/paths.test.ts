import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';

// Hoist mock functions so both default and named exports share the same references
const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();

vi.mock('node:fs', () => ({
  default: { existsSync: mockExistsSync, mkdirSync: mockMkdirSync },
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
}));

describe('getIDEPaths', () => {
  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.APPDATA;
  });

  it('claudeCode.user is ~/.claude', async () => {
    const { getIDEPaths } = await import('../../../src/utils/paths.js');
    expect(getIDEPaths().claudeCode.user).toBe(path.join('/home/user', '.claude'));
  });

  it('claudeCode.workspace resolves to <root>/.claude', async () => {
    const { getIDEPaths } = await import('../../../src/utils/paths.js');
    expect(getIDEPaths().claudeCode.workspace('/proj')).toBe(path.join('/proj', '.claude'));
  });

  it('openCode.user is <configDir>/opencode', async () => {
    const { getIDEPaths } = await import('../../../src/utils/paths.js');
    expect(getIDEPaths().openCode.user).toBe(path.join('/home/user/.config', 'opencode'));
  });

  it('openCode.workspace resolves to <root>/.opencode', async () => {
    const { getIDEPaths } = await import('../../../src/utils/paths.js');
    expect(getIDEPaths().openCode.workspace('/proj')).toBe(path.join('/proj', '.opencode'));
  });

  it('vscode.workspace resolves to <root>/.vscode', async () => {
    const { getIDEPaths } = await import('../../../src/utils/paths.js');
    expect(getIDEPaths().vscode.workspace('/proj')).toBe(path.join('/proj', '.vscode'));
  });

  it('copilot.user is ~/.github', async () => {
    const { getIDEPaths } = await import('../../../src/utils/paths.js');
    expect(getIDEPaths().copilot.user).toBe(path.join('/home/user', '.github'));
  });

  it('copilot.workspace resolves to <root>/.github', async () => {
    const { getIDEPaths } = await import('../../../src/utils/paths.js');
    expect(getIDEPaths().copilot.workspace('/proj')).toBe(path.join('/proj', '.github'));
  });
});

describe('findWorkspaceRoot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the directory containing .git', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('.git'));
    const { findWorkspaceRoot } = await import('../../../src/utils/paths.js');
    const result = findWorkspaceRoot('/proj/src/components');
    expect(result).toBeTruthy();
  });

  it('returns null when no .git found up to root', async () => {
    mockExistsSync.mockReturnValue(false);
    const { findWorkspaceRoot } = await import('../../../src/utils/paths.js');
    const result = findWorkspaceRoot('/');
    expect(result).toBeNull();
  });
});

describe('ensureDir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls mkdirSync with recursive: true', async () => {
    const { ensureDir } = await import('../../../src/utils/paths.js');
    ensureDir('/some/deep/path');
    expect(mockMkdirSync).toHaveBeenCalledWith('/some/deep/path', { recursive: true });
  });
});
