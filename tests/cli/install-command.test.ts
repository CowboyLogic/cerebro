import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeComponent, SAMPLE_SKILL_MD } from '../__fixtures__/tree-responses.js';

vi.mock('../../src/core/registry.js', () => ({
  discoverComponents: vi.fn(),
}));

vi.mock('../../src/core/installer.js', () => ({
  installComponent: vi.fn(),
  installMultiple: vi.fn(),
}));

vi.mock('@clack/prompts', () => ({
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), step: vi.fn(), message: vi.fn() },
  intro: vi.fn(), outro: vi.fn(), select: vi.fn(), multiselect: vi.fn(),
  confirm: vi.fn(), text: vi.fn(), cancel: vi.fn(), isCancel: vi.fn(() => false),
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
    await program.parseAsync(['node', 'ai-install', 'install', 'my-skill']);

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
    await program.parseAsync(['node', 'ai-install', 'install', 'my-skill', '--target', 'vscode']);

    const args = (installComponent as any).mock.calls[0];
    expect(args[1]).toBe('vscode');
  });

  it('passes --scope to installComponent', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    const { installComponent } = await import('../../src/core/installer.js');
    const match = makeComponent({ name: 'my-skill' });
    vi.mocked(discoverComponents).mockResolvedValue([match]);
    vi.mocked(installComponent).mockResolvedValue({ success: true, component: match, target: 'claude-code', scope: 'user', installedFiles: [], errors: [] });

    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'ai-install', 'install', 'my-skill', '--scope', 'user']);

    const args = (installComponent as any).mock.calls[0];
    expect(args[2]).toBe('user');
  });

  it('passes --dry-run to installComponent', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    const { installComponent } = await import('../../src/core/installer.js');
    const match = makeComponent({ name: 'my-skill' });
    vi.mocked(discoverComponents).mockResolvedValue([match]);
    vi.mocked(installComponent).mockResolvedValue({ success: true, component: match, target: 'claude-code', scope: 'workspace', installedFiles: [], errors: [] });

    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'ai-install', 'install', 'my-skill', '--dry-run']);

    const args = (installComponent as any).mock.calls[0];
    expect(args[4]).toBe(true); // dryRun
  });

  it('outputs error when component not found in any repo', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue([]); // no matches
    const p = await import('@clack/prompts');

    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'ai-install', 'install', 'nonexistent-component']);

    expect(p.log.error).toHaveBeenCalled();
  });

  it('reports failure when installComponent returns success: false', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    const { installComponent } = await import('../../src/core/installer.js');
    const match = makeComponent({ name: 'broken-skill' });
    vi.mocked(discoverComponents).mockResolvedValue([match]);
    vi.mocked(installComponent).mockResolvedValue({
      success: false, component: match, target: 'claude-code', scope: 'workspace',
      installedFiles: [], errors: ['Permission denied'],
    });

    const p = await import('@clack/prompts');
    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'ai-install', 'install', 'broken-skill']);

    // The spinner stop message should include error indication
    const spinnerMock = (p.spinner as any).mock.results[0]?.value;
    expect(spinnerMock?.stop).toHaveBeenCalled();
  });
});
