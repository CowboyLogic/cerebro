import { describe, it, expect } from 'vitest';
import { ClaudeCodeInstaller } from '../../../src/targets/claude-code.js';
import { OpenCodeInstaller } from '../../../src/targets/opencode.js';
import { VSCodeInstaller } from '../../../src/targets/vscode.js';
import { CopilotInstaller } from '../../../src/targets/copilot.js';

describe('getInstaller', () => {
  it('returns ClaudeCodeInstaller for claude-code', async () => {
    const { getInstaller } = await import('../../../src/targets/index.js');
    expect(getInstaller('claude-code')).toBeInstanceOf(ClaudeCodeInstaller);
  });

  it('returns OpenCodeInstaller for opencode', async () => {
    const { getInstaller } = await import('../../../src/targets/index.js');
    expect(getInstaller('opencode')).toBeInstanceOf(OpenCodeInstaller);
  });

  it('returns VSCodeInstaller for vscode', async () => {
    const { getInstaller } = await import('../../../src/targets/index.js');
    expect(getInstaller('vscode')).toBeInstanceOf(VSCodeInstaller);
  });

  it('returns CopilotInstaller for copilot', async () => {
    const { getInstaller } = await import('../../../src/targets/index.js');
    expect(getInstaller('copilot')).toBeInstanceOf(CopilotInstaller);
  });

  it('returns singleton instances on repeated calls', async () => {
    const { getInstaller } = await import('../../../src/targets/index.js');
    expect(getInstaller('claude-code')).toBe(getInstaller('claude-code'));
  });

  it('throws a descriptive error for an unrecognised target', async () => {
    const { getInstaller } = await import('../../../src/targets/index.js');
    expect(() => getInstaller('unknown-target' as any)).toThrowError(
      /Unknown install target: "unknown-target"/,
    );
  });

  it('error message for invalid target lists all valid targets', async () => {
    const { getInstaller } = await import('../../../src/targets/index.js');
    expect(() => getInstaller('bad' as any)).toThrowError(
      /claude-code.*opencode.*vscode.*copilot|opencode.*claude-code/,
    );
  });

  it('strips newline characters from target in error message', async () => {
    const { getInstaller } = await import('../../../src/targets/index.js');
    let message = '';
    try {
      getInstaller('vscode\nERROR: spoofed' as any);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain('\n');
    // allowlist regex removes non-alphanumeric chars; alphanumeric residue is kept
    expect(message).toContain('vscodeERRORspoofed');
  });

  it('strips C1 control characters (CSI \\x9B) from target in error message', async () => {
    const { getInstaller } = await import('../../../src/targets/index.js');
    let message = '';
    try {
      getInstaller('vscode\x9Binjected' as any);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain('\x9B');
    expect(message).toContain('vscodeinjected');
  });

  it('strips ANSI escape sequences and control characters from target in error message', async () => {
    const { getInstaller } = await import('../../../src/targets/index.js');
    let message = '';
    try {
      getInstaller('bad\x1B[31mRED\x1B[0m' as any);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain('\x1B');
    expect(message).toContain('bad');
  });
});

describe('getAllInstallers', () => {
  it('returns an object with all four IDE keys', async () => {
    const { getAllInstallers } = await import('../../../src/targets/index.js');
    const all = getAllInstallers();
    expect(Object.keys(all)).toEqual(expect.arrayContaining(['claude-code', 'opencode', 'vscode', 'copilot']));
  });
});
