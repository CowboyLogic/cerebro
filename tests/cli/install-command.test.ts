import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeComponent, SAMPLE_SKILL_MD } from '../__fixtures__/tree-responses.js';

vi.mock('../../src/core/registry.js', () => ({
  discoverComponents: vi.fn(),
}));

vi.mock('../../src/core/installer.js', () => ({
  installComponent: vi.fn(),
  installMultiple: vi.fn(),
}));

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start:   vi.fn().mockReturnThis(),
    stop:    vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail:    vi.fn().mockReturnThis(),
    warn:    vi.fn().mockReturnThis(),
    text:    '',
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('install command', () => {
  it('searches default repos when no --repo specified', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    const { installComponent } = await import('../../src/core/installer.js');
    const match = makeComponent({ name: 'my-skill' });
    vi.mocked(discoverComponents).mockResolvedValue([match]);
    vi.mocked(installComponent).mockResolvedValue({ success: true, component: match, target: 'claude-code', scope: 'workspace', installedFiles: ['/path/SKILL.md'], errors: [] });

    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'cerebro', 'install', 'my-skill']);

    expect(discoverComponents).toHaveBeenCalled();
    expect(installComponent).toHaveBeenCalled();
  });

  it('passes --target to installComponent', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    const { installComponent } = await import('../../src/core/installer.js');
    const match = makeComponent({ name: 'my-skill', compatibleTargets: ['vscode'] });
    vi.mocked(discoverComponents).mockResolvedValue([match]);
    vi.mocked(installComponent).mockResolvedValue({ success: true, component: match, target: 'vscode', scope: 'workspace', installedFiles: [], errors: [] });

    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'cerebro', 'install', 'my-skill', '--target', 'vscode']);

    const args = (installComponent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[1]).toBe('vscode');
  });

  it('passes --scope to installComponent', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    const { installComponent } = await import('../../src/core/installer.js');
    const match = makeComponent({ name: 'my-skill' });
    vi.mocked(discoverComponents).mockResolvedValue([match]);
    vi.mocked(installComponent).mockResolvedValue({ success: true, component: match, target: 'claude-code', scope: 'user', installedFiles: [], errors: [] });

    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'cerebro', 'install', 'my-skill', '--scope', 'user']);

    const args = (installComponent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[2]).toBe('user');
  });

  it('passes --dry-run to installComponent', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    const { installComponent } = await import('../../src/core/installer.js');
    const match = makeComponent({ name: 'my-skill' });
    vi.mocked(discoverComponents).mockResolvedValue([match]);
    vi.mocked(installComponent).mockResolvedValue({ success: true, component: match, target: 'claude-code', scope: 'workspace', installedFiles: [], errors: [] });

    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'cerebro', 'install', 'my-skill', '--dry-run']);

    const args = (installComponent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[4]).toBe(true);
  });

  it('outputs error when component not found in any repo', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue([]);

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'cerebro', 'install', 'nonexistent-component']);

    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('calls spinner.fail when installComponent returns success: false', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    const { installComponent } = await import('../../src/core/installer.js');
    const match = makeComponent({ name: 'broken-skill' });
    vi.mocked(discoverComponents).mockResolvedValue([match]);
    vi.mocked(installComponent).mockResolvedValue({
      success: false, component: match, target: 'claude-code', scope: 'workspace',
      installedFiles: [], errors: ['Permission denied'],
    });

    const oraModule = await import('ora');
    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'cerebro', 'install', 'broken-skill']);

    const spinnerInstance = vi.mocked(oraModule.default).mock.results.at(-1)?.value;
    expect(spinnerInstance?.fail).toHaveBeenCalled();
  });
});
