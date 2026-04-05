# cerebro-cli

The Cerebro CLI application. Discovers and installs AI components (skills, agents, prompts, instructions, snippets, workflows) from GitHub repositories into IDEs.

For a user-facing overview, installation instructions, and usage examples see the [repository README](../README.md).

---

## Developer Setup

**Requirements**: Node.js 18+, npm 9+

```bash
cd cerebro-cli

# Install dependencies
npm install

# Run from TypeScript source (no build step needed)
npm start

# Watch mode (restarts on file change)
npm run dev

# Type-check without emitting
npx tsc --noEmit

# Compile to dist/
npm run build
```

---

## Testing

```bash
# Run all tests (must pass before any commit)
npm test

# Run subsets
npm run test:unit
npm run test:integration
npm run test:cli

# Watch mode
npm run test:watch

# Coverage report (thresholds: 75% lines/functions, 70% branches)
npm run test:coverage

# Run a single file
npx vitest run tests/unit/core/registry.test.ts
```

---

## Project Structure

```
cerebro-cli/
├── src/
│   ├── index.ts              CLI entry point (Commander)
│   ├── core/
│   │   ├── types.ts          Shared types and constants
│   │   ├── github.ts         GitHub API client (tree, file fetch, URL parsing)
│   │   ├── registry.ts       Component discovery (manifest + heuristic)
│   │   ├── installer.ts      Orchestrates install across targets
│   │   └── settings.ts       Persistent user settings
│   ├── targets/
│   │   ├── base.ts           Abstract BaseInstaller (dry-run, path confinement)
│   │   ├── claude-code.ts    Claude Code installer (~/.claude/)
│   │   ├── opencode.ts       OpenCode installer (~/.opencode/)
│   │   ├── vscode.ts         VS Code installer (.vscode/)
│   │   ├── copilot.ts        Copilot CLI installer (~/.copilot/ / .github/)
│   │   └── index.ts          Installer registry
│   ├── ui/
│   │   └── interactive.ts    5-step TUI wizard (@clack/prompts)
│   └── utils/
│       ├── platform.ts       OS detection, getUserConfigDir()
│       ├── paths.ts          IDE path resolution, findWorkspaceRoot()
│       ├── theme.ts          Terminal colours and layout (chalk)
│       └── logger.ts         Debug file logger (inactive unless --debug)
└── tests/
    ├── unit/                 Fast, fs-mocked unit tests
    ├── integration/          In-memory file I/O tests (memfs)
    ├── cli/                  End-to-end CLI invocation tests
    └── __fixtures__/         Shared test helpers (makeComponent, tree responses)
```

---

## Architecture

**Data flow:** CLI entry → interactive wizard or direct command → component discovery → GitHub fetch → target installer → file placement.

### Component Discovery

`src/core/catalog.ts` attempts to fetch and validate `cerebro-catalog.yaml` from the repo root (validated by `validateCatalog()` from `@cowboylogic/cerebro-schema`). If the file is absent or invalid it falls back to heuristic tree-walking: directory-marker files (`SKILL.md`, `agent.yaml`, …) and flat collection directories (`skills/`, `agents/`, `prompts/`, …). A non-404 fetch error propagates; only 404 triggers the heuristic fallback.

### Installation

`src/core/installer.ts` fetches file contents from GitHub and delegates to the appropriate target installer. Each installer extends `BaseInstaller`, which handles file writes, dry-run logic, and error recording.

### Target Installers

Each IDE has its own class in `src/targets/`. To add a new target:

1. Create `src/targets/<name>.ts` extending `BaseInstaller`.
2. Implement `getInstallDir()`, `getTargetFileName()`, and `transformContent()`.
3. Call `BaseInstaller.assertConfined()` before every file write.
4. Register it in `src/targets/index.ts`.
5. Add a full unit test file in `tests/unit/targets/`.

---

## Security

Three non-negotiable defence layers must be maintained:

| Layer | Location | What it does |
|---|---|---|
| Input validation | `src/core/github.ts` → `validateGitHubIdentifiers()` | Rejects owner/repo strings that don't conform to GitHub naming rules |
| Name sanitization | `src/core/registry.ts` → `sanitizeName()` | Strips `..`, path separators, and non-printable chars from component names |
| Path confinement | `src/targets/base.ts` → `assertConfined()` | Throws if a resolved write path escapes the install directory |

Any new code that writes files, calls external APIs, or processes user/remote input must apply the same pattern.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 18+ (ESM, `"type": "module"`) |
| Language | TypeScript 5.x |
| Dev execution | `tsx` (esbuild-based, no build step needed) |
| CLI framework | Commander v13 |
| Prompts | `@clack/prompts` |
| Styling | chalk v5 |
| HTTP | Node.js built-in `node:https` (no external HTTP lib) |
| Test runner | Vitest 4.x |

---

## Coding Conventions

- Node built-ins use the `node:` prefix: `import fs from 'node:fs'`
- All imports use `.js` extensions (ESM requirement, resolved to `.ts` by `tsx`)
- `const enum` is **banned** — `tsx`/esbuild does not inline them; use `const obj = { ... } as const`
- Entry-point guard: `if (!process.env.VITEST)` gates `program.parseAsync()` in `src/index.ts`
- Use `getUserConfigDir()` from `src/utils/platform.ts` for all config directory paths

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full contributor guide.
