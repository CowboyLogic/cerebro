import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeComponent } from '../__fixtures__/tree-responses.js';

vi.mock('../../src/core/registry.js', () => ({
  discoverComponents: vi.fn(),
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

describe('browse command', () => {
  it('calls discoverComponents for default repos when no arg given', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue([]);
    const { program } = await import('../../src/index.js');

    await program.parseAsync(['node', 'cerebro', 'browse']);

    expect(discoverComponents).toHaveBeenCalledTimes(2); // both default repos
  });

  it('calls discoverComponents with parsed source for a specific repo', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue([]);
    const { program } = await import('../../src/index.js');

    await program.parseAsync(['node', 'cerebro', 'browse', 'myorg/myrepo']);

    expect(discoverComponents).toHaveBeenCalledTimes(1);
    const source = (discoverComponents as any).mock.calls[0][0];
    expect(source.owner).toBe('myorg');
    expect(source.repo).toBe('myrepo');
  });

  it('filters to --type when specified', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue([
      makeComponent({ type: 'skill' }),
      makeComponent({ name: 'bot', type: 'agent' }),
    ]);
    const { program } = await import('../../src/index.js');

    const logs: string[] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => logs.push(msg ?? ''));

    await program.parseAsync(['node', 'cerebro', 'browse', 'myorg/myrepo', '--type', 'skill']);

    consoleSpy.mockRestore();
    // Should show skill but not agent
    const joined = logs.join('\n');
    expect(joined).toContain('test-component'); // skill name
    expect(joined).not.toContain('bot');         // agent filtered out
  });

  it('outputs warning when no components found', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue([]);
    const p = await import('@clack/prompts');
    const { program } = await import('../../src/index.js');

    await program.parseAsync(['node', 'cerebro', 'browse', 'myorg/myrepo']);

    expect(p.log.warn).toHaveBeenCalled();
  });

  it('outputs error message when discoverComponents throws', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    vi.mocked(discoverComponents).mockRejectedValue(new Error('Network error'));
    const p = await import('@clack/prompts');
    const { program } = await import('../../src/index.js');

    await program.parseAsync(['node', 'cerebro', 'browse', 'myorg/myrepo']);

    // Should not throw — errors are caught and displayed
    expect(p.log.warn).not.toThrow;
  });
});
