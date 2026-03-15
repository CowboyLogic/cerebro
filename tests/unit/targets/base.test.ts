import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseInstaller } from '../../../src/targets/base.js';
import { InstallOptions } from '../../../src/core/types.js';
import { makeComponent } from '../../__fixtures__/tree-responses.js';

// Use vi.hoisted() so refs are available in vi.mock() factories (which get hoisted to top)
const { mockWriteFileSync, mockMkdirSync, mockEnsureDir } = vi.hoisted(() => ({
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockEnsureDir: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: { writeFileSync: mockWriteFileSync, mkdirSync: mockMkdirSync },
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
}));

vi.mock('../../../src/utils/paths.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/utils/paths.js')>();
  return { ...original, ensureDir: mockEnsureDir };
});

class TestInstaller extends BaseInstaller {
  get name() { return 'Test'; }
  getInstallDir(_opts: InstallOptions) { return '/install/dir'; }
  transformContent(content: string) { return content; }
  getTargetFileName(src: string) { return src; }
}

function makeOpts(overrides: Partial<InstallOptions> = {}): InstallOptions {
  return { component: makeComponent(), target: 'claude-code', scope: 'user', dryRun: false, ...overrides };
}

describe('BaseInstaller.install', () => {
  let installer: TestInstaller;

  beforeEach(() => {
    installer = new TestInstaller();
    vi.clearAllMocks();
  });

  it('calls ensureDir when dryRun is false', async () => {
    const opts = makeOpts({ component: makeComponent() });
    opts.component.files[0].content = '# content';
    await installer.install(opts);
    expect(mockEnsureDir).toHaveBeenCalled();
  });

  it('does not call writeFileSync when dryRun is true', async () => {
    const opts = makeOpts({ dryRun: true, component: makeComponent() });
    opts.component.files[0].content = '# content';
    await installer.install(opts);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('prefixes installed file paths with [dry-run] when dryRun', async () => {
    const opts = makeOpts({ dryRun: true, component: makeComponent() });
    opts.component.files[0].content = '# content';
    const result = await installer.install(opts);
    expect(result.installedFiles[0]).toContain('[dry-run]');
  });

  it('records an error for files without content', async () => {
    const comp = makeComponent();
    comp.files[0] = { path: 'file.md', name: 'file.md' };
    const result = await installer.install(makeOpts({ component: comp }));
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns success: true when all files have content', async () => {
    const comp = makeComponent();
    comp.files[0].content = '# hello';
    const result = await installer.install(makeOpts({ component: comp }));
    expect(result.success).toBe(true);
  });

  it('returns success: false when any file lacks content', async () => {
    const comp = makeComponent();
    comp.files = [
      { path: 'a.md', name: 'a.md', content: '# A' },
      { path: 'b.md', name: 'b.md' },
    ];
    const result = await installer.install(makeOpts({ component: comp }));
    expect(result.success).toBe(false);
  });

  it('catches writeFileSync errors and records them', async () => {
    mockWriteFileSync.mockImplementationOnce(() => { throw new Error('Permission denied'); });
    const comp = makeComponent();
    comp.files[0].content = '# content';
    const result = await installer.install(makeOpts({ component: comp }));
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Permission denied');
  });
});
