import path from 'node:path';
import fs from 'node:fs';
import { getHomeDir, getUserConfigDir, getPlatform } from './platform.js';

export type Scope = 'user' | 'workspace';

export interface IDEPaths {
  claudeCode: { user: string; workspace: (root: string) => string };
  openCode: { user: string; workspace: (root: string) => string };
  vscode: { user: string; workspace: (root: string) => string };
  copilot: { user: string; workspace: (root: string) => string };
}

export function getIDEPaths(): IDEPaths {
  const home = getHomeDir();
  const configDir = getUserConfigDir();
  const platform = getPlatform();

  return {
    claudeCode: {
      user: path.join(home, '.claude'),
      workspace: (root: string) => path.join(root, '.claude'),
    },
    openCode: {
      user: path.join(configDir, 'opencode'),
      workspace: (root: string) => path.join(root, '.opencode'),
    },
    vscode: {
      user: platform === 'windows'
        ? path.join(configDir, 'Code', 'User')
        : platform === 'macos'
          ? path.join(configDir, 'Code', 'User')
          : path.join(configDir, 'Code', 'User'),
      workspace: (root: string) => path.join(root, '.vscode'),
    },
    copilot: {
      user: path.join(home, '.github'),
      workspace: (root: string) => path.join(root, '.github'),
    },
  };
}

export function findWorkspaceRoot(startDir?: string): string | null {
  let dir = startDir || process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}
