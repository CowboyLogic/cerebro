---
name: cerebro-cli-architecture
description: Use this skill when working in the cerebro CLI repo. Covers the three execution modes (TUI, CLI, MCP), core data flow, security layers, target installer pattern, TUI state machine conventions, platform path handling, and key coding rules. Trigger on questions about how the CLI works, where to add a new IDE target, how installation works, how the TUI or MCP server is structured, or how to handle cross-platform paths.
---

# Cerebro CLI Architecture

## Three Execution Modes, One Core Engine

All three modes delegate exclusively to `src/core/`. No business logic lives in `src/tui/`, `src/cli/`, or `src/mcp/`.

```
src/index.ts              ← entry point; detects --mcp before Commander runs
├── src/tui/              ← TUI mode  (cerebro, no args) — Ink 6 + React 19
├── src/cli/              ← CLI mode  (cerebro install …) — Commander v13
├── src/mcp/              ← MCP mode  (cerebro --mcp) — stdio JSON-RPC server
└── src/core/             ← shared engine
    ├── config.ts         SPEC-0001 — config manager (~/.config/cerebro/config.yaml)
    ├── manifest.ts       SPEC-0002 — install manifest (~/.config/cerebro/installed.yaml)
    ├── provider.ts       SPEC-0003 — SourceProvider interface + GitHubProvider
    ├── session.ts        SPEC-0004 — createSession() entry point for all modes
    ├── catalog.ts        SPEC-0005 — catalog-first + heuristic-fallback discovery
    └── installer.ts      SPEC-0006 — installArtifact() orchestration
```

**Mode detection:** `src/index.ts` checks `process.argv` for `--mcp` before Commander initialises — Commander writes to stdout, which would corrupt the JSON-RPC stream.

**Core entry point:** `createSession()` in `src/core/session.ts` is the shared entry point for all three modes. Call it first; everything else flows from the session object it returns.

**`installArtifact()` never throws** — always returns an `InstallOutcome`. Callers check `outcome.status`; never try/catch around it.

## Security — Three Non-Negotiable Layers

Every code path touching external input, file paths, or remote content must pass through all three:

1. **Input validation** (`src/core/github.ts` → `validateGitHubIdentifiers()`): regex-checks `owner/repo` before any network call
2. **Name sanitization** (`src/core/registry.ts` → `sanitizeName()`): strips `..`, path separators, non-printable chars from artifact names derived from repo paths
3. **Path confinement** (`src/targets/base.ts` → `assertConfined()`): `path.resolve()` on every write target; throws if the resolved path escapes the install directory

Never bypass or weaken these. New code that writes files or processes remote input must apply the same pattern.

## Adding a New IDE Target

1. Create `src/targets/<ide-name>.ts` extending `BaseInstaller`
2. Implement `install()` — call `this.assertConfined(targetPath)` before every `writeFileSync`
3. Register the new target in `src/targets/index.ts`
4. Add the new `ToolId` value to `@cowboylogic/cerebro-schema` — do not declare it locally in this repo
5. Use `getUserConfigDir()` from `src/utils/platform.ts` for user-scoped paths — never hardcode `~/.config` or `%APPDATA%`
6. Prepend `<!-- Installed by cerebro … -->` to every installed file

## TUI (CLI-0002 — Non-Negotiable)

The TUI uses a centralised state machine. These rules must not be broken:

- **`screens.tsx` must not call `useInput`** — all keyboard handling lives in `app.tsx` via a single `useInput` that dispatches to `handleKey()` in `transitions.ts`
- **`screens.tsx` must not call `useState` for cursor or navigation state** — all cursor positions, active screen, filter text, and sub-screen stages live in `TuiState` (`types.ts`)
- **`transitions.ts` must have no Ink import** — it is pure TypeScript: `handleKey(state: TuiState, key: KeyEvent): TuiState`
- **Screen components are pure render functions**: given props in, JSX out

Verify at any time:
```bash
grep -r "useInput" src/tui/        # must return only app.tsx
grep "useState" src/tui/screens.tsx  # must return zero results
```

## MCP Mode

Activated when `--mcp` is present before Commander runs. `runMcpServer()` in `src/mcp/server.ts` creates a `McpServer` (name: `cerebro`) via `StdioServerTransport`.

- All diagnostic output → **stderr**; stdout is reserved for the JSON-RPC stream
- Tool input schemas use Zod raw shapes (`z.*` fields directly, **not** `z.object(...)`)
- 5 registered tools: `list_sources`, `list_artifacts`, `get_artifact_status`, `install_artifact`, `add_source`

## Key Coding Conventions

- **Node.js imports** use `node:` prefix: `import fs from 'node:fs'`
- **ESM extensions** required: `import { foo } from './bar.js'`
- **`const enum` is banned** — tsx/esbuild doesn't inline them; use `const obj = { ... } as const`
- **Entry-point guard**: `if (!process.env.VITEST)` gates `program.parseAsync()` — do not use `fileURLToPath` comparisons (unreliable on Windows)
- **Types:** All core types come from `@cowboylogic/cerebro-schema`. Do not redeclare `ArtifactType`, `ToolId`, `Scope`, or `Artifact` locally

## Test Conventions

- Mock `node:fs` and platform utilities via `vi.mock(...)` at the top of each file
- Integration tests use `memfs` for in-memory I/O without touching disk
- Do not mock the GitHub API in integration tests — use fixtures or recorded responses
- Run `npm test` from the repo root before any PR; all tests must pass
- Constructor mocks require `vi.hoisted()` — see AGENTS.md for the full pattern
