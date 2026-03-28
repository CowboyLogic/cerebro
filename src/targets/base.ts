import fs from 'node:fs';
import path from 'node:path';
import { InstallOptions, InstallResult } from '../core/types.js';
import { ensureDir } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

export abstract class BaseInstaller {
  abstract get name(): string;

  abstract getInstallDir(options: InstallOptions): string;

  abstract transformContent(content: string, options: InstallOptions): string;

  abstract getTargetFileName(sourceFile: string, options: InstallOptions): string;

  /**
   * Throws if targetPath escapes the installDir. Prevents path traversal attacks
   * where malicious component names like '../../.ssh/authorized_keys' could write
   * outside the intended install directory.
   */
  protected static assertConfined(installDir: string, targetPath: string): void {
    const base = path.resolve(installDir);
    const resolved = path.resolve(targetPath);
    if (resolved !== base && !resolved.startsWith(base + path.sep)) {
      throw new Error(`Security: path "${resolved}" escapes install directory "${base}"`);
    }
    logger.debug(`assertConfined ok  base=${base}  target=${resolved}`);
  }

  async install(options: InstallOptions): Promise<InstallResult> {
    const { component, target, scope, dryRun } = options;
    const installDir = this.getInstallDir(options);
    const installedFiles: string[] = [];
    const errors: string[] = [];

    try {
      if (!dryRun) {
        ensureDir(installDir);
      }

      for (const file of component.files) {
        if (!file.content) {
          errors.push(`No content for ${file.name}`);
          continue;
        }

        const targetName = this.getTargetFileName(file.name, options);
        const targetPath = path.join(installDir, targetName);
        BaseInstaller.assertConfined(installDir, targetPath);
        const content = this.transformContent(file.content, options);

        if (dryRun) {
          installedFiles.push(`[dry-run] ${targetPath}`);
        } else {
          ensureDir(path.dirname(targetPath));
          fs.writeFileSync(targetPath, content, 'utf-8');
          logger.debug(`writeFile ok  path=${targetPath}  bytes=${content.length}`);
          installedFiles.push(targetPath);
        }
      }
    } catch (err) {
      errors.push(`Installation failed: ${(err as Error).message}`);
    }

    return {
      success: errors.length === 0,
      component,
      target,
      scope,
      installedFiles,
      errors,
    };
  }
}
