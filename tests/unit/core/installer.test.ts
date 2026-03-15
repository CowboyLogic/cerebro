import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeComponent } from '../../__fixtures__/tree-responses.js';

vi.mock('../../../src/core/github.js', () => ({
  getFileContents: vi.fn(),
}));

vi.mock('../../../src/targets/index.js', () => ({
  getInstaller: vi.fn(),
}));

describe('installComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls getFileContents with component file paths', async () => {
    const { getFileContents } = await import('../../../src/core/github.js');
    const { getInstaller } = await import('../../../src/targets/index.js');
    const mockInstall = vi.fn().mockResolvedValue({ success: true, installedFiles: [], errors: [] });
    vi.mocked(getInstaller).mockReturnValue({ install: mockInstall } as any);
    vi.mocked(getFileContents).mockResolvedValue([
      { path: 'skills/test/SKILL.md', name: 'SKILL.md', content: '# Skill' },
    ]);

    const { installComponent } = await import('../../../src/core/installer.js');
    const comp = makeComponent();
    await installComponent(comp, 'claude-code', 'user');

    expect(getFileContents).toHaveBeenCalledWith(comp.source, ['skills/test-component/SKILL.md']);
  });

  it('delegates to the correct installer', async () => {
    const { getFileContents } = await import('../../../src/core/github.js');
    const { getInstaller } = await import('../../../src/targets/index.js');
    const mockInstall = vi.fn().mockResolvedValue({ success: true, installedFiles: [], errors: [] });
    vi.mocked(getInstaller).mockReturnValue({ install: mockInstall } as any);
    vi.mocked(getFileContents).mockResolvedValue([]);

    const { installComponent } = await import('../../../src/core/installer.js');
    await installComponent(makeComponent(), 'vscode', 'workspace');

    expect(getInstaller).toHaveBeenCalledWith('vscode');
    expect(mockInstall).toHaveBeenCalled();
  });

  it('passes dryRun flag through to installer', async () => {
    const { getFileContents } = await import('../../../src/core/github.js');
    const { getInstaller } = await import('../../../src/targets/index.js');
    const mockInstall = vi.fn().mockResolvedValue({ success: true, installedFiles: [], errors: [] });
    vi.mocked(getInstaller).mockReturnValue({ install: mockInstall } as any);
    vi.mocked(getFileContents).mockResolvedValue([]);

    const { installComponent } = await import('../../../src/core/installer.js');
    await installComponent(makeComponent(), 'claude-code', 'user', undefined, true);

    const options = mockInstall.mock.calls[0][0];
    expect(options.dryRun).toBe(true);
  });
});

describe('installMultiple', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('collects all results', async () => {
    const { getFileContents } = await import('../../../src/core/github.js');
    const { getInstaller } = await import('../../../src/targets/index.js');
    vi.mocked(getFileContents).mockResolvedValue([]);
    vi.mocked(getInstaller).mockReturnValue({
      install: vi.fn().mockResolvedValue({ success: true, installedFiles: [], errors: [] }),
    } as any);

    const { installMultiple } = await import('../../../src/core/installer.js');
    const results = await installMultiple([makeComponent(), makeComponent({ name: 'comp2' })], 'claude-code', 'user');
    expect(results).toHaveLength(2);
  });

  it('does not bail on failure — attempts all components', async () => {
    const { getFileContents } = await import('../../../src/core/github.js');
    const { getInstaller } = await import('../../../src/targets/index.js');
    vi.mocked(getFileContents).mockResolvedValue([]);

    let callCount = 0;
    vi.mocked(getInstaller).mockReturnValue({
      install: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) return Promise.resolve({ success: false, installedFiles: [], errors: ['oops'] });
        return Promise.resolve({ success: true, installedFiles: [], errors: [] });
      }),
    } as any);

    const { installMultiple } = await import('../../../src/core/installer.js');
    const comps = [makeComponent(), makeComponent({ name: 'c2' }), makeComponent({ name: 'c3' })];
    const results = await installMultiple(comps, 'claude-code', 'user');

    expect(results).toHaveLength(3);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[2].success).toBe(true);
  });
});
