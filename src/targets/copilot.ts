import path from 'node:path';
import fs from 'node:fs';
import { BaseInstaller } from './base.js';
import { InstallOptions, InstallResult } from '../core/types.js';
import { getIDEPaths, findWorkspaceRoot, ensureDir } from '../utils/paths.js';

export class CopilotInstaller extends BaseInstaller {
  get name() { return 'Copilot CLI'; }

  getInstallDir(options: InstallOptions): string {
    const paths = getIDEPaths();
    const { scope, workspaceRoot } = options;

    if (scope === 'workspace') {
      const root = workspaceRoot || findWorkspaceRoot() || process.cwd();
      return paths.copilot.workspace(root);
    }

    return paths.copilot.user;
  }

  transformContent(content: string, _options: InstallOptions): string {
    return content;
  }

  getTargetFileName(sourceFile: string, options: InstallOptions): string {
    const { component } = options;
    if (component.type === 'instruction' || component.type === 'prompt') {
      return 'copilot-instructions.md';
    }
    if (component.type === 'agent') {
      return path.join('agents', `${component.name}.md`);
    }
    return sourceFile;
  }

  async install(options: InstallOptions): Promise<InstallResult> {
    const { component, target, scope, dryRun } = options;
    const installDir = this.getInstallDir(options);
    const installedFiles: string[] = [];
    const errors: string[] = [];

    try {
      if (!dryRun) ensureDir(installDir);

      if (component.type === 'instruction' || component.type === 'prompt') {
        // Append to copilot-instructions.md
        const filePath = path.join(installDir, 'copilot-instructions.md');
        BaseInstaller.assertConfined(installDir, filePath);
        if (!dryRun) {
          let existing = '';
          try { existing = fs.readFileSync(filePath, 'utf-8'); } catch { /* new */ }

          const newContent = component.files
            .filter(f => f.content)
            .map(f => f.content)
            .join('\n\n');

          const separator = `\n\n<!-- ${component.name} - installed by cerebro -->\n\n`;
          fs.writeFileSync(filePath, existing ? existing + separator + newContent : newContent, 'utf-8');
          installedFiles.push(filePath);
        } else {
          installedFiles.push(`[dry-run] ${path.join(installDir, 'copilot-instructions.md')}`);
        }
      } else {
        // Install files to appropriate subdirectory
        for (const file of component.files) {
          if (!file.content) { errors.push(`No content for ${file.name}`); continue; }
          const targetName = this.getTargetFileName(file.name, options);
          const targetPath = path.join(installDir, targetName);
          BaseInstaller.assertConfined(installDir, targetPath);
          if (!dryRun) {
            ensureDir(path.dirname(targetPath));
            fs.writeFileSync(targetPath, this.transformContent(file.content, options), 'utf-8');
          }
          installedFiles.push(dryRun ? `[dry-run] ${targetPath}` : targetPath);
        }
      }
    } catch (err) {
      errors.push(`Installation failed: ${(err as Error).message}`);
    }

    return { success: errors.length === 0, component, target, scope, installedFiles, errors };
  }
}
