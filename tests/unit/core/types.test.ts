import { describe, it, expect } from 'vitest';
import { IDE_DISPLAY_NAMES, DEFAULT_REPOS, TargetIDE } from '../../../src/core/types.js';

describe('IDE_DISPLAY_NAMES', () => {
  const targets: TargetIDE[] = ['claude-code', 'opencode', 'vscode', 'copilot'];

  it('has an entry for every TargetIDE', () => {
    for (const t of targets) {
      expect(IDE_DISPLAY_NAMES[t]).toBeTruthy();
    }
  });

  it('display names are non-empty strings', () => {
    for (const name of Object.values(IDE_DISPLAY_NAMES)) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

describe('DEFAULT_REPOS', () => {
  it('has exactly 2 entries', () => {
    expect(DEFAULT_REPOS).toHaveLength(2);
  });

  it('each entry has valid owner and repo fields', () => {
    for (const repo of DEFAULT_REPOS) {
      expect(typeof repo.owner).toBe('string');
      expect(typeof repo.repo).toBe('string');
      expect(repo.owner.length).toBeGreaterThan(0);
      expect(repo.repo.length).toBeGreaterThan(0);
    }
  });

  it('includes github/awesome-copilot', () => {
    expect(DEFAULT_REPOS.some(r => r.owner === 'github' && r.repo === 'awesome-copilot')).toBe(true);
  });

  it('includes anthropics/skills', () => {
    expect(DEFAULT_REPOS.some(r => r.owner === 'anthropics' && r.repo === 'skills')).toBe(true);
  });
});
