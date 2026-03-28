import path from 'node:path';
import { BaseInstaller } from './base.js';
import { InstallOptions } from '../core/types.js';
import { getIDEPaths, findWorkspaceRoot } from '../utils/paths.js';

export class OpenCodeInstaller extends BaseInstaller {
  get name() { return 'OpenCode'; }

  getInstallDir(options: InstallOptions): string {
    const paths = getIDEPaths();
    const { component, scope, workspaceRoot } = options;

    if (scope === 'workspace') {
      const root = workspaceRoot || findWorkspaceRoot() || process.cwd();
      const base = paths.openCode.workspace(root);
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

    const base = paths.openCode.user;
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

  transformContent(content: string, options: InstallOptions): string {
    // OpenCode uses similar markdown format
    // Add a header comment noting the source
    const { component } = options;
    const header = `<!-- Installed by cerebro from ${component.source.owner}/${component.source.repo} -->\n\n`;
    return header + content;
  }

  getTargetFileName(sourceFile: string, options: InstallOptions): string {
    const { component } = options;
    if (component.type === 'instruction' && sourceFile.endsWith('.md')) {
      return 'AGENTS.md';
    }
    if (sourceFile === 'SKILL.md') return 'SKILL.md';
    return sourceFile;
  }
}
