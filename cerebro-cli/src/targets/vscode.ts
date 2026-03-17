import path from 'node:path';
import fs from 'node:fs';
import { BaseInstaller } from './base.js';
import { InstallOptions, InstallResult } from '../core/types.js';
import { getIDEPaths, findWorkspaceRoot, ensureDir } from '../utils/paths.js';

export class VSCodeInstaller extends BaseInstaller {
  get name() { return 'VS Code'; }

  getInstallDir(options: InstallOptions): string {
    const paths = getIDEPaths();
    const { component, scope, workspaceRoot } = options;

    if (scope === 'workspace') {
      const root = workspaceRoot || findWorkspaceRoot() || process.cwd();
      return paths.vscode.workspace(root);
    }

    return paths.vscode.user;
  }

  transformContent(content: string, options: InstallOptions): string {
    const { component } = options;
    // For instructions/prompts, wrap as Copilot chat instructions for VS Code
    if (component.type === 'instruction' || component.type === 'prompt') {
      return content;
    }
    // For snippets, ensure valid JSON
    if (component.type === 'snippet') {
      try { JSON.parse(content); return content; }
      catch { return this.wrapAsSnippet(content, component.name); }
    }
    return content;
  }

  getTargetFileName(sourceFile: string, options: InstallOptions): string {
    const { component } = options;
    if (component.type === 'instruction' || component.type === 'prompt') {
      return path.join('.github', 'copilot-instructions.md');
    }
    if (component.type === 'snippet') {
      return path.join('snippets', `${component.name}.code-snippets`);
    }
    return sourceFile;
  }

  async install(options: InstallOptions): Promise<InstallResult> {
    const { component, scope, dryRun } = options;

    // For prompts/instructions, append to existing copilot-instructions.md
    if (component.type === 'instruction' || component.type === 'prompt') {
      return this.installAsInstructions(options);
    }

    return super.install(options);
  }

  private async installAsInstructions(options: InstallOptions): Promise<InstallResult> {
    const installDir = this.getInstallDir(options);
    const { component, target, scope, dryRun } = options;
    const installedFiles: string[] = [];
    const errors: string[] = [];

    try {
      // Bug 1 fix: workspace-scope copilot-instructions.md belongs at
      // <workspaceRoot>/.github, not inside installDir (<workspaceRoot>/.vscode).
      // For user scope, installDir already points to the VS Code config dir.
      const root = options.workspaceRoot || findWorkspaceRoot() || process.cwd();
      const ghDir = options.scope === 'workspace'
        ? path.join(root, '.github')
        : path.join(installDir, '.github');
      const filePath = path.join(ghDir, 'copilot-instructions.md');

      if (!dryRun) {
        ensureDir(ghDir);
        let existing = '';
        try { existing = fs.readFileSync(filePath, 'utf-8'); } catch { /* new file */ }

        const newContent = component.files
          .filter(f => f.content)
          .map(f => f.content)
          .join('\n\n');

        const separator = `\n\n<!-- ${component.name} - installed by cerebro -->\n\n`;
        const final = existing ? existing + separator + newContent : newContent;

        // Bug 2 fix: assert filePath is confined to ghDir before every write.
        BaseInstaller.assertConfined(ghDir, filePath);
        fs.writeFileSync(filePath, final, 'utf-8');
        installedFiles.push(filePath);
      } else {
        installedFiles.push(`[dry-run] ${filePath}`);
      }
    } catch (err) {
      errors.push(`Installation failed: ${(err as Error).message}`);
    }

    return { success: errors.length === 0, component, target, scope, installedFiles, errors };
  }

  private wrapAsSnippet(content: string, name: string): string {
    return JSON.stringify({
      [name]: {
        prefix: name.toLowerCase().replace(/\s+/g, '-'),
        body: content.split('\n'),
        description: `AI snippet: ${name}`,
      }
    }, null, 2);
  }
}
