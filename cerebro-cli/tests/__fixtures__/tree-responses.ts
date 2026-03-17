import { Component, RepoSource, ComponentType, TargetIDE } from '../../src/core/types.js';

export interface TreeItem {
  path: string;
  type: 'blob' | 'tree';
  sha?: string;
  size?: number;
  url?: string;
  mode?: string;
}

export function makeTreeResponse(items: TreeItem[]) {
  return {
    sha: 'abc123',
    url: 'https://api.github.com/repos/owner/repo/git/trees/main',
    tree: items.map(i => ({
      mode: '100644',
      sha: 'def456',
      url: 'https://api.github.com/repos/owner/repo/git/blobs/def456',
      ...i,
    })),
    truncated: false,
  };
}

export const emptyTree = makeTreeResponse([]);

export const skillsOnlyTree = makeTreeResponse([
  { path: 'skills/my-skill', type: 'tree' },
  { path: 'skills/my-skill/SKILL.md', type: 'blob', size: 512 },
  { path: 'skills/my-skill/README.md', type: 'blob', size: 256 },
  { path: 'skills/other-skill', type: 'tree' },
  { path: 'skills/other-skill/SKILL.md', type: 'blob', size: 300 },
]);

export const mixedComponentTree = makeTreeResponse([
  { path: 'skills/my-skill/SKILL.md', type: 'blob', size: 512 },
  { path: 'agents/reviewer.md', type: 'blob', size: 400 },
  { path: 'agents/planner.md', type: 'blob', size: 350 },
  { path: 'prompts/summarize.md', type: 'blob', size: 200 },
  { path: 'instructions/coding-style.md', type: 'blob', size: 300 },
  { path: '.github/copilot-instructions.md', type: 'blob', size: 150 },
]);

export const copilotInstructionsTree = makeTreeResponse([
  { path: '.github/copilot-instructions.md', type: 'blob', size: 200 },
]);

export const SAMPLE_SKILL_MD = `---
name: my-skill
version: 1.0.0
tags: [typescript, testing]
---

This skill helps you write comprehensive tests for TypeScript projects.

## Usage

Use this skill when writing unit or integration tests.
`;

export const SAMPLE_AGENT_MD = `# Code Reviewer Agent

You are an expert code reviewer. Review code for correctness, style, and security.

## Responsibilities
- Check for bugs and logic errors
- Enforce coding standards
- Identify security vulnerabilities
`;

export const SAMPLE_PROMPT_MD = `Summarize the following text in 3 bullet points, focusing on the key takeaways.`;

export const SAMPLE_INSTRUCTION_MD = `# Coding Instructions

Always write clean, well-documented code.
Follow the existing patterns in the codebase.
`;

export function makeComponent(overrides: Partial<Component> = {}): Component {
  return {
    name: 'test-component',
    type: 'skill' as ComponentType,
    description: 'A test component',
    path: 'skills/test-component',
    files: [
      { path: 'skills/test-component/SKILL.md', name: 'SKILL.md', content: SAMPLE_SKILL_MD, size: 512 },
    ],
    source: { owner: 'test-owner', repo: 'test-repo' },
    compatibleTargets: ['claude-code'] as TargetIDE[],
    ...overrides,
  };
}

export function makeSource(overrides: Partial<RepoSource> = {}): RepoSource {
  return {
    owner: 'test-owner',
    repo: 'test-repo',
    ...overrides,
  };
}
