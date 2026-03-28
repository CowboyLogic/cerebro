# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Cerebro is a cross-platform CLI tool that discovers and installs AI components (skills, agents, prompts, instructions, snippets, workflows) from GitHub repositories into IDEs. Supported targets: Claude Code, VS Code (Copilot), OpenCode, and Copilot CLI.

## Commands

All commands must be run from the project root:

```bash
npm start              # Run interactive mode (tsx src/index.ts)
npm run dev            # Watch mode
npm run build          # Compile TypeScript to dist/

npm test               # Run all tests (173+), must pass before any PR
npm run test:unit      # Unit tests only
npm run test:integration  # Integration tests only
npm run test:cli       # CLI end-to-end tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report (thresholds: 75% lines/functions, 70% branches)
```

Run a single test file: `npx vitest run tests/unit/core/registry.test.ts`

## Architecture

**Data flow:** CLI entry → interactive wizard → component discovery → GitHub fetch → target installer → file placement.

Three core pipelines:

1. **Discovery** (`src/core/registry.ts`): Loads `cerebro.json` manifest from repo root. Falls back to heuristic tree-walking (directory markers like `SKILL.md`, `agent.yaml`, or flat collections in `skills/`, `agents/`, etc.).

2. **Installation** (`src/core/installer.ts`): Orchestrates fetching file contents from GitHub and delegates to the appropriate target installer.

3. **Target installers** (`src/targets/*.ts`): Each IDE target extends `BaseInstaller` which enforces path confinement via `assertConfined()`. Targets handle IDE-specific file placement, naming, and content transformation (e.g., VS Code appends to `copilot-instructions.md`, Claude Code writes to `skills/<name>/`).

The interactive wizard (`src/ui/interactive.ts`) is a 5-step state machine: repo selection → component discovery → IDE target → scope (user/workspace) → confirm & install.

## Security — Three Non-Negotiable Layers

1. **Input validation** (`src/core/github.ts` → `validateGitHubIdentifiers()`): Regex-checks owner/repo before any network call.
2. **Name sanitization** (`src/core/registry.ts` → `sanitizeName()`): Strips `..`, path separators, non-printable chars from component names.
3. **Path confinement** (`src/targets/base.ts` → `assertConfined()`): `path.resolve()` on every write target; throws if it escapes the install directory.

Any new code that writes files, calls external APIs, or processes remote input must follow this pattern.

## Coding Conventions

- **Node.js imports** use `node:` prefix: `import fs from 'node:fs'`
- **ESM extensions** required on all imports: `import { foo } from './bar.js'`
- **`const enum` is banned** — tsx/esbuild doesn't inline them. Use `const obj = { ... } as const`
- **Entry-point guard**: `if (!process.env.VITEST)` gates `program.parseAsync()` in `src/index.ts`
- **New IDE targets** must extend `BaseInstaller` and call `assertConfined()` before every `writeFileSync`
- **Platform paths**: Use `getUserConfigDir()` from `src/utils/platform.ts` for cross-platform config directories

## Test Conventions

- Mock `node:fs` and platform utilities via `vi.mock(...)` at the top of each test file
- Use `makeComponent()` from `tests/__fixtures__/tree-responses.ts` for test data
- Integration tests use `memfs` for in-memory file I/O
- Do not mock the GitHub API in integration tests — use fixtures or recorded responses
- Coverage excludes `src/index.ts` and `src/ui/interactive.ts`

## Key Types (src/core/types.ts)

- `ComponentType`: `'skill' | 'agent' | 'prompt' | 'instruction' | 'snippet' | 'workflow' | 'unknown'`
- `TargetIDE`: `'claude-code' | 'opencode' | 'vscode' | 'copilot'`
- `Scope`: `'user' | 'workspace'`
- `RepoSource`: `{ owner, repo, branch?, path? }`
