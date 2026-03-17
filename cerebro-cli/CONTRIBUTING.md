# Contributing to Cerebro

Thank you for your interest in contributing. This document covers everything a developer needs to get started: project setup, architecture, testing, and the conventions used throughout the codebase.

---

## Prerequisites

- **Node.js 18+**
- **npm 9+**
- **TypeScript** (installed as a dev dependency — no global install needed)

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/CowboyLogic/cerebroer.git
cd cerebroer

# Install dependencies
npm install

# Run in development (TypeScript source, no build step)
npm start

# Type-check without emitting
npx tsc --noEmit
```

---

## Project Structure

```
src/
├── index.ts              CLI entry point (commander) — exports `program` for testability
├── ui/
│   └── interactive.ts    Interactive TUI built on @clack/prompts
├── core/
│   ├── types.ts          Shared types, constants (IDE_DISPLAY_NAMES, DEFAULT_REPOS)
│   ├── github.ts         GitHub API — tree, raw file fetching, parseRepoUrl
│   ├── registry.ts       Auto-discovers components from a repo's file tree
│   └── installer.ts      Orchestrates install: fetches file contents, delegates to target
├── targets/
│   ├── base.ts           Abstract BaseInstaller — handles dry-run, error recording, file writes
│   ├── claude-code.ts    Claude Code installer (~/.claude/)
│   ├── opencode.ts       OpenCode installer (<configDir>/opencode/)
│   ├── vscode.ts         VS Code installer (.vscode/)
│   ├── copilot.ts        Copilot CLI installer (.github/)
│   └── index.ts          Installer registry — getInstaller(), getAllInstallers()
└── utils/
    ├── platform.ts       OS/platform detection, getUserConfigDir()
    ├── paths.ts          IDE path resolution, findWorkspaceRoot(), ensureDir()
    └── theme.ts          Terminal colors, icons, and layout helpers (chalk)
```

### Key design decisions

- **No build step**: TypeScript is run directly via `tsx`. There is no `dist/` folder.
- **Pure Node.js HTTP**: GitHub API calls use `node:https` directly (no axios or fetch) to keep the dependency footprint small.
- **ESM modules**: The project uses `"type": "module"` throughout. All imports use `.js` extensions (resolved to `.ts` at runtime by `tsx`).
- **Installer pattern**: Each IDE has its own class extending `BaseInstaller`. Override `getInstallDir`, `getTargetFileName`, and optionally `transformContent` to implement IDE-specific behavior. The base class handles file writes, dry-run logic, and error recording.

---

## Running Tests

The test suite uses [Vitest](https://vitest.dev/) with native ESM support.

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file change)
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run a specific subset
npm run test:unit
npm run test:integration
npm run test:cli
```

### Test layout

```
tests/
├── __fixtures__/
│   └── tree-responses.ts   Factory helpers: makeComponent(), makeSource(), makeTreeResponse()
│                           Sample content: SAMPLE_SKILL_MD, SAMPLE_AGENT_MD, etc.
├── __mocks__/
│   └── node-https.ts       Manual mock for node:https — seedResponse(url, status, body)
├── setup.ts                Global beforeEach/afterEach: env isolation, vi.unstubAllEnvs()
├── unit/
│   ├── core/               github, registry, installer, types
│   ├── targets/            base, claude-code, opencode, vscode, copilot, index
│   └── utils/              platform, paths, theme
├── integration/
│   ├── discovery-flow.ts   Full discover → parse → enrich pipeline
│   ├── install-flow.ts     Full install path (component → write)
│   └── multi-install.ts    Batch install behavior
└── cli/
    ├── install-command.ts
    ├── browse-command.ts
    └── targets-command.ts
```

### Mocking conventions

**`node:https`** — All network calls are intercepted by the manual mock in `tests/__mocks__/node-https.ts`. Seed responses before each test:

```typescript
seedResponse('api.github.com/repos/owner/repo/git/trees/main', 200, JSON.stringify(tree));
seedResponse('raw.githubusercontent.com/owner/repo/main', 200, '# Content');
clearResponses(); // called in beforeEach
```

The mock matches URLs by substring, so you only need to include the distinctive part of the URL.

**`node:fs`** — Source files use `import fs from 'node:fs'` (default import). Mock both the default and named exports, and use `vi.hoisted()` so the mock references are available inside the `vi.mock()` factory:

```typescript
const { mockWriteFileSync, mockReadFileSync } = vi.hoisted(() => ({
  mockWriteFileSync: vi.fn(),
  mockReadFileSync: vi.fn(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }),
}));

vi.mock('node:fs', () => ({
  default: { writeFileSync: mockWriteFileSync, readFileSync: mockReadFileSync },
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
}));
```

**Environment variables** — Use `vi.stubEnv()` (automatically restored by `vi.unstubAllEnvs()` in `setup.ts`):

```typescript
vi.stubEnv('GITHUB_TOKEN', 'my-test-token');
```

---

## Adding a New IDE Target

1. **Create `src/targets/<name>.ts`** extending `BaseInstaller`:

```typescript
import { BaseInstaller } from './base.js';
import { InstallOptions } from '../core/types.js';

export class MyIDEInstaller extends BaseInstaller {
  get name() { return 'My IDE'; }

  getInstallDir(opts: InstallOptions): string {
    // Return the directory where files should be written
  }

  getTargetFileName(sourceFileName: string, opts: InstallOptions): string {
    // Map source filename → destination filename (override for renaming)
    return sourceFileName;
  }

  transformContent(content: string, opts: InstallOptions): string {
    // Optionally transform file content before writing
    return content;
  }
}
```

2. **Register it in `src/targets/index.ts`** — add your IDE key to the map returned by `getInstaller` and `getAllInstallers`.

3. **Add the IDE key and display name to `src/core/types.ts`** — extend the `TargetIDE` union type and `IDE_DISPLAY_NAMES` map.

4. **Write tests** in `tests/unit/targets/<name>.test.ts` following the patterns in the existing target tests.

---

## Code Conventions

- **Formatting**: 2-space indentation, single quotes for strings, no semicolons are *not* enforced by a linter — just match the style of surrounding code.
- **No barrel exports**: Import directly from the file containing the symbol.
- **Types first**: Add types to `src/core/types.ts` if they are shared across modules.
- **Error handling**: Installers should catch errors per-file and record them in `result.errors` rather than throwing — this lets batch installs continue even if one file fails.
- **No side effects at module level**: Keep all logic inside functions so modules can be imported safely in tests without triggering network or filesystem calls.

---

## Submitting Changes

1. Fork the repository and create a feature branch from `main`.
2. Make your changes with focused, atomic commits.
3. Ensure all tests pass: `npm test`
4. Open a pull request against `main` with a clear description of what changed and why.
