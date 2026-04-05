/**
 * Tests for SPEC-0010 — GitHub Authentication (provider.ts)
 * Requirement IDs: AUTH-REQ-0001 through AUTH-REQ-0008
 *
 * Uses the REAL provider module. No vi.mock on provider.js here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Capture Octokit constructor args so we can assert on the `auth` option
const { octokitConstructorArgs } = vi.hoisted(() => {
  const octokitConstructorArgs: unknown[] = [];
  return { octokitConstructorArgs };
});

vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    rest = { repos: { getContent: vi.fn().mockResolvedValue({ data: [], status: 200 }) } };
    request = vi.fn();
    constructor(opts: unknown) { octokitConstructorArgs.push(opts); }
  },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

// Mock node:child_process for gh auth token tests
const { mockExecSync } = vi.hoisted(() => ({ mockExecSync: vi.fn() }));
vi.mock('node:child_process', () => ({ execSync: mockExecSync }));

// ---------------------------------------------------------------------------
// Tests for resolveGitHubToken (AUTH-REQ-0001 through AUTH-REQ-0006)
// ---------------------------------------------------------------------------

describe('resolveGitHubToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    octokitConstructorArgs.length = 0;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
  });

  it('AUTH-REQ-0001: returns GITHUB_TOKEN when set', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test_token_123';
    const { resolveGitHubToken } = await import('../../../src/core/provider.js');
    expect(resolveGitHubToken()).toBe('ghp_test_token_123');
  });

  it('AUTH-REQ-0001: does not call execSync when GITHUB_TOKEN is set', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test_token_123';
    const { resolveGitHubToken } = await import('../../../src/core/provider.js');
    resolveGitHubToken();
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('AUTH-REQ-0002: returns GH_TOKEN when GITHUB_TOKEN is absent', async () => {
    process.env.GH_TOKEN = 'ghp_gh_token_456';
    const { resolveGitHubToken } = await import('../../../src/core/provider.js');
    expect(resolveGitHubToken()).toBe('ghp_gh_token_456');
  });

  it('AUTH-REQ-0002: does not call execSync when GH_TOKEN is set', async () => {
    process.env.GH_TOKEN = 'ghp_gh_token_456';
    const { resolveGitHubToken } = await import('../../../src/core/provider.js');
    resolveGitHubToken();
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('AUTH-REQ-0001 takes priority over AUTH-REQ-0002: GITHUB_TOKEN wins over GH_TOKEN', async () => {
    process.env.GITHUB_TOKEN = 'ghp_first';
    process.env.GH_TOKEN = 'ghp_second';
    const { resolveGitHubToken } = await import('../../../src/core/provider.js');
    expect(resolveGitHubToken()).toBe('ghp_first');
  });

  it('AUTH-REQ-0003/0004: calls `gh auth token` when no env vars are set', async () => {
    mockExecSync.mockReturnValue(Buffer.from('ghp_from_cli\n'));
    const { resolveGitHubToken } = await import('../../../src/core/provider.js');
    const result = resolveGitHubToken();
    expect(mockExecSync).toHaveBeenCalledWith('gh auth token', expect.objectContaining({ timeout: 2000 }));
    expect(result).toBe('ghp_from_cli');
  });

  it('AUTH-REQ-0004: trims whitespace from gh auth token output', async () => {
    mockExecSync.mockReturnValue(Buffer.from('  ghp_trimmed  \n'));
    const { resolveGitHubToken } = await import('../../../src/core/provider.js');
    expect(resolveGitHubToken()).toBe('ghp_trimmed');
  });

  it('AUTH-REQ-0005: returns undefined when gh is not installed (throws ENOENT)', async () => {
    const err = Object.assign(new Error('Command not found: gh'), { code: 'ENOENT' });
    mockExecSync.mockImplementation(() => { throw err; });
    const { resolveGitHubToken } = await import('../../../src/core/provider.js');
    expect(resolveGitHubToken()).toBeUndefined();
  });

  it('AUTH-REQ-0005: returns undefined when gh exits non-zero', async () => {
    const err = Object.assign(new Error('not logged in'), { status: 1 });
    mockExecSync.mockImplementation(() => { throw err; });
    const { resolveGitHubToken } = await import('../../../src/core/provider.js');
    expect(resolveGitHubToken()).toBeUndefined();
  });

  it('AUTH-REQ-0005: returns undefined when gh auth token returns empty string', async () => {
    mockExecSync.mockReturnValue(Buffer.from('   \n'));
    const { resolveGitHubToken } = await import('../../../src/core/provider.js');
    expect(resolveGitHubToken()).toBeUndefined();
  });

  it('AUTH-REQ-0005: never throws — even if execSync throws unexpectedly', async () => {
    mockExecSync.mockImplementation(() => { throw new TypeError('unexpected'); });
    const { resolveGitHubToken } = await import('../../../src/core/provider.js');
    expect(() => resolveGitHubToken()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests for GitHubProvider token wiring (AUTH-REQ-0007, AUTH-REQ-0008)
// ---------------------------------------------------------------------------

describe('createProvider — token wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    octokitConstructorArgs.length = 0;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
  });

  it('AUTH-REQ-0008: Octokit is constructed with auth when token is available', async () => {
    process.env.GITHUB_TOKEN = 'ghp_wired_token';
    const { createProvider } = await import('../../../src/core/provider.js');
    createProvider('https://github.com/owner/repo');
    const opts = octokitConstructorArgs[0] as Record<string, unknown>;
    expect(opts['auth']).toBe('ghp_wired_token');
  });

  it('AUTH-REQ-0008: Octokit is constructed without auth when no token is found', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('gh not found'); });
    const { createProvider } = await import('../../../src/core/provider.js');
    createProvider('https://github.com/owner/repo');
    const opts = octokitConstructorArgs[0] as Record<string, unknown>;
    expect(opts['auth']).toBeUndefined();
  });
});
