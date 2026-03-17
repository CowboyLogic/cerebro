import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'node:os';

describe('getPlatform', () => {
  it('returns "windows" for win32', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    const { getPlatform } = await import('../../../src/utils/platform.js');
    expect(getPlatform()).toBe('windows');
  });

  it('returns "macos" for darwin', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('darwin');
    const { getPlatform } = await import('../../../src/utils/platform.js');
    expect(getPlatform()).toBe('macos');
  });

  it('returns "linux" for linux', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    const { getPlatform } = await import('../../../src/utils/platform.js');
    expect(getPlatform()).toBe('linux');
  });

  it('returns "linux" for unknown platform', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('freebsd' as any);
    const { getPlatform } = await import('../../../src/utils/platform.js');
    expect(getPlatform()).toBe('linux');
  });
});

describe('getHomeDir', () => {
  it('returns os.homedir() value', async () => {
    vi.spyOn(os, 'homedir').mockReturnValue('/fake/home');
    const { getHomeDir } = await import('../../../src/utils/platform.js');
    expect(getHomeDir()).toBe('/fake/home');
  });
});

describe('getUserConfigDir', () => {
  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
  });

  it('returns APPDATA on Windows when set', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    process.env.APPDATA = 'C:\\Users\\user\\AppData\\Roaming';
    const { getUserConfigDir } = await import('../../../src/utils/platform.js');
    expect(getUserConfigDir()).toBe('C:\\Users\\user\\AppData\\Roaming');
  });

  it('falls back to AppData/Roaming on Windows when APPDATA unset', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    delete process.env.APPDATA;
    const { getUserConfigDir } = await import('../../../src/utils/platform.js');
    expect(getUserConfigDir()).toContain('AppData');
  });

  it('returns Library/Application Support on macOS', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('darwin');
    const { getUserConfigDir } = await import('../../../src/utils/platform.js');
    const result = getUserConfigDir();
    expect(result).toContain('Library');
    expect(result).toContain('Application Support');
  });

  it('returns XDG_CONFIG_HOME on Linux when set', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    process.env.XDG_CONFIG_HOME = '/custom/config';
    const { getUserConfigDir } = await import('../../../src/utils/platform.js');
    expect(getUserConfigDir()).toBe('/custom/config');
  });

  it('falls back to ~/.config on Linux when XDG_CONFIG_HOME unset', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    delete process.env.XDG_CONFIG_HOME;
    const { getUserConfigDir } = await import('../../../src/utils/platform.js');
    expect(getUserConfigDir()).toContain('.config');
  });
});
