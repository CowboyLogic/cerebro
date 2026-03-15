import os from 'node:os';
import path from 'node:path';

export type Platform = 'windows' | 'macos' | 'linux';

export function getPlatform(): Platform {
  switch (os.platform()) {
    case 'win32': return 'windows';
    case 'darwin': return 'macos';
    default: return 'linux';
  }
}

export function getHomeDir(): string {
  return os.homedir();
}

export function getUserConfigDir(): string {
  const home = getHomeDir();
  const platform = getPlatform();
  switch (platform) {
    case 'windows':
      return process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    case 'macos':
      return path.join(home, 'Library', 'Application Support');
    default:
      return process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  }
}
