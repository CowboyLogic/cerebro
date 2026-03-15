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
});

describe('getAllInstallers', () => {
  it('returns an object with all four IDE keys', async () => {
    const { getAllInstallers } = await import('../../../src/targets/index.js');
    const all = getAllInstallers();
    expect(Object.keys(all)).toEqual(expect.arrayContaining(['claude-code', 'opencode', 'vscode', 'copilot']));
  });
});
