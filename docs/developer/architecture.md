# Architecture

This document describes the internal structure of the `cerebro` CLI package.

---

## Tech stack

| Package | Purpose |
|---|---|
| TypeScript 5 | Language |
| Node.js 20+ | Runtime |
| [Ink](https://github.com/vadimdemedes/ink) v6 | React-based TUI renderer |
| [Commander](https://github.com/tj/commander.js) v13 | CLI argument parsing |
| [Octokit](https://github.com/octokit/rest.js) | GitHub API client |
| [js-yaml](https://github.com/nodeca/js-yaml) v4 | YAML parsing/serialisation |
| [Zod](https://github.com/colinhacks/zod) v4 | MCP input validation |
| `@modelcontextprotocol/sdk` | MCP server transport |
| `@cowboylogic/cerebro-schema` | Shared types, JSON Schema, AJV validator |
| [Vitest](https://vitest.dev/) v4 | Test runner |
| [memfs](https://github.com/streamich/memfs) | In-memory filesystem for tests |

---

## Module map

```
src/
├── index.ts              Entry point — dispatches to --mcp, CLI, or TUI
├── mcp/
│   └── server.ts         MCP server (SPEC-0009)
├── cli/
│   ├── install.ts        cerebro install (SPEC-0008)
│   ├── list.ts           cerebro list
│   ├── sources.ts        cerebro sources[add|trust]
│   └── status.ts         cerebro status
├── tui/
│   ├── app.tsx           TUI root component + screen router (SPEC-0007)
│   ├── banner.tsx        Header bar shown on every screen
│   ├── screens.tsx       Individual screen components (pure render)
│   ├── transitions.ts    Pure key-event → state-transition function
│   └── types.ts          TuiState and Screen types
├── core/
│   ├── session.ts        Session object — runtime state (SPEC-0004)
│   ├── config.ts         config.yaml read/write (SPEC-0001)
│   ├── manifest.ts       installed.yaml read/write (SPEC-0002)
│   ├── catalog.ts        Artifact discovery: catalog-first + heuristic scan (SPEC-0005)
│   ├── installer.ts      File installation + path confinement (SPEC-0006)
│   ├── provider.ts       GitHub API abstraction (SPEC-0003)
│   ├── registry.ts       Source registry helpers
│   ├── github.ts         Low-level GitHub API wrappers
│   ├── settings.ts       Settings helpers
│   └── types.ts          Shared internal types
├── targets/
│   └── artifactInstaller.ts   Target-specific install helpers
└── utils/
    ├── logger.ts
    ├── paths.ts
    ├── platform.ts
    └── theme.ts
```

---

## Startup dispatch

`src/index.ts` routes execution before any heavy imports:

```
process.argv
  ├── --mcp  →  mcp/server.ts (bypasses Commander entirely)
  └── otherwise → Commander
       ├── install / list / sources / status → cli/*.ts
       └── (no subcommand) → tui/app.tsx
```

The `--mcp` flag is checked before Commander runs to prevent Commander from writing to stdout and corrupting the JSON-RPC stream.

---

## Core modules

### `session.ts` — SPEC-0004

`createSession()` is the first call in every entry point. It:

1. Loads `~/.config/cerebro/config.yaml` via `config.ts`
2. Loads `~/.config/cerebro/installed.yaml` via `manifest.ts`
3. Pre-populates `target` and `scope` from `config.defaults`
4. Creates a provider factory with a domain-scoped cache

The `Session` object is passed down to all operations; nothing reads config or manifest directly.

### `config.ts` — SPEC-0001

Manages `~/.config/cerebro/config.yaml`. On load, the user file is deep-merged with bundled defaults so absent keys always resolve to the current defaults. Arrays (like `sources`) are replaced, not merged.

`saveConfig()` uses atomic writes (write to a temp file, then rename) to prevent partial writes.

### `manifest.ts` — SPEC-0002

Manages `~/.config/cerebro/installed.yaml`. Tracks every artifact Cerebro has installed with its target, scope, and install path.

`getArtifactStatus()` computes the display status for a given artifact by comparing the manifest against the filesystem:

| Status | Condition |
|---|---|
| `installed` | Present in manifest and file exists at recorded path |
| `conflict` | Present in manifest but file is at a different path |
| `exists` | File exists at expected path but not in manifest |
| `available` | No manifest entry, no file at expected path |

### `catalog.ts` — SPEC-0005

`fetchCatalog(provider, owner, repo)` resolves an artifact list from a repository:

1. **Catalog-first**: tries to fetch `cerebro-catalog.yaml` from the repo root and validates it against the JSON Schema.
2. **Heuristic fallback**: if no valid catalog exists, scans for known folder structures (e.g. `SKILL.md` files) and synthesises a minimal catalog.

Returns a `CatalogResult` with a `source` field (`'catalog'` or `'heuristic'`) so callers can show the appropriate label.

### `provider.ts` — SPEC-0003

Abstracts the GitHub API behind a `SourceProvider` interface. The concrete implementation (`GitHubProvider`) uses Octokit. Tests inject a mock provider.

`resolveGitHubTokenSource()` detects which auth mechanism is in use: `GITHUB_TOKEN` env var → `GH_TOKEN` env var → `gh auth token` CLI → `none`.

### `installer.ts` — SPEC-0006

The only module that writes files outside of `~/.config/cerebro/`.

Key behaviours:
- **Path confinement** (`assertConfined`): resolves both the install base and destination to absolute paths and verifies the destination is inside the base. Throws `PATH_CONFINEMENT` if not.
- **Atomic writes**: skills are downloaded to `<dest>.tmp-<timestamp>` then renamed to `<dest>`.
- **Baseline file protection**: files named `claude.md`, `agents.md`, or `copilot-instructions.md` are never overwritten even if `--overwrite` is passed.
- After a successful install, records the entry in the manifest.

---

## TUI architecture

The TUI follows a strict **unidirectional data flow**:

```
useInput (Ink) → handleKey (pure function) → TuiAction → useEffect → setState
```

- `TuiState` (in `types.ts`) is the single source of truth for all navigation state, cursor positions, and selections.
- `screens.tsx` components are **pure render functions** — they own no state and receive the full `TuiState` plus callbacks.
- `transitions.ts` — `handleKey()` — is a pure function: given a `TuiState` and a key event, it returns a `TuiAction` describing what should happen next. Tests cover this function directly without rendering.
- Side effects (API calls, installs) are triggered by `TuiAction` values dispatched through a `useEffect` in `app.tsx`.

---

## Disk layout

| File | Purpose |
|---|---|
| `~/.config/cerebro/config.yaml` | User configuration |
| `~/.config/cerebro/installed.yaml` | Install manifest |

All other paths are determined by the target/scope matrix in config. See [Configuration](../user-guide/configuration.md) for the full path table.

---

## Design decisions

Suite-level decisions are recorded as `S-XXXX` ADRs in [`docs/adr/`](../adr/README.md). The CLI-specific decisions are `CLI-XXXX` ADRs in the same folder. Key decisions affecting this architecture:

| ADR | Decision |
|---|---|
| [S-0001](../adr/S-0001-schema-package-single-source-of-truth.md) | Schema types and validator live in `cerebro-schema`; never duplicated in consuming packages |
| [S-0002](../adr/S-0002-catalog-format-standard.md) | `cerebro-catalog.yaml` is the standard catalog format |
| [S-0003](../adr/S-0003-installer-follows-catalog-targets.md) | Installer uses catalog `targets` field to determine install paths |
| [S-0004](../adr/S-0004-catalog-first-heuristic-fallback-discovery.md) | Catalog-first discovery with heuristic fallback |
| [S-0006](../adr/S-0006-design-first-development-process.md) | Design → Spec → Tests → Code workflow |
| [CLI-0001](../adr/CLI-0001-path-confinement-security.md) | Path confinement on all installer writes |
