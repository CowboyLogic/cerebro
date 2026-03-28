import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeComponent } from '../../__fixtures__/tree-responses.js';
import type { Component, TargetIDE } from '../../../src/core/types.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockLoggerDebug, mockLoggerWarn, mockLoggerError, readlineCalls } = vi.hoisted(() => ({
  mockLoggerDebug: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
  readlineCalls: [] as { msg: string }[],
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    debug: mockLoggerDebug,
    info: vi.fn(),
    warn: mockLoggerWarn,
    error: mockLoggerError,
    init: vi.fn(),
    active: false,
    logPath: '',
  },
}));

// ── node:readline mock ────────────────────────────────────────────────────────
// plainLineInput() uses readline.createInterface directly (cooked-mode, avoids
// raw-mode conflicts). We intercept it so promptResponses drives it like the
// @inquirer mocks: string -> resolve, CANCEL -> emit SIGINT -> return BACK,
// and FORCE_CLOSE -> emit close without an answer -> return BACK.

vi.mock('node:readline', () => ({
  default: {
    createInterface: vi.fn(() => {
      const closeHandlers: Array<() => void> = [];
      const mockRl = {
        once: vi.fn((event: string, cb: () => void) => {
          if (event === 'close') closeHandlers.push(cb);
          return mockRl;
        }),
        on: vi.fn(),
        removeAllListeners: vi.fn((event?: string) => {
          if (!event || event === 'close') closeHandlers.length = 0;
          return mockRl;
        }),
        close: vi.fn(() => {
          for (const handler of [...closeHandlers]) handler();
          return mockRl;
        }),
        question: vi.fn((msg: string, cb: (s: string) => void) => {
          readlineCalls.push({ msg });
          const resp = nextResponse();
          if (resp === CANCEL) {
            // Emit SIGINT after the promise-construction tick so the handler
            // registered inside plainLineInput is already in place.
            setImmediate(() => process.emit('SIGINT' as NodeJS.Signals));
          } else if (resp === FORCE_CLOSE) {
            // Simulate tty closing unexpectedly without invoking question cb.
            setImmediate(() => mockRl.close());
          } else {
            setImmediate(() => cb(String(resp ?? '')));
          }
        }),
      };
      return mockRl;
    }),
  },
  createInterface: vi.fn(),
}));

// ── @inquirer/prompts mock ────────────────────────────────────────────────────

/** Sentinel returned in promptResponses to simulate Ctrl+C on a prompt. */
const CANCEL = Symbol('cancel');
const FORCE_CLOSE = Symbol('force-close');

const inquirerCalls: { fn: string; args: unknown[] }[] = [];
let promptResponses: unknown[] = [];
let responseIndex = 0;

function nextResponse() {
  return promptResponses[responseIndex++];
}

vi.mock('@inquirer/prompts', () => {
  class MockExitPromptError extends Error {
    constructor() {
      super('User force closed the prompt with 0 selections');
      this.name = 'ExitPromptError';
    }
  }

  function makePromptMock(name: string) {
    return vi.fn(async (opts: unknown) => {
      const resp = nextResponse();
      inquirerCalls.push({ fn: name, args: [opts] });
      if (resp === CANCEL) throw new MockExitPromptError();
      return resp;
    });
  }

  return {
    select:   makePromptMock('select'),
    checkbox: makePromptMock('checkbox'),
    input:    makePromptMock('input'),
    confirm:  makePromptMock('confirm'),
    Separator: class MockSeparator {
      type = 'separator' as const;
      constructor(public readonly separator: string = '──────────────') {}
    },
    ExitPromptError: MockExitPromptError,
  };
});

// ── ora mock ──────────────────────────────────────────────────────────────────

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

// ── other mocks ───────────────────────────────────────────────────────────────

vi.mock('../../../src/core/registry.js', () => ({
  discoverComponents: vi.fn(),
}));

vi.mock('../../../src/core/installer.js', () => ({
  installComponent: vi.fn(async () => ({
    success: true,
    installedFiles: ['/mock/path'],
    errors: [],
  })),
}));

vi.mock('../../../src/core/settings.js', () => ({
  loadSettings: vi.fn(() => ({ customRepos: [] })),
  addCustomRepo: vi.fn((s: unknown) => s),
}));

vi.mock('../../../src/utils/paths.js', () => ({
  findWorkspaceRoot: vi.fn(() => '/mock/workspace'),
}));

vi.mock('../../../src/utils/theme.js', () => ({
  theme: {
    brand: (s: string) => s,
    brandBold: (s: string) => s,
    success: (s: string) => s,
    warning: (s: string) => s,
    error: (s: string) => s,
    info: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
    muted: (s: string) => s,
    highlight: (s: string) => s,
    white: (s: string) => s,
    cyan: (s: string) => s,
    accent: (s: string) => s,
  },
  icons: { check: '✓', cross: '✗', arrow: '›', dot: '·', star: '★', package: '📦', rocket: '🚀', gear: '⚙', folder: '📁', plug: '🔌', globe: '🌐', shield: '🛡', sparkles: '✨', diamond: '◈', pulse: '◉' },
  banner: () => '',
  resultBox: () => '',
  stepBadge: (c: number, t: number) => `[${c}/${t}]`,
  tagLabel: (t: string) => `[${t}]`,
  statsLine: () => '',
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeComponents(): Component[] {
  return [
    makeComponent({ name: 'alpha', type: 'agent', compatibleTargets: ['claude-code', 'opencode'] as TargetIDE[] }),
    makeComponent({ name: 'beta',  type: 'agent', compatibleTargets: ['claude-code'] as TargetIDE[] }),
    makeComponent({ name: 'gamma', type: 'skill', compatibleTargets: ['claude-code'] as TargetIDE[] }),
  ];
}

function makeLargeComponents(n = 51): Component[] {
  return Array.from({ length: n }, (_, i) =>
    makeComponent({
      name: `comp-${String(i).padStart(3, '0')}`,
      type: 'agent',
      compatibleTargets: ['claude-code'] as TargetIDE[],
    })
  );
}

function makeLargeMixedComponents(): Component[] {
  const agents = Array.from({ length: 30 }, (_, i) =>
    makeComponent({
      name: `agent-${String(i).padStart(3, '0')}`,
      type: 'agent',
      compatibleTargets: ['claude-code'] as TargetIDE[],
    })
  );
  const skills = Array.from({ length: 21 }, (_, i) =>
    makeComponent({
      name: `skill-${String(i).padStart(3, '0')}`,
      type: 'skill',
      compatibleTargets: ['claude-code'] as TargetIDE[],
    })
  );
  return [...agents, ...skills];
}

// Standard complete-flow responses: repo → components → ide → scope → confirm → continue(exit)
function fullFlowResponses(components: Component[], overrides?: { components?: unknown; ide?: string; scope?: string }) {
  return [
    'awesome-copilot',
    overrides?.components ?? [components[0]],
    overrides?.ide ?? 'claude-code',
    overrides?.scope ?? 'user',
    true,
    'exit',
  ];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('interactive wizard', () => {
  beforeEach(() => {
    inquirerCalls.length = 0;
    readlineCalls.length = 0;
    promptResponses = [];
    responseIndex = 0;
    vi.clearAllMocks();
  });

  it('uses checkbox for component selection', async () => {
    const components = makeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = fullFlowResponses(components);

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    expect(inquirerCalls.find(c => c.fn === 'checkbox')).toBeTruthy();
  });

  it('Separator instances are used for group headers, enabled choices have non-null values', async () => {
    const components = makeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = fullFlowResponses(components);

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    const componentPrompt = inquirerCalls.find(c => c.fn === 'checkbox');
    const opts = componentPrompt!.args[0] as { choices: unknown[] };

    // Separator instances mark group headers
    const separators = opts.choices.filter(c => c && typeof c === 'object' && 'separator' in (c as object));
    expect(separators.length).toBeGreaterThan(0);

    // Regular choices must have non-null, defined values
    const regularChoices = opts.choices.filter(c => !('separator' in (c as object)));
    for (const c of regularChoices) {
      expect((c as { value: unknown }).value).not.toBeNull();
      expect((c as { value: unknown }).value).toBeDefined();
    }
  });

  it('checkbox validate rejects empty selection', async () => {
    const components = makeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = fullFlowResponses(components);

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    const componentPrompt = inquirerCalls.find(c => c.fn === 'checkbox');
    const opts = componentPrompt!.args[0] as { validate: (items: unknown[]) => boolean | string };

    expect(opts.validate([])).not.toBe(true);
    expect(opts.validate([{}])).toBe(true);
  });

  it('groups components by type in the correct order', async () => {
    const components = makeComponents(); // 2 agents, 1 skill
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = fullFlowResponses(components);

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    const componentPrompt = inquirerCalls.find(c => c.fn === 'checkbox');
    const opts = componentPrompt!.args[0] as { choices: Array<{ separator?: string }> };

    const separators = opts.choices.filter(c => 'separator' in c) as Array<{ separator: string }>;
    expect(separators.length).toBe(2); // agents + skills

    // agent comes before skill in TYPE_ORDER
    expect(separators[0].separator).toContain('Agents');
    expect(separators[1].separator).toContain('Skills');
  });

  it('Ctrl+C in component selection navigates back to repo', async () => {
    const components = makeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = [
      'awesome-copilot',   // first repo selection
      CANCEL,              // checkbox Ctrl+C → back to repo
      'awesome-copilot',   // second repo selection (cache hit)
      [components[0]],     // select component
      'claude-code',
      'user',
      true,
      'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    // checkbox called twice (once cancelled, once completed)
    const checkboxCalls = inquirerCalls.filter(c => c.fn === 'checkbox');
    expect(checkboxCalls.length).toBe(2);

    // discoverComponents called only once (cache hit on second visit)
    expect(vi.mocked(discoverComponents)).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when switching repos after back navigation', async () => {
    const compsA = makeComponents();
    const compsB = [makeComponent({ name: 'delta', type: 'prompt', compatibleTargets: ['vscode'] as TargetIDE[] })];

    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents)
      .mockResolvedValueOnce(compsA)
      .mockResolvedValueOnce(compsB);

    promptResponses = [
      'awesome-copilot',   // repo A
      CANCEL,              // Ctrl+C → back to repo
      'anthropic-skills',  // repo B (different from A)
      [compsB[0]],
      'vscode',
      'user',
      true,
      'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    expect(vi.mocked(discoverComponents)).toHaveBeenCalledTimes(2);
  });

  it('succeeds on third checkbox after two cancels', async () => {
    const components = makeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = [
      'awesome-copilot', CANCEL,
      'awesome-copilot', CANCEL,
      'awesome-copilot', [components[0]],
      'claude-code', 'user', true, 'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    const checkboxCalls = inquirerCalls.filter(c => c.fn === 'checkbox');
    expect(checkboxCalls.length).toBe(3);
    expect(vi.mocked(discoverComponents)).toHaveBeenCalledTimes(1);
  });

  // ── Pre-filter tests ──────────────────────────────────────────────────────

  it('small list (≤ RENDER_MAX) goes straight to checkbox without pre-filter', async () => {
    const components = makeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = fullFlowResponses(components);

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    expect(readlineCalls.length).toBe(0);
    expect(inquirerCalls.find(c => c.fn === 'checkbox')).toBeTruthy();
  });

  it('shows numbered type filter input when list is > RENDER_MAX and has multiple types', async () => {
    const components = makeLargeMixedComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = [
      'awesome-copilot',
      '0',
      '',
      [components[0]],
      'claude-code', 'user', true, 'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    expect(readlineCalls.some(c => c.msg.includes('Enter number (0-2'))).toBe(true);
  });

  it('skips type filter input when total components are ≤ RENDER_MAX', async () => {
    const components = makeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = fullFlowResponses(components);

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    const typeFilterInputs = readlineCalls.filter(c => c.msg.includes('Enter number (0-'));
    expect(typeFilterInputs.length).toBe(0);
  });

  it('skips type filter input when > RENDER_MAX but only one type is present', async () => {
    const components = makeLargeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = [
      'awesome-copilot',
      'comp-000',
      [components[0]],
      'claude-code', 'user', true, 'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    const typeFilterInputs = readlineCalls.filter(c => c.msg.includes('Enter number (0-'));
    expect(typeFilterInputs.length).toBe(0);
  });

  it('after selecting a specific type, only that type appears in checkbox choices', async () => {
    const components = makeLargeMixedComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = [
      'awesome-copilot',
      '2',
      [components[30]],
      'claude-code', 'user', true, 'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    const checkboxCall = inquirerCalls.find(c => c.fn === 'checkbox');
    expect(checkboxCall).toBeTruthy();

    const opts = checkboxCall!.args[0] as { choices: Array<{ separator?: string; value?: Component }> };
    const enabledOptions = opts.choices.filter(c => !('separator' in c));
    expect(enabledOptions.length).toBe(21);
    expect(enabledOptions.every(c => (c.value as Component).type === 'skill')).toBe(true);
  });

  it('unexpected close on type filter input returns BACK to repo step', async () => {
    const components = makeLargeMixedComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = [
      'awesome-copilot',
      FORCE_CLOSE,
      'awesome-copilot',
      '0',
      '',
      [components[0]],
      'claude-code', 'user', true, 'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    const typeFilterInputs = readlineCalls.filter(c => c.msg.includes('Enter number (0-2'));
    expect(typeFilterInputs.length).toBe(2);
    expect(vi.mocked(discoverComponents)).toHaveBeenCalledTimes(1);
  });

  it('shows text search after type filter when filtered results still exceed RENDER_MAX', async () => {
    const components = [
      ...Array.from({ length: 55 }, (_, i) =>
        makeComponent({
          name: `agent-over-${String(i).padStart(3, '0')}`,
          type: 'agent',
          compatibleTargets: ['claude-code'] as TargetIDE[],
        })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeComponent({
          name: `skill-over-${String(i).padStart(3, '0')}`,
          type: 'skill',
          compatibleTargets: ['claude-code'] as TargetIDE[],
        })
      ),
    ];
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = [
      'awesome-copilot',
      '1',
      '',
      [components[0]],
      'claude-code', 'user', true, 'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    expect(readlineCalls.length).toBe(2);
    expect(readlineCalls[1].msg).toContain('55 available');
  });

  it('large list pre-filter: valid query narrows options before checkbox', async () => {
    const largeComponents = makeLargeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(largeComponents);

    promptResponses = [
      'awesome-copilot',
      'comp-000',
      [largeComponents[0]],
      'claude-code', 'user', true, 'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    expect(readlineCalls.length).toBe(1);

    const checkboxCall = inquirerCalls.find(c => c.fn === 'checkbox');
    expect(checkboxCall).toBeTruthy();
    const opts = checkboxCall!.args[0] as { choices: Array<{ separator?: string; value?: unknown }> };
    const enabledOptions = opts.choices.filter(c => !('separator' in c));
    expect(enabledOptions.length).toBe(1);
    expect((enabledOptions[0].value as { name: string }).name).toBe('comp-000');

    expect(mockLoggerDebug).toHaveBeenCalledWith(expect.stringContaining('pre-filter required'));
    expect(mockLoggerDebug).toHaveBeenCalledWith(expect.stringContaining('matched=1'));
  });

  it('large list pre-filter: empty search shows first RENDER_MAX items', async () => {
    const largeComponents = makeLargeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(largeComponents);

    promptResponses = [
      'awesome-copilot',
      '',
      [largeComponents[0]],
      'claude-code', 'user', true, 'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    const checkboxCall = inquirerCalls.find(c => c.fn === 'checkbox');
    const opts = checkboxCall!.args[0] as { choices: Array<{ separator?: string }> };
    const enabledOptions = opts.choices.filter(c => !('separator' in c));
    expect(enabledOptions.length).toBe(50);
  });

  it('large list pre-filter: re-prompts on zero matches', async () => {
    const largeComponents = makeLargeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(largeComponents);

    promptResponses = [
      'awesome-copilot',
      'xyz-no-match',
      'comp-000',
      [largeComponents[0]],
      'claude-code', 'user', true, 'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    expect(readlineCalls.length).toBe(2);
    const checkboxCall = inquirerCalls.find(c => c.fn === 'checkbox');
    const opts = checkboxCall!.args[0] as { choices: Array<{ separator?: string }> };
    expect(opts.choices.filter(c => !('separator' in c)).length).toBe(1);
  });

  it('large list pre-filter: capped when matches exceed RENDER_MAX', async () => {
    const largeComponents = makeLargeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(largeComponents);

    // 'comp' matches all 51 → too many → capped to RENDER_MAX, no re-prompt
    promptResponses = [
      'awesome-copilot',
      'comp',
      [largeComponents[0]],
      'claude-code', 'user', true, 'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    expect(readlineCalls.length).toBe(1);
    const checkboxCall = inquirerCalls.find(c => c.fn === 'checkbox');
    const opts = checkboxCall!.args[0] as { choices: Array<{ separator?: string }> };
    expect(opts.choices.filter(c => !('separator' in c)).length).toBe(50);
  });

  it('large list pre-filter: query >200 chars is capped and still matches', async () => {
    const { discoverComponents } = await import('../../../src/core/registry.js');
    const slicedName = 'comp-000' + 'x'.repeat(192); // 200 chars
    const longNameComp = makeComponent({ name: slicedName, type: 'agent', compatibleTargets: ['claude-code'] as TargetIDE[] });
    const components = [longNameComp, ...makeLargeComponents(50)];
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = [
      'awesome-copilot',
      slicedName + 'X', // 201 chars → sliced to 200 → matches exactly
      [longNameComp],
      'claude-code', 'user', true, 'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    expect(readlineCalls.length).toBe(1);
    const checkboxCall = inquirerCalls.find(c => c.fn === 'checkbox');
    const opts = checkboxCall!.args[0] as { choices: Array<{ separator?: string; value?: unknown }> };
    const enabled = opts.choices.filter(c => !('separator' in c));
    expect(enabled.length).toBe(1);
    expect((enabled[0].value as { name: string }).name).toBe(slicedName);
  });

  it('large list pre-filter: Ctrl+C from input propagates back to repo step', async () => {
    const largeComponents = makeLargeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(largeComponents);

    promptResponses = [
      'awesome-copilot',
      CANCEL,              // input Ctrl+C → back to repo
      'awesome-copilot',
      'comp-000',
      [largeComponents[0]],
      'claude-code', 'user', true, 'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    expect(readlineCalls.length).toBe(2);
    expect(vi.mocked(discoverComponents)).toHaveBeenCalledTimes(1);
  });

  // ── Spinner ───────────────────────────────────────────────────────────────

  it('fetchComponents uses ora spinner', async () => {
    const components = makeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = fullFlowResponses(components);

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    const oraModule = await import('ora');
    expect(vi.mocked(oraModule.default)).toHaveBeenCalled();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('logs and rethrows when checkbox throws a non-cancel error', async () => {
    const components = makeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = ['awesome-copilot'];

    const inquirer = await import('@inquirer/prompts');
    vi.mocked(inquirer.checkbox).mockImplementationOnce(async () => {
      throw new Error('simulated checkbox failure');
    });

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await expect(runInteractive()).rejects.toThrow('simulated checkbox failure');

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.stringContaining('prompt:components-checkbox threw'),
      expect.objectContaining({
        totalOptions: expect.any(Number),
        selectable: expect.any(Number),
      }),
    );
  });

  it('emits a compact freeze-summary when prompt wait exceeds threshold', async () => {
    vi.useFakeTimers();
    try {
      const components = makeComponents();
      const { discoverComponents } = await import('../../../src/core/registry.js');
      vi.mocked(discoverComponents).mockResolvedValue(components);

      promptResponses = [
        [components[0]],
        'claude-code', 'user', true, 'exit',
      ];

      const inquirer = await import('@inquirer/prompts');
      vi.mocked(inquirer.select).mockImplementationOnce(async (opts: unknown) => {
        inquirerCalls.push({ fn: 'select', args: [opts] });
        return await new Promise<string>((resolve) => {
          setTimeout(() => resolve('awesome-copilot'), 16000);
        });
      });

      const { runInteractive } = await import('../../../src/ui/interactive.js');
      const runPromise = runInteractive();

      await vi.advanceTimersByTimeAsync(16000);
      await runPromise;

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('prompt:repo-select freeze-summary'),
        expect.objectContaining({
          prompt: 'repo-select',
          elapsedMs: expect.any(Number),
          metaKeys: expect.any(Array),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Post-install continue flow ────────────────────────────────────────────

  it('post-install "same" loops back to component selection without re-fetching', async () => {
    const components = makeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = [
      'awesome-copilot', [components[0]], 'claude-code', 'user', true,
      'same',              // continue: same repo
      [components[1]], 'claude-code', 'user', true,
      'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    const checkboxCalls = inquirerCalls.filter(c => c.fn === 'checkbox');
    expect(checkboxCalls.length).toBe(2);
    expect(vi.mocked(discoverComponents)).toHaveBeenCalledTimes(1); // cache hit
  });

  it('post-install "new" loops back to repo selection', async () => {
    const components = makeComponents();
    const { discoverComponents } = await import('../../../src/core/registry.js');
    vi.mocked(discoverComponents).mockResolvedValue(components);

    promptResponses = [
      'awesome-copilot', [components[0]], 'claude-code', 'user', true,
      'new',               // continue: different repo
      'anthropic-skills', [components[0]], 'claude-code', 'user', true,
      'exit',
    ];

    const { runInteractive } = await import('../../../src/ui/interactive.js');
    await runInteractive();

    expect(vi.mocked(discoverComponents)).toHaveBeenCalledTimes(2);
  });
});
