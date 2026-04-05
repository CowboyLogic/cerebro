/**
 * Tests for SPEC-0006 — Installer
 * Requirement IDs: INS-REQ-0001 through INS-REQ-0014
 *
 * Note: This file replaces the provisional installer.test.ts which tested
 * the discarded Phase 2 implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const toPosix = (p: string) => p.replace(/\\/g, '/');
import type { Artifact } from '@cowboylogic/cerebro-schema';
import type { CerebroConfig } from '../../../src/core/config.js';
import type { InstallManifest } from '../../../src/core/manifest.js';
import type { SourceProvider } from '../../../src/core/provider.js';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------
const mockResolveInstallBase = vi.fn<[CerebroConfig, string, string, string], string>();
const mockRecordInstall = vi.fn();
const mockSaveManifest = vi.fn();

vi.mock('../../../src/core/config.js', () => ({
  resolveInstallBase: mockResolveInstallBase,
}));

vi.mock('../../../src/core/manifest.js', () => ({
  recordInstall: mockRecordInstall,
  saveManifest: mockSaveManifest,
}));

// ---------------------------------------------------------------------------
// Mock node:fs for path existence checks and cleanup verification
// ---------------------------------------------------------------------------
const fsMock = {
  existsSync: vi.fn<[string], boolean>().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
  renameSync: vi.fn(),
};

vi.mock('node:fs', () => ({
  default: fsMock,
  ...fsMock,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeSkillArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'git-commit-assistant',
    name: 'Git Commit Assistant',
    type: 'skill',
    source: 'skills/git-commit-assistant',
    ...overrides,
  };
}

function makeInstructionArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'python-style',
    name: 'Python Style',
    type: 'instruction',
    source: 'instructions/python.instructions.md',
    ...overrides,
  };
}

function makeConfig(): CerebroConfig {
  return { defaults: {}, sources: [], targets: {} };
}

function makeManifest(): InstallManifest {
  return { installed: [] };
}

function makeProvider(overrides: Partial<SourceProvider> = {}): SourceProvider {
  return {
    domain: 'github.com',
    listDirectory: vi.fn().mockResolvedValue([]),
    fetchFileContent: vi.fn().mockResolvedValue('# content'),
    downloadDirectory: vi.fn().mockResolvedValue(undefined),
    downloadFile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// INS-REQ-0001: artifact.supports filtering
// ---------------------------------------------------------------------------
describe('installArtifact — supports filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveInstallBase.mockReturnValue('/projects/.claude/commands');
    mockRecordInstall.mockImplementation((m) => m);
  });

  it('INS-REQ-0001: returns skipped/unsupported-target if tool not in artifact.supports', async () => {
    const artifact = makeSkillArtifact({ supports: ['copilot'] });
    const { installArtifact } = await import('../../../src/core/installer.js');

    const result = await installArtifact(
      artifact,
      'anthropics',
      'skills',
      'claude-code', // not in supports
      'workspace',
      makeConfig(),
      makeManifest(),
      makeProvider(),
      { overwrite: false },
    );

    expect(result.status).toBe('skipped');
    expect((result as any).reason).toBe('unsupported-target');
  });

  it('INS-REQ-0001: does not write anything when skipping unsupported target', async () => {
    const artifact = makeSkillArtifact({ supports: ['copilot'] });
    const { installArtifact } = await import('../../../src/core/installer.js');

    await installArtifact(
      artifact, 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), makeProvider(), { overwrite: false },
    );

    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    expect(fsMock.mkdirSync).not.toHaveBeenCalled();
  });

  it('INS-REQ-0001: proceeds normally when artifact.supports is not set', async () => {
    const artifact = makeSkillArtifact(); // no supports
    fsMock.existsSync.mockReturnValue(false);
    const { installArtifact } = await import('../../../src/core/installer.js');

    const result = await installArtifact(
      artifact, 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), makeProvider(), { overwrite: false },
    );

    expect(result.status).not.toBe('skipped');
  });
});

// ---------------------------------------------------------------------------
// INS-REQ-0002: resolveInstallBase must be used
// ---------------------------------------------------------------------------
describe('installArtifact — path resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.existsSync.mockReturnValue(false);
    mockResolveInstallBase.mockReturnValue('/projects/.claude/commands');
    mockRecordInstall.mockImplementation((m) => m);
  });

  it('INS-REQ-0002: calls resolveInstallBase with correct tool, type, and scope', async () => {
    const artifact = makeSkillArtifact();
    const { installArtifact } = await import('../../../src/core/installer.js');
    const config = makeConfig();

    await installArtifact(
      artifact, 'anthropics', 'skills', 'claude-code', 'workspace',
      config, makeManifest(), makeProvider(), { overwrite: false },
    );

    expect(mockResolveInstallBase).toHaveBeenCalledWith(config, 'claude-code', 'skill', 'workspace');
  });
});

// ---------------------------------------------------------------------------
// INS-REQ-0003: path confinement
// ---------------------------------------------------------------------------
describe('installArtifact — path confinement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordInstall.mockImplementation((m) => m);
  });

  it('INS-REQ-0003: returns error if resolved destination escapes install base', async () => {
    // A path traversal in artifact.id would cause destination to escape the base
    const artifact = makeSkillArtifact({ id: '../../../etc/passwd', source: '../../../etc/passwd' });
    mockResolveInstallBase.mockReturnValue('/projects/.claude/commands');
    fsMock.existsSync.mockReturnValue(false);

    const { installArtifact } = await import('../../../src/core/installer.js');

    const result = await installArtifact(
      artifact, 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), makeProvider(), { overwrite: false },
    );

    expect(result.status).toBe('error');
    expect((result as any).message).toMatch(/confinement|traversal|escape/i);
  });
});

// ---------------------------------------------------------------------------
// INS-REQ-0004 + INS-REQ-0005: overwrite behaviour
// ---------------------------------------------------------------------------
describe('installArtifact — overwrite handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveInstallBase.mockReturnValue('/projects/.claude/commands');
    mockRecordInstall.mockImplementation((m) => m);
  });

  it('INS-REQ-0004: returns skipped/exists when destination exists and overwrite:false', async () => {
    fsMock.existsSync.mockReturnValue(true); // destination exists
    const { installArtifact } = await import('../../../src/core/installer.js');

    const result = await installArtifact(
      makeSkillArtifact(), 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), makeProvider(), { overwrite: false },
    );

    expect(result.status).toBe('skipped');
    expect((result as any).reason).toBe('exists');
  });

  it('INS-REQ-0004: writes nothing when returning skipped/exists', async () => {
    fsMock.existsSync.mockReturnValue(true);
    const { installArtifact } = await import('../../../src/core/installer.js');

    await installArtifact(
      makeSkillArtifact(), 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), makeProvider(), { overwrite: false },
    );

    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  it('INS-REQ-0005: removes existing destination before writing when overwrite:true', async () => {
    fsMock.existsSync.mockReturnValue(true);
    const { installArtifact } = await import('../../../src/core/installer.js');

    await installArtifact(
      makeSkillArtifact(), 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), makeProvider(), { overwrite: true },
    );

    expect(fsMock.rmSync).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// INS-REQ-0006: baseline file protection
// ---------------------------------------------------------------------------
describe('installArtifact — baseline file protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordInstall.mockImplementation((m) => m);
  });

  it.each(['CLAUDE.md', 'AGENTS.md', 'copilot-instructions.md'])(
    'INS-REQ-0006: refuses to write to baseline file "%s" even with overwrite:true',
    async (filename) => {
      // Set up a scenario where the install base + artifactId resolves to the baseline filename
      mockResolveInstallBase.mockReturnValue('/projects');
      const artifact = makeInstructionArtifact({
        id: filename.replace('.md', '').toLowerCase(),
        source: filename,
      });
      fsMock.existsSync.mockReturnValue(false);

      const { installArtifact } = await import('../../../src/core/installer.js');

      const result = await installArtifact(
        artifact, 'anthropics', 'skills', 'claude-code', 'workspace',
        makeConfig(), makeManifest(), makeProvider(), { overwrite: true },
      );

      // Must not write a baseline file under any circumstances
      const writtenPaths = fsMock.writeFileSync.mock.calls.map(([p]) => p as string);
      expect(writtenPaths.some((p) => p.endsWith(filename))).toBe(false);
      // Should be an error or skipped result
      expect(['error', 'skipped']).toContain(result.status);
    },
  );
});

// ---------------------------------------------------------------------------
// INS-REQ-0007: skill install downloads entire directory tree
// ---------------------------------------------------------------------------
describe('installArtifact — skill install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.existsSync.mockReturnValue(false);
    mockResolveInstallBase.mockReturnValue('/projects/.claude/commands');
    mockRecordInstall.mockImplementation((m) => m);
  });

  it('INS-REQ-0007: calls downloadDirectory for a skill artifact', async () => {
    const provider = makeProvider();
    const { installArtifact } = await import('../../../src/core/installer.js');

    const result = await installArtifact(
      makeSkillArtifact(), 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), provider, { overwrite: false },
    );

    expect(provider.downloadDirectory).toHaveBeenCalled();
    expect(result.status).toBe('success');
  });

  it('INS-REQ-0007: skill destination is installBase / artifactId', async () => {
    const provider = makeProvider();
    const { installArtifact } = await import('../../../src/core/installer.js');

    await installArtifact(
      makeSkillArtifact(), 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), provider, { overwrite: false },
    );

    const [, , , destPath] = (provider.downloadDirectory as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(toPosix(destPath as string)).toContain('git-commit-assistant');
    expect(toPosix(destPath as string)).toContain('.claude/commands');
  });
});

// ---------------------------------------------------------------------------
// INS-REQ-0008: instruction install downloads single file
// ---------------------------------------------------------------------------
describe('installArtifact — instruction install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.existsSync.mockReturnValue(false);
    mockResolveInstallBase.mockReturnValue('/projects/.claude/rules');
    mockRecordInstall.mockImplementation((m) => m);
  });

  it('INS-REQ-0008: calls downloadFile for an instruction artifact', async () => {
    const provider = makeProvider();
    const { installArtifact } = await import('../../../src/core/installer.js');

    const result = await installArtifact(
      makeInstructionArtifact(), 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), provider, { overwrite: false },
    );

    expect(provider.downloadFile).toHaveBeenCalled();
    expect(result.status).toBe('success');
  });

  it('INS-REQ-0008: instruction destination is installBase / filename', async () => {
    const provider = makeProvider();
    const { installArtifact } = await import('../../../src/core/installer.js');

    await installArtifact(
      makeInstructionArtifact(), 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), provider, { overwrite: false },
    );

    const [, , , destPath] = (provider.downloadFile as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(toPosix(destPath as string)).toContain('python.instructions.md');
    expect(toPosix(destPath as string)).toContain('.claude/rules');
  });
});

// ---------------------------------------------------------------------------
// INS-REQ-0009: parent directory creation
// ---------------------------------------------------------------------------
describe('installArtifact — directory creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.existsSync.mockReturnValue(false);
    mockResolveInstallBase.mockReturnValue('/projects/.claude/commands');
    mockRecordInstall.mockImplementation((m) => m);
  });

  it('INS-REQ-0009: creates parent directories before writing', async () => {
    const { installArtifact } = await import('../../../src/core/installer.js');
    await installArtifact(
      makeSkillArtifact(), 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), makeProvider(), { overwrite: false },
    );

    expect(fsMock.mkdirSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ recursive: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// INS-REQ-0010: manifest recording on success
// ---------------------------------------------------------------------------
describe('installArtifact — manifest recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.existsSync.mockReturnValue(false);
    mockResolveInstallBase.mockReturnValue('/projects/.claude/commands');
    mockRecordInstall.mockImplementation((m) => m);
  });

  it('INS-REQ-0010: calls recordInstall after successful install', async () => {
    const { installArtifact } = await import('../../../src/core/installer.js');
    await installArtifact(
      makeSkillArtifact(), 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), makeProvider(), { overwrite: false },
    );

    expect(mockRecordInstall).toHaveBeenCalled();
  });

  it('INS-REQ-0010: calls saveManifest after successful install', async () => {
    const { installArtifact } = await import('../../../src/core/installer.js');
    await installArtifact(
      makeSkillArtifact(), 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), makeProvider(), { overwrite: false },
    );

    expect(mockSaveManifest).toHaveBeenCalled();
  });

  it('INS-REQ-0010: recorded entry includes correct sourceUrl', async () => {
    const { installArtifact } = await import('../../../src/core/installer.js');
    await installArtifact(
      makeSkillArtifact(), 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), makeProvider(), { overwrite: false },
    );

    const [, entry] = mockRecordInstall.mock.calls[0];
    expect(entry.sourceUrl).toBe('https://github.com/anthropics/skills');
  });
});

// ---------------------------------------------------------------------------
// INS-REQ-0011: no partial files on error
// ---------------------------------------------------------------------------
describe('installArtifact — error cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.existsSync.mockReturnValue(false);
    mockResolveInstallBase.mockReturnValue('/projects/.claude/commands');
    mockRecordInstall.mockImplementation((m) => m);
  });

  it('INS-REQ-0011: cleans up partial writes on download error', async () => {
    const failingProvider = makeProvider({
      downloadDirectory: vi.fn().mockRejectedValue(new Error('network failure')),
    });

    const { installArtifact } = await import('../../../src/core/installer.js');
    const result = await installArtifact(
      makeSkillArtifact(), 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), failingProvider, { overwrite: false },
    );

    expect(result.status).toBe('error');
    // Cleanup: rmSync should have been called to remove any partial directory
    expect(fsMock.rmSync).toHaveBeenCalled();
  });

  it('INS-REQ-0010: does NOT call recordInstall or saveManifest on error', async () => {
    const failingProvider = makeProvider({
      downloadDirectory: vi.fn().mockRejectedValue(new Error('network failure')),
    });

    const { installArtifact } = await import('../../../src/core/installer.js');
    await installArtifact(
      makeSkillArtifact(), 'anthropics', 'skills', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), failingProvider, { overwrite: false },
    );

    expect(mockRecordInstall).not.toHaveBeenCalled();
    expect(mockSaveManifest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// INS-REQ-0012: no throws — always returns InstallOutcome
// ---------------------------------------------------------------------------
describe('installArtifact — never throws', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.existsSync.mockReturnValue(false);
    mockResolveInstallBase.mockReturnValue('/projects/.claude/commands');
    mockRecordInstall.mockImplementation((m) => m);
  });

  it('INS-REQ-0012: returns error object instead of throwing on provider failure', async () => {
    const failingProvider = makeProvider({
      downloadDirectory: vi.fn().mockRejectedValue(new Error('unexpected crash')),
    });

    const { installArtifact } = await import('../../../src/core/installer.js');

    await expect(
      installArtifact(
        makeSkillArtifact(), 'anthropics', 'skills', 'claude-code', 'workspace',
        makeConfig(), makeManifest(), failingProvider, { overwrite: false },
      ),
    ).resolves.toMatchObject({ status: 'error', message: expect.any(String) });
  });
});

// ---------------------------------------------------------------------------
// INS-REQ-0014: unsupported artifact types
// ---------------------------------------------------------------------------
describe('installArtifact — unsupported types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.existsSync.mockReturnValue(false);
    mockResolveInstallBase.mockReturnValue('/projects/.agents/skills');
    mockRecordInstall.mockImplementation((m) => m);
  });

  it('INS-REQ-0014: returns skipped/unsupported-target for artifact types other than skill/instruction', async () => {
    const agentArtifact: Artifact = {
      id: 'my-agent',
      name: 'My Agent',
      type: 'agent',
      source: 'agents/my-agent',
    };

    const { installArtifact } = await import('../../../src/core/installer.js');
    const result = await installArtifact(
      agentArtifact, 'owner', 'repo', 'claude-code', 'workspace',
      makeConfig(), makeManifest(), makeProvider(), { overwrite: false },
    );

    expect(result.status).toBe('skipped');
    expect((result as any).reason).toBe('unsupported-target');
  });
});
