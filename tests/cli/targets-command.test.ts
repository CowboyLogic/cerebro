import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IDE_DISPLAY_NAMES } from '../../src/core/types.js';

vi.mock('@clack/prompts', () => ({
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), step: vi.fn(), message: vi.fn() },
  intro: vi.fn(), outro: vi.fn(), select: vi.fn(), multiselect: vi.fn(),
  confirm: vi.fn(), text: vi.fn(), cancel: vi.fn(), isCancel: vi.fn(() => false),
}));

describe('targets command', () => {
  it('outputs all four IDE display names', async () => {
    const logs: string[] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => logs.push(msg ?? ''));

    const { program } = await import('../../src/index.js');
    program.parseAsync(['node', 'ai-install', 'targets']);

    // Small tick to allow synchronous output to flush
    await new Promise(r => setTimeout(r, 0));
    consoleSpy.mockRestore();

    const output = logs.join('\n');
    expect(output).toContain(IDE_DISPLAY_NAMES['claude-code']);
    expect(output).toContain(IDE_DISPLAY_NAMES['vscode']);
    expect(output).toContain(IDE_DISPLAY_NAMES['copilot']);
    expect(output).toContain(IDE_DISPLAY_NAMES['opencode']);
  });

  it('does not throw', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { program } = await import('../../src/index.js');
    await expect(program.parseAsync(['node', 'ai-install', 'targets'])).resolves.not.toThrow();
    consoleSpy.mockRestore();
  });
});
