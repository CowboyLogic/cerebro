import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { makeComponent, SAMPLE_SKILL_MD, SAMPLE_INSTRUCTION_MD } from '../__fixtures__/tree-responses.js';

// Use memfs for real filesystem simulation
vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return { default: fs, ...fs };
});

vi.mock('../../../src/utils/paths.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/utils/paths.js')>();
  return {
    ...original,
    ensureDir: vi.fn(async (dirPath: string) => {
      const { fs } = await import('memfs');
      fs.mkdirSync(dirPath, { recursive: true });
    }),
    findWorkspaceRoot: vi.fn(() => null),
  };
});

vi.mock('../../src/core/github.js', () => ({
  getFileContents: vi.fn(),
}));

beforeEach(async () => {
  const { vol } = await import('memfs');
  vol.reset();
  vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
  vi.spyOn(os, 'platform').mockReturnValue('linux');
  delete process.env.XDG_CONFIG_HOME;
  vi.clearAllMocks();
});

describe('Skill install → Claude Code (workspace scope)', () => {
  it('writes SKILL.md to workspace .claude/skills/<name>/', async () => {
    const { getFileContents } = await import('../../src/core/github.js');
    vi.mocked(getFileContents).mockResolvedValue([
      { path: 'skills/my-skill/SKILL.md', name: 'SKILL.md', content: SAMPLE_SKILL_MD },
    ]);

    const { installComponent } = await import('../../src/core/installer.js');
    const comp = makeComponent({ name: 'my-skill', type: 'skill' });
    const result = await installComponent(comp, 'claude-code', 'workspace', '/proj');

    expect(result.success).toBe(true);
    const { fs } = await import('memfs');
    const writtenPath = path.join('/proj', '.claude', 'skills', 'my-skill', 'SKILL.md');
    expect(fs.existsSync(writtenPath)).toBe(true);
    const content = fs.readFileSync(writtenPath, 'utf-8') as string;
    expect(content).toContain('comprehensive tests');
  });
});

describe('Instruction install → VS Code (workspace scope, append)', () => {
  it('creates copilot-instructions.md when none exists', async () => {
    const { getFileContents } = await import('../../src/core/github.js');
    vi.mocked(getFileContents).mockResolvedValue([
      { path: 'instructions/coding.md', name: 'coding.md', content: SAMPLE_INSTRUCTION_MD },
    ]);

    const { installComponent } = await import('../../src/core/installer.js');
    const comp = makeComponent({ type: 'instruction', compatibleTargets: ['vscode'] });
    const result = await installComponent(comp, 'vscode', 'workspace', '/proj');

    expect(result.success).toBe(true);
    const { fs } = await import('memfs');
    const writtenPath = path.join('/proj', '.vscode', '.github', 'copilot-instructions.md');
    expect(fs.existsSync(writtenPath)).toBe(true);
  });

  it('appends to existing copilot-instructions.md', async () => {
    const { getFileContents } = await import('../../src/core/github.js');
    const { fs } = await import('memfs');

    // Pre-create existing file
    fs.mkdirSync(path.join('/proj', '.vscode', '.github'), { recursive: true });
    fs.writeFileSync(path.join('/proj', '.vscode', '.github', 'copilot-instructions.md'), '# Existing');

    vi.mocked(getFileContents).mockResolvedValue([
      { path: 'instructions/new.md', name: 'new.md', content: '# New Instructions' },
    ]);

    const { installComponent } = await import('../../src/core/installer.js');
    const comp = makeComponent({ name: 'new-comp', type: 'instruction', compatibleTargets: ['vscode'] });
    await installComponent(comp, 'vscode', 'workspace', '/proj');

    const filePath = path.join('/proj', '.vscode', '.github', 'copilot-instructions.md');
    const content = fs.readFileSync(filePath, 'utf-8') as string;
    expect(content).toContain('# Existing');
    expect(content).toContain('# New Instructions');
  });
});

describe('Dry run produces no filesystem writes', () => {
  it('installs with dryRun=true → no files written', async () => {
    const { getFileContents } = await import('../../src/core/github.js');
    vi.mocked(getFileContents).mockResolvedValue([
      { path: 'skills/my-skill/SKILL.md', name: 'SKILL.md', content: SAMPLE_SKILL_MD },
    ]);

    const { installComponent } = await import('../../src/core/installer.js');
    const result = await installComponent(makeComponent(), 'claude-code', 'workspace', '/proj', true);

    const { vol } = await import('memfs');
    // Volume should have no files (only the pre-seeded dir from appending test is reset in beforeEach)
    expect(Object.keys(vol.toJSON())).toHaveLength(0);
    expect(result.installedFiles[0]).toContain('[dry-run]');
  });
});

describe('File without content → partial failure', () => {
  it('fails gracefully when a file has no content', async () => {
    const { getFileContents } = await import('../../src/core/github.js');
    vi.mocked(getFileContents).mockResolvedValue([
      { path: 'skills/my-skill/SKILL.md', name: 'SKILL.md', content: SAMPLE_SKILL_MD },
      { path: 'skills/my-skill/LICENSE.txt', name: 'LICENSE.txt' }, // no content
    ]);

    const { installComponent } = await import('../../src/core/installer.js');
    const comp = makeComponent();
    comp.files = [
      { path: 'skills/test-component/SKILL.md', name: 'SKILL.md' },
      { path: 'skills/test-component/LICENSE.txt', name: 'LICENSE.txt' },
    ];
    const result = await installComponent(comp, 'claude-code', 'workspace', '/proj');

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
