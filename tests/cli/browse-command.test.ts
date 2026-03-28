import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeComponent } from '../__fixtures__/tree-responses.js';
import * as readline from 'node:readline';

let readlineAnswers: string[] = [];
let readlinePrompts: string[] = [];

vi.mock('node:readline', () => ({
  createInterface: vi.fn(),
}));

vi.mock('../../src/core/registry.js', () => ({
  discoverComponents: vi.fn(),
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
  readlinePrompts = [];
  readlineAnswers = ['q'];

  vi.mocked(readline.createInterface).mockImplementation(() => ({
    question: vi.fn((prompt: string, cb: (answer: string) => void) => {
      readlinePrompts.push(prompt);
      cb(readlineAnswers.shift() ?? 'q');
    }),
    close: vi.fn(),
  } as unknown as readline.Interface));

  Object.defineProperty(process.stdin, 'isTTY', {
    value: false,
    configurable: true,
  });
  Object.defineProperty(process.stdout, 'isTTY', {
    value: false,
    configurable: true,
  });
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
    const source = (discoverComponents as ReturnType<typeof vi.fn>).mock.calls[0][0];
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
    const joined = logs.join('\n');
    expect(joined).toContain('test-component');
    expect(joined).not.toContain('bot');
  });

  it('outputs message when no components found', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue([]);

    const logs: string[] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => logs.push(msg ?? ''));

    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'cerebro', 'browse', 'myorg/myrepo']);

    consoleSpy.mockRestore();
    expect(logs.join('\n')).toContain('No components found');
  });

  it('does not throw when discoverComponents throws', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    vi.mocked(discoverComponents).mockRejectedValue(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { program } = await import('../../src/index.js');
    await expect(program.parseAsync(['node', 'cerebro', 'browse', 'myorg/myrepo'])).resolves.not.toThrow();

    consoleSpy.mockRestore();
  });

  it('shows type filter menu when multiple types are present', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue([
      makeComponent({ name: 'a-skill', type: 'skill' }),
      makeComponent({ name: 'a-agent', type: 'agent' }),
    ]);

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    readlineAnswers = ['0', 'q'];

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'cerebro', 'browse', 'myorg/myrepo']);
    consoleSpy.mockRestore();

    expect(readlinePrompts.some(prompt => prompt.includes('Enter number'))).toBe(true);
  });

  it('skips type filter menu when --type flag is provided', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue([
      makeComponent({ name: 'a-skill', type: 'skill' }),
      makeComponent({ name: 'a-agent', type: 'agent' }),
    ]);

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    readlineAnswers = ['q'];

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'cerebro', 'browse', 'myorg/myrepo', '--type', 'skill']);
    consoleSpy.mockRestore();

    expect(readlinePrompts.some(prompt => prompt.includes('Enter number'))).toBe(false);
  });

  it('skips type filter menu when only one type is present', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue([
      makeComponent({ name: 'one', type: 'skill' }),
      makeComponent({ name: 'two', type: 'skill' }),
    ]);

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    readlineAnswers = ['q'];

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'cerebro', 'browse', 'myorg/myrepo']);
    consoleSpy.mockRestore();

    expect(readlinePrompts.some(prompt => prompt.includes('Enter number'))).toBe(false);
  });

  it('renders all items at once when stdin/stdout are not TTY', async () => {
    const { discoverComponents } = await import('../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue([
      makeComponent({ name: 'one', type: 'skill' }),
      makeComponent({ name: 'two', type: 'agent' }),
      makeComponent({ name: 'three', type: 'instruction' }),
    ]);

    const logs: string[] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => logs.push(msg ?? ''));
    const { program } = await import('../../src/index.js');
    await program.parseAsync(['node', 'cerebro', 'browse', 'myorg/myrepo']);
    consoleSpy.mockRestore();

    const joined = logs.join('\n');
    expect(joined).toContain('one');
    expect(joined).toContain('two');
    expect(joined).toContain('three');
    expect(joined).not.toContain('[N] next page');
  });
});
