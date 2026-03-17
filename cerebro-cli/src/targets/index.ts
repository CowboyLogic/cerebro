import { TargetIDE } from '../core/types.js';
import { BaseInstaller } from './base.js';
import { ClaudeCodeInstaller } from './claude-code.js';
import { OpenCodeInstaller } from './opencode.js';
import { VSCodeInstaller } from './vscode.js';
import { CopilotInstaller } from './copilot.js';

const installers: Record<TargetIDE, BaseInstaller> = {
  'claude-code': new ClaudeCodeInstaller(),
  'opencode': new OpenCodeInstaller(),
  'vscode': new VSCodeInstaller(),
  'copilot': new CopilotInstaller(),
};

export function getInstaller(target: TargetIDE): BaseInstaller {
  const installer = installers[target];
  if (!installer) {
    const safeTarget = target.replace(/[^a-zA-Z0-9\-_]/g, '');
    throw new Error(`Unknown install target: "${safeTarget}". Valid targets: ${Object.keys(installers).join(', ')}`);
  }
  return installer;
}

export function getAllInstallers(): Record<TargetIDE, BaseInstaller> {
  return installers;
}
