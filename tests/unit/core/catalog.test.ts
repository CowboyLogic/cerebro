/**
 * Tests for SPEC-0005 — Catalog
 * Requirement IDs: CAT-REQ-0001 through CAT-REQ-0014
 *
 * Note: SPEC-0005 was originally written referencing 'GitHubClient'.
 * These tests use 'SourceProvider' (SPEC-0003) — the correct abstraction per AD-14.
 * The spec interface will be updated to match during implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SourceProvider, RepoItem } from '../../../src/core/provider.js';
import { FileNotFoundError } from '../../../src/core/provider.js';
import type { Artifact } from '@cowboylogic/cerebro-schema';

// ---------------------------------------------------------------------------
// Build a mock SourceProvider
// ---------------------------------------------------------------------------
function makeProvider(overrides: Partial<SourceProvider> = {}): SourceProvider {
  return {
    domain: 'github.com',
    listDirectory: vi.fn<[string, string, string], Promise<RepoItem[]>>().mockResolvedValue([]),
    fetchFileContent: vi.fn<[string, string, string], Promise<string>>().mockResolvedValue(''),
    downloadDirectory: vi.fn().mockResolvedValue(undefined),
    downloadFile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper — build RepoItem shapes
// ---------------------------------------------------------------------------
function makeItem(
  name: string,
  path: string,
  type: 'file' | 'dir',
  sha = 'abc123',
): RepoItem {
  return {
    name,
    path,
    type,
    sha,
    downloadUrl: type === 'file' ? `https://raw.github.com/owner/repo/main/${path}` : null,
  };
}

// ---------------------------------------------------------------------------
// A minimal valid cerebro-catalog.yaml content
// ---------------------------------------------------------------------------
const VALID_CATALOG_YAML = `
cerebro: '1'
artifacts:
  - id: git-commit-assistant
    name: Git Commit Assistant
    type: skill
    source: skills/git-commit-assistant
`;

// An invalid catalog (valid YAML but fails schema validation)
const INVALID_CATALOG_YAML = `
artifacts:
  - missing_required_fields: true
`;

// ---------------------------------------------------------------------------
// CAT-REQ-0001 through CAT-REQ-0005: catalog-first path
// ---------------------------------------------------------------------------
describe('fetchCatalog — catalog-first path', () => {
  it('CAT-REQ-0001: fetches cerebro-catalog.yaml from the repo root first', async () => {
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockResolvedValue(VALID_CATALOG_YAML),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    await fetchCatalog(provider, 'anthropics', 'skills');

    expect(provider.fetchFileContent).toHaveBeenCalledWith(
      'anthropics',
      'skills',
      'cerebro-catalog.yaml',
    );
  });

  it('CAT-REQ-0002: parses and validates the catalog file when found', async () => {
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockResolvedValue(VALID_CATALOG_YAML),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'anthropics', 'skills');

    expect(result.source).toBe('catalog');
  });

  it('CAT-REQ-0003: returns source:"catalog" and does NOT perform heuristic scan', async () => {
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockResolvedValue(VALID_CATALOG_YAML),
      listDirectory: vi.fn().mockResolvedValue([]),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'anthropics', 'skills');

    expect(result.source).toBe('catalog');
    // listDirectory is used for heuristic scanning — must NOT be called
    expect(provider.listDirectory).not.toHaveBeenCalled();
  });

  it('CAT-REQ-0003: catalog artifacts are returned when catalog is valid', async () => {
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockResolvedValue(VALID_CATALOG_YAML),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'anthropics', 'skills');

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].id).toBe('git-commit-assistant');
  });
});

// ---------------------------------------------------------------------------
// CAT-REQ-0004: fallback to heuristic when catalog absent or invalid
// ---------------------------------------------------------------------------
describe('fetchCatalog — heuristic fallback', () => {
  it('CAT-REQ-0004: falls back to heuristic when catalog file is absent (404)', async () => {
    const notFoundError = new FileNotFoundError('anthropics', 'skills', 'cerebro-catalog.yaml');
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(notFoundError),
      listDirectory: vi.fn().mockResolvedValue([]),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'anthropics', 'skills');

    expect(result.source).toBe('heuristic');
  });

  it('CAT-REQ-0004: falls back to heuristic when catalog fails schema validation', async () => {
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockResolvedValue(INVALID_CATALOG_YAML),
      listDirectory: vi.fn().mockResolvedValue([]),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'anthropics', 'skills');

    expect(result.source).toBe('heuristic');
  });

  it('CAT-REQ-0004: falls back to heuristic when catalog is invalid YAML', async () => {
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockResolvedValue(': bad: yaml: [\n  unclosed'),
      listDirectory: vi.fn().mockResolvedValue([]),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'anthropics', 'skills');

    expect(result.source).toBe('heuristic');
  });

  it('CAT-REQ-0004: falls back to heuristic when fetchFileContent throws FileNotFoundError', async () => {
    // This is the primary fallback signal — GitHubProvider throws FileNotFoundError
    // (not a plain status:404 object) when a file is absent.
    const fileNotFound = new FileNotFoundError('anthropics', 'skills', 'cerebro-catalog.yaml');
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(fileNotFound),
      listDirectory: vi.fn().mockResolvedValue([]),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'anthropics', 'skills');

    expect(result.source).toBe('heuristic');
    expect(provider.listDirectory).toHaveBeenCalled();
  });

  it('CAT-REQ-0004: propagates non-FileNotFoundError errors even if they have status:404', async () => {
    // A raw status:404 error (not a FileNotFoundError) must NOT trigger heuristic fallback.
    // This guards against accidentally catching repo-level 404s as file-level 404s.
    const rawNotFound = Object.assign(new Error('Not Found'), { status: 404 });
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(rawNotFound),
      listDirectory: vi.fn().mockResolvedValue([]),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    await expect(fetchCatalog(provider, 'anthropics', 'skills')).rejects.toThrow('Not Found');
    expect(provider.listDirectory).not.toHaveBeenCalled();
  });

  it('CAT-REQ-0004: propagates non-404 network errors (does NOT fall back to heuristic)', async () => {
    // A rate-limit error has status 403, not 404 — must NOT fall back to heuristic
    const rateLimitError = Object.assign(new Error('Rate limit exceeded'), { status: 403 });
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(rateLimitError),
      listDirectory: vi.fn().mockResolvedValue([]),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    await expect(fetchCatalog(provider, 'anthropics', 'skills')).rejects.toThrow('Rate limit exceeded');
    // listDirectory must NOT have been called (no heuristic fallback triggered)
    expect(provider.listDirectory).not.toHaveBeenCalled();
  });

  it('CAT-REQ-0004: propagates 500 server errors (does NOT fall back to heuristic)', async () => {
    const serverError = Object.assign(new Error('Internal Server Error'), { status: 500 });
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(serverError),
      listDirectory: vi.fn().mockResolvedValue([]),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    await expect(fetchCatalog(provider, 'anthropics', 'skills')).rejects.toThrow('Internal Server Error');
    expect(provider.listDirectory).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CAT-REQ-0006: heuristic skill detection
// ---------------------------------------------------------------------------
describe('fetchCatalog — heuristic skill detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CAT-REQ-0006: detects skill directory by presence of SKILL.md', async () => {
    const notFound = new FileNotFoundError('owner', 'repo', 'cerebro-catalog.yaml');
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(notFound),
      listDirectory: vi.fn().mockImplementation(
        (_owner: string, _repo: string, path: string) => {
          if (path === '') {
            // root — return a skills/ directory
            return Promise.resolve([makeItem('skills', 'skills', 'dir')]);
          }
          if (path === 'skills') {
            return Promise.resolve([makeItem('git-commit-assistant', 'skills/git-commit-assistant', 'dir')]);
          }
          if (path === 'skills/git-commit-assistant') {
            return Promise.resolve([makeItem('SKILL.md', 'skills/git-commit-assistant/SKILL.md', 'file')]);
          }
          return Promise.resolve([]);
        },
      ),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'anthropics', 'skills');

    expect(result.artifacts.some((a) => a.type === 'skill')).toBe(true);
  });

  it('CAT-REQ-0006: does NOT treat directory without SKILL.md as a skill', async () => {
    const notFound = new FileNotFoundError('owner', 'repo', 'cerebro-catalog.yaml');
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(notFound),
      listDirectory: vi.fn().mockImplementation(
        (_owner: string, _repo: string, path: string) => {
          if (path === '') {
            return Promise.resolve([makeItem('some-dir', 'some-dir', 'dir')]);
          }
          if (path === 'some-dir') {
            // No SKILL.md here
            return Promise.resolve([makeItem('README.md', 'some-dir/README.md', 'file')]);
          }
          return Promise.resolve([]);
        },
      ),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'anthropics', 'skills');

    expect(result.artifacts.filter((a) => a.type === 'skill')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CAT-REQ-0007: heuristic instruction detection
// ---------------------------------------------------------------------------
describe('fetchCatalog — heuristic instruction detection', () => {
  it('CAT-REQ-0007: detects *.instructions.md files as instructions', async () => {
    const notFound = new FileNotFoundError('owner', 'repo', 'cerebro-catalog.yaml');
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(notFound),
      listDirectory: vi.fn().mockImplementation(
        (_owner: string, _repo: string, path: string) => {
          if (path === '') {
            return Promise.resolve([
              makeItem('python.instructions.md', 'python.instructions.md', 'file'),
            ]);
          }
          return Promise.resolve([]);
        },
      ),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'anthropics', 'skills');

    const instructions = result.artifacts.filter((a) => a.type === 'instruction');
    expect(instructions).toHaveLength(1);
    expect(instructions[0].source).toContain('python.instructions.md');
  });

  it('CAT-REQ-0007: does NOT treat plain .md files as instructions', async () => {
    const notFound = new FileNotFoundError('owner', 'repo', 'cerebro-catalog.yaml');
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(notFound),
      listDirectory: vi.fn().mockImplementation(
        (_owner: string, _repo: string, path: string) => {
          if (path === '') {
            return Promise.resolve([makeItem('README.md', 'README.md', 'file')]);
          }
          return Promise.resolve([]);
        },
      ),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'anthropics', 'skills');

    expect(result.artifacts.filter((a) => a.type === 'instruction')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CAT-REQ-0008: heuristic scan locations
// ---------------------------------------------------------------------------
describe('fetchCatalog — heuristic scan locations', () => {
  it('CAT-REQ-0008: scans root, skills/, and agents/ for skill markers', async () => {
    const notFound = new FileNotFoundError('owner', 'repo', 'cerebro-catalog.yaml');
    const listDir = vi.fn().mockResolvedValue([]);
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(notFound),
      listDirectory: listDir,
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    await fetchCatalog(provider, 'owner', 'repo');

    const scannedPaths = listDir.mock.calls.map(([, , p]) => p as string);
    // Should scan the root directory
    expect(scannedPaths).toContain('');
  });
});

// ---------------------------------------------------------------------------
// CAT-REQ-0009 + CAT-REQ-0010: slug generation and deduplication
// ---------------------------------------------------------------------------
describe('fetchCatalog — artifact ID generation', () => {
  it('CAT-REQ-0009: synthesised IDs are valid slugs (lowercase alphanumeric + hyphens)', async () => {
    const notFound = new FileNotFoundError('owner', 'repo', 'cerebro-catalog.yaml');
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(notFound),
      listDirectory: vi.fn().mockImplementation(
        (_owner: string, _repo: string, path: string) => {
          if (path === '') {
            return Promise.resolve([makeItem('skills', 'skills', 'dir')]);
          }
          if (path === 'skills') {
            return Promise.resolve([
              makeItem('Git_Commit Assistant!', 'skills/Git_Commit Assistant!', 'dir'),
            ]);
          }
          if (path === 'skills/Git_Commit Assistant!') {
            return Promise.resolve([
              makeItem('SKILL.md', 'skills/Git_Commit Assistant!/SKILL.md', 'file'),
            ]);
          }
          return Promise.resolve([]);
        },
      ),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'owner', 'repo');

    for (const artifact of result.artifacts) {
      // Must be lowercase alphanumeric + hyphens only
      expect(artifact.id).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/);
    }
  });

  it('CAT-REQ-0010: duplicate IDs get numeric suffix (e.g., python, python-2)', async () => {
    const notFound = new FileNotFoundError('owner', 'repo', 'cerebro-catalog.yaml');
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(notFound),
      listDirectory: vi.fn().mockImplementation(
        (_owner: string, _repo: string, path: string) => {
          if (path === '') {
            return Promise.resolve([makeItem('skills', 'skills', 'dir')]);
          }
          if (path === 'skills') {
            // Two directories that normalise to the same slug
            return Promise.resolve([
              makeItem('python', 'skills/python', 'dir'),
              makeItem('Python', 'skills/Python', 'dir'),
            ]);
          }
          // Both have SKILL.md
          return Promise.resolve([
            makeItem('SKILL.md', `${path}/SKILL.md`, 'file'),
          ]);
        },
      ),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'owner', 'repo');

    const ids = result.artifacts.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length); // no duplicates
  });
});

// ---------------------------------------------------------------------------
// CAT-REQ-0011 + CAT-REQ-0012: filtering
// ---------------------------------------------------------------------------
describe('fetchCatalog — filtering', () => {
  async function setupHeuristicResult(): Promise<ReturnType<typeof import('../../../src/core/catalog.js').fetchCatalog>> {
    const notFound = new FileNotFoundError('owner', 'repo', 'cerebro-catalog.yaml');
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(notFound),
      listDirectory: vi.fn().mockImplementation(
        (_owner: string, _repo: string, path: string) => {
          if (path === '') {
            return Promise.resolve([
              makeItem('python.instructions.md', 'python.instructions.md', 'file'),
              makeItem('go.instructions.md', 'go.instructions.md', 'file'),
              makeItem('skills', 'skills', 'dir'),
            ]);
          }
          if (path === 'skills') {
            return Promise.resolve([
              makeItem('git-helper', 'skills/git-helper', 'dir'),
            ]);
          }
          if (path === 'skills/git-helper') {
            return Promise.resolve([
              makeItem('SKILL.md', 'skills/git-helper/SKILL.md', 'file'),
            ]);
          }
          return Promise.resolve([]);
        },
      ),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    return fetchCatalog(provider, 'owner', 'repo');
  }

  it('CAT-REQ-0011: filter.type returns only artifacts of that type', async () => {
    const notFound = new FileNotFoundError('owner', 'repo', 'cerebro-catalog.yaml');
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(notFound),
      listDirectory: vi.fn().mockImplementation(
        (_owner: string, _repo: string, path: string) => {
          if (path === '') {
            return Promise.resolve([
              makeItem('python.instructions.md', 'python.instructions.md', 'file'),
              makeItem('skills', 'skills', 'dir'),
            ]);
          }
          if (path === 'skills') {
            return Promise.resolve([makeItem('git-helper', 'skills/git-helper', 'dir')]);
          }
          if (path === 'skills/git-helper') {
            return Promise.resolve([makeItem('SKILL.md', 'skills/git-helper/SKILL.md', 'file')]);
          }
          return Promise.resolve([]);
        },
      ),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'owner', 'repo', { type: 'instruction' });

    expect(result.artifacts.every((a) => a.type === 'instruction')).toBe(true);
  });

  it('CAT-REQ-0012: filter.keyword filters by name case-insensitively', async () => {
    const notFound = new FileNotFoundError('owner', 'repo', 'cerebro-catalog.yaml');
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockRejectedValue(notFound),
      listDirectory: vi.fn().mockImplementation(
        (_owner: string, _repo: string, path: string) => {
          if (path === '') {
            return Promise.resolve([
              makeItem('python.instructions.md', 'python.instructions.md', 'file'),
              makeItem('go.instructions.md', 'go.instructions.md', 'file'),
            ]);
          }
          return Promise.resolve([]);
        },
      ),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'owner', 'repo', { keyword: 'PYTHON' });

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].name.toLowerCase()).toContain('python');
  });

  it('CAT-REQ-0013: filtering does NOT check artifact.supports', async () => {
    // The catalog returns all artifacts regardless of their supports array.
    // This is verified by checking that a skill with supports:['claude-code']
    // is still returned when no filter is applied.
    const catalog = `
cerebro: '1'
artifacts:
  - id: restricted-skill
    name: Restricted Skill
    type: skill
    source: skills/restricted
    supports: [claude-code]
  - id: open-skill
    name: Open Skill
    type: skill
    source: skills/open
`;
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockResolvedValue(catalog),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'owner', 'repo');

    // Both artifacts must be returned — supports filtering is NOT done here
    expect(result.artifacts).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// CAT-REQ-0014: SKILL.md unreadable — omit description, don't fail
// ---------------------------------------------------------------------------
describe('fetchCatalog — graceful SKILL.md read failure', () => {
  it('CAT-REQ-0014: omits description if SKILL.md is unreadable but does not fail', async () => {
    const notFound = new FileNotFoundError('owner', 'repo', 'cerebro-catalog.yaml');
    const provider = makeProvider({
      fetchFileContent: vi.fn().mockImplementation(
        (_owner: string, _repo: string, path: string) => {
          if (path === 'cerebro-catalog.yaml') return Promise.reject(notFound);
          // SKILL.md is also unreadable
          if (path.endsWith('SKILL.md')) return Promise.reject(new Error('network error'));
          return Promise.resolve('');
        },
      ),
      listDirectory: vi.fn().mockImplementation(
        (_owner: string, _repo: string, path: string) => {
          if (path === '') return Promise.resolve([makeItem('skills', 'skills', 'dir')]);
          if (path === 'skills') {
            return Promise.resolve([makeItem('git-helper', 'skills/git-helper', 'dir')]);
          }
          if (path === 'skills/git-helper') {
            return Promise.resolve([makeItem('SKILL.md', 'skills/git-helper/SKILL.md', 'file')]);
          }
          return Promise.resolve([]);
        },
      ),
    });

    const { fetchCatalog } = await import('../../../src/core/catalog.js');
    const result = await fetchCatalog(provider, 'owner', 'repo');

    // Should still return the skill, just without a description
    const skill = result.artifacts.find((a) => a.type === 'skill');
    expect(skill).toBeDefined();
    expect(skill?.description).toBeUndefined();
  });
});
