import path from 'node:path';
import { BaseInstaller } from './base.js';
import { InstallOptions } from '../core/types.js';
import { getIDEPaths, findWorkspaceRoot } from '../utils/paths.js';

export class ClaudeCodeInstaller extends BaseInstaller {
  get name() { return 'Claude Code'; }

  getInstallDir(options: InstallOptions): string {
    const paths = getIDEPaths();
    const { component, scope, workspaceRoot } = options;

    if (scope === 'workspace') {
      const root = workspaceRoot || findWorkspaceRoot() || process.cwd();
      const base = paths.claudeCode.workspace(root);

      switch (component.type) {
        case 'skill':
          return path.join(base, 'skills', component.name);
        case 'agent':
          return path.join(base, 'agents');
        case 'prompt':
        case 'instruction':
          return base;
        default:
          return path.join(base, component.type + 's');
      }
    }

    const base = paths.claudeCode.user;
    switch (component.type) {
      case 'skill':
        return path.join(base, 'skills', component.name);
      case 'agent':
        return path.join(base, 'agents');
      case 'prompt':
      case 'instruction':
        return base;
      default:
        return path.join(base, component.type + 's');
    }
  }

  transformContent(content: string, _options: InstallOptions): string {
    // Claude Code uses markdown natively, minimal transformation needed
    return content;
  }

  getTargetFileName(sourceFile: string, options: InstallOptions): string {
    const { component } = options;
    // SKILL.md stays as SKILL.md in skills directory
    if (sourceFile === 'SKILL.md') return 'SKILL.md';
    // Instructions go to CLAUDE.md
    if (component.type === 'instruction' && sourceFile.endsWith('.md')) {
      return 'CLAUDE.md';
    }
    return sourceFile;
  }
}
