import { describe, it, expect, vi } from 'vitest';
import { IDE_DISPLAY_NAMES } from '../../src/core/types.js';

describe('targets command', () => {
  it('outputs all four IDE display names', async () => {
    const logs: string[] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => logs.push(msg ?? ''));

    const { program } = await import('../../src/index.js');
    program.parseAsync(['node', 'cerebro', 'targets']);

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
    await expect(program.parseAsync(['node', 'cerebro', 'targets'])).resolves.not.toThrow();
    consoleSpy.mockRestore();
  });
});
