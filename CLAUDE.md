# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Cerebro is a cross-platform CLI tool that discovers and installs AI artifacts (skills, instructions, agents, prompts, snippets, workflows) from GitHub repositories into AI-enabled IDEs and tools. Supported targets (MVP): Claude Code, GitHub Copilot (VS Code), and the `.agents` standard.

## Commands

All commands must be run from the project root:

```bash
npm start              # Run TUI mode (tsx src/index.ts)
npm run dev            # Watch mode
npm run build          # Compile TypeScript to dist/

npm test               # Run all tests (280+), must pass before any PR
npm run test:unit      # Unit tests only
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report (thresholds: 75% lines/functions, 70% branches)
```

Run a single test file: `npx vitest run tests/unit/core/config.test.ts`

## Architecture

**Three execution modes, one core engine.**

All modes call into `src/core/` exclusively. No business logic lives in `src/tui/`, `src/cli/`, or `src/mcp/`.

```text
src/index.ts          ← entry point; detects --mcp before Commander runs
├── src/tui/          ← TUI mode  (cerebro, no args) — Ink-based interactive UI
├── src/cli/          ← CLI mode  (cerebro install …) — parameterised, scriptable
├── src/mcp/          ← MCP mode  (cerebro --mcp)    — stdio JSON-RPC server
└── src/core/         ← shared engine (all modes delegate here)
    ├── config.ts     SPEC-0001 — config manager (~/.config/cerebro/config.yaml)
    ├── manifest.ts   SPEC-0002 — install manifest (~/.config/cerebro/installed.yaml)
    ├── provider.ts   SPEC-0003 — SourceProvider interface + GitHubProvider
    ├── session.ts    SPEC-0004 — createSession() entry point for all modes
    ├── catalog.ts    SPEC-0005 — catalog-first + heuristic-fallback discovery
    └── installer.ts  SPEC-0006 — installArtifact() orchestration
```

### Mode detection

`src/index.ts` checks for `--mcp` **before** Commander initialises. Commander writes help/errors to stdout — if it ran first it would corrupt the JSON-RPC stream.

### Core entry point

`createSession()` (`src/core/session.ts`) is the shared entry point for all three modes. Call it first; everything else flows from the session object it returns.

### Discovery (SPEC-0005)

`fetchCatalog()` attempts to load and validate `cerebro-catalog.yaml` from the repo root (schema from `@cowboylogic/cerebro-schema`). Falls back to heuristic tree-walking when the file is absent or invalid.

### Installation (SPEC-0006)

`installArtifact()` **never throws** — always returns an `InstallOutcome`. Callers check `outcome.status`, never try/catch.

### Provider abstraction (SPEC-0003)

`createProvider(url)` detects the provider from the URL domain. MVP ships `GitHubProvider`. No module outside `provider.ts` has knowledge of GitHub-specific APIs. Adding a new host (GitLab, Bitbucket) means implementing `SourceProvider` and registering the domain — zero changes to catalog, installer, session, TUI, CLI, or MCP.

### Config and manifest paths

- Config: `~/.config/cerebro/config.yaml` (created from bundled defaults on first run)
- Manifest: `~/.config/cerebro/installed.yaml`

## Security — Three Non-Negotiable Layers

1. **Input validation** (`src/core/provider.ts` → `parseRepoUrl()` / `validateGitHubIdentifiers()`): Regex-checks owner/repo before any network call.
2. **Name sanitization** (`src/core/catalog.ts`): Strips `..`, path separators, and non-printable characters from artifact names and paths.
3. **Path confinement** (`src/core/installer.ts` → `assertConfined()`): `path.resolve()` on every write target; throws if it escapes the install base directory.

Any new code that writes files, calls external APIs, or processes remote input must follow this pattern.

**MCP stdout rule (MCP-REQ-0003 / MCP-REQ-0014):** Core modules MUST NOT write to `stdout` under any circumstances. `stdout` is reserved for the JSON-RPC stream in MCP mode. All diagnostic output must use `stderr` (`console.error`) or be suppressed.

## Coding Conventions

- **Node.js imports** use `node:` prefix: `import fs from 'node:fs'`
- **ESM extensions** required on all imports: `import { foo } from './bar.js'`
- **`const enum` is banned** — tsx/esbuild doesn't inline them. Use `const obj = { ... } as const`
- **Entry-point guard**: `if (!process.env.VITEST)` gates `program.parseAsync()` in `src/index.ts`
- **Platform paths**: Use `getUserConfigDir()` from `src/utils/platform.ts` for cross-platform config directories
- **Types from schema**: `ArtifactType`, `ToolId`, `Scope`, `Artifact` all come from `@cowboylogic/cerebro-schema`. Do not re-declare them locally.

### TUI conventions (CLI-0002)

The TUI uses a centralized state machine. These rules are non-negotiable:

- **`screens.tsx` components MUST NOT call `useInput`** — keyboard handling belongs exclusively in `app.tsx` via a single `useInput` that dispatches to `handleKey()` in `transitions.ts`.
- **`screens.tsx` components MUST NOT call `useState` for cursor or navigation state** — all cursor positions, active screen, filter text, and sub-screen stages live in `TuiState` (`types.ts`).
- **`transitions.ts` MUST have no Ink import** — it is a pure TypeScript module: `handleKey(state: TuiState, key: KeyEvent): TuiState`. No JSX, no side effects.
- **All navigation logic lives in `transitions.ts`** — screen transitions, cursor movement, filter clearing, sub-screen stage changes. If it changes `TuiState`, it belongs here.
- Screen components are pure render functions: given props in, JSX out.

Verify compliance at any time:

```bash
grep -r "useInput" src/tui/        # must return only app.tsx
grep "useState" src/tui/screens.tsx  # must return zero results
```

**Why:** Distributed `useInput` in screen components makes navigation logic untestable without Ink's async event system. The centralized model makes every navigation requirement in SPEC-0007 testable as a plain synchronous call to `handleKey()`. See `docs/adr/CLI-0002-tui-centralized-state-machine.md` for full rationale.

## Test Conventions

- Mock `node:fs` and platform utilities via `vi.mock(...)` at the top of each test file
- All tests are in `tests/unit/` — no separate integration or CLI test categories
- Test files mirror source structure: `tests/unit/core/`, `tests/unit/cli/`, `tests/unit/tui/`, `tests/unit/mcp/`
- Each test references the requirement ID it covers (e.g. `// TUI-REQ-0007`)
- Coverage excludes `src/index.ts`
- **Ink keyboard testing caveat**: Escape key uses `setImmediate` internally — cannot be tested synchronously. Arrow key navigation requires React `act()` to flush batch updates.

## Key Types

All core types come from `@cowboylogic/cerebro-schema`:

- `ArtifactType`: `'skill' | 'instruction' | 'prompt' | 'agent' | 'hook' | 'mcp-server' | 'snippet' | 'workflow' | 'other'`
- `ToolId`: `'claude-code' | 'copilot' | 'agents' | 'cursor' | 'windsurf' | 'opencode'`
- `Scope`: `'workspace' | 'user'`
- `Artifact`: `{ id, name, type, source, description?, version?, tags?, supports? }`

CLI-local types (in `src/core/config.ts`):

- `SourceEntry`: `{ name, url, enabled, trusted }`
- `CerebroConfig`: full config structure, mirrors `config.yaml`

## Keeping This File Current

This file is a living document. Update it — in the same PR as the code change — whenever:

- Architecture patterns change (new modules, renamed abstractions, removed layers)
- Conventions are added or revised (imports, guards, naming rules)
- Key types, entry points, or security rules change
- Test setup or structure changes
