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
  return installers[target];
}

export function getAllInstallers(): Record<TargetIDE, BaseInstaller> {
  return installers;
}
