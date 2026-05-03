# AGENTS.md — Ground Rules for AI Coding Agents

## Commands

All commands run from the project root (`cerebro/`):

```bash
npm start              # Run TUI mode (tsx src/index.ts)
npm run dev            # Watch mode
npm run build          # Compile TypeScript to bin/

npm test               # Run all tests (280+), must pass before any PR
npm run test:unit      # Unit tests only
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report (thresholds: 75% lines/functions, 70% branches)
```

Run a single test file: `npx vitest run tests/unit/core/config.test.ts`

---

## Architecture

**Three execution modes, one core engine.** All modes call into `src/core/` exclusively. No
business logic lives in `src/tui/`, `src/cli/`, or `src/mcp/`.

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

**Mode detection:** `src/index.ts` checks for `--mcp` before Commander initialises. Commander
writes help/errors to stdout — if it ran first it would corrupt the JSON-RPC stream.

**Core entry point:** `createSession()` (`src/core/session.ts`) is the shared entry point for
all three modes. Call it first; everything else flows from the session object it returns.

**Installation (SPEC-0006):** `installArtifact()` **never throws** — always returns an
`InstallOutcome`. Callers check `outcome.status`, never try/catch.

**Provider abstraction (SPEC-0003):** `createProvider(url)` detects the provider from the URL
domain. MVP ships `GitHubProvider`. No module outside `provider.ts` has knowledge of
GitHub-specific APIs. Adding a new host means implementing `SourceProvider` and registering the
domain — zero changes to catalog, installer, session, TUI, CLI, or MCP.

**Config and manifest paths:**
- Config: `~/.config/cerebro/config.yaml` (created from bundled defaults on first run)
- Manifest: `~/.config/cerebro/installed.yaml`

---

## Key Types

All core types come from `@cowboylogic/cerebro-schema`. Do not re-declare them locally.

- `ArtifactType`: `'skill' | 'instruction' | 'prompt' | 'agent' | 'hook' | 'mcp-server' | 'snippet' | 'workflow' | 'other'`
- `ToolId`: `'claude-code' | 'copilot' | 'agents' | 'cursor' | 'windsurf' | 'opencode'`
- `Scope`: `'workspace' | 'user'`
- `Artifact`: `{ id, name, type, source, description?, version?, tags?, supports? }`

CLI-local types (in `src/core/config.ts`):
- `SourceEntry`: `{ name, url, enabled, trusted }`
- `CerebroConfig`: full config structure, mirrors `config.yaml`

---

## Keeping This File Current

This file, `CLAUDE.md`, and all `.agents/skills/` files in this repo are **living documents**. They exist so any coding agent — Claude Code, GitHub Copilot, or any other — arrives with accurate context and doesn't need to rediscover conventions.

Update them in the same PR as the code change whenever:

- Architecture patterns change (new modules, renamed abstractions, removed layers)
- Conventions are added or revised
- Key types, entry points, commands, or security rules change
- Test fixtures or thresholds change
- A decision is made that future agents should know about

The three skill files in `.agents/skills/` must be kept current by the same rule:

| Skill | Update when |
|-------|-------------|
| `cerebro-cli-architecture` | Execution modes, core data flow, security layers, TUI conventions, MCP structure, type ownership, or target installer pattern change |
| `cerebro-dev-workflow` | Branch strategy, CI check names, commit format, release process, or versioning rules change |
| `cerebro-suite-context` | Repo roster, workspace layout, bootstrap process, CI dependency pattern, or catalog format change |

A stale skill gives agents confidently wrong guidance — treat skill files with the same urgency as `AGENTS.md` itself.

**`mkdocs.yml` nav must always reflect the current state of `docs/`.** When you add, rename, move, or delete any file under `docs/`, update the `nav:` section of `mkdocs.yml` in the same commit. A page that exists but is absent from `nav:` is invisible to site visitors; a nav entry pointing to a deleted file breaks the build.

After any change to `docs/` or `mkdocs.yml`, run a strict local build to catch nav and link errors before committing:

```bash
mkdocs build --strict
```

This requires `pip install mkdocs-material mkdocs-callouts` once. CI enforces the same check, but catching it locally is faster than waiting for a failed run.

Do not defer doc updates. A stale `AGENTS.md` is worse than no `AGENTS.md` — it actively misleads.

---

## Non-Negotiable Rules

1. **Every code change ships with unit tests.** No exceptions. Tests live in `tests/unit/` mirroring the `src/` tree. Run `npm test` (from the project root (`cerebro/`)) before considering any task complete; all 270+ tests must pass.

2. **Every code change requires an open GitHub issue.** Before writing code, confirm a matching issue exists at `https://github.com/CowboyLogic/cerebro/issues`. Post progress updates on that issue during development (at minimum: started, approach chosen, done). Do not open a PR without linking it to the issue.

3. **Security is first-class.** This app fetches and installs content from arbitrary remote repositories onto the user's machine. Every code path that touches external input, file paths, or persisted data must be hardened. See the Security section below.

---

## Project Layout

```
src/
  index.ts              # CLI entry point (Commander); also detects --mcp flag before Commander
  core/
    catalog.ts          # Fetches artifact catalog; only 404 falls back to heuristic (non-404 propagates)
    config.ts           # CerebroConfig helpers: addSource, trustSource, resolveInstallBase
    installer.ts        # Orchestrates artifact installation across targets
    manifest.ts         # InstallManifest: tracks what is installed; getArtifactStatus
    provider.ts         # SourceProvider interface; parseRepoUrl; createProvider
    session.ts          # Session creation: createSession, setTarget, setScope
    types.ts            # Shared types
  cli/
    install.ts          # `cerebro install` command; --persist uses setTarget/setScope
    sources.ts          # `cerebro sources` command; session.config = addSource(...) (return value used)
  mcp/
    server.ts           # MCP server (SPEC-0009); exports runMcpServer(); activated by --mcp flag
                        # Registers 5 tools: list_sources, list_artifacts, get_artifact_status,
                        #   install_artifact, add_source
                        # Uses @modelcontextprotocol/sdk McpServer + StdioServerTransport
                        # All diagnostic output → stderr; stdout reserved for JSON-RPC stream
  tui/
    app.tsx             # Top-level TUI app; wires AddSource props (onRequestValidate / onAdd split)
                        # Contains inlined banner() function (raw ANSI, no chalk dependency)
    screens.tsx         # Individual screen components; AddSource uses parseRepoUrl() for validation
                        # and accepts pasted/multi-char input (input.length >= 1)

tests/
  unit/                 # Fast, fs-mocked unit tests (mirrors src/)
    core/               # catalog.test.ts, config.test.ts, …
    cli/                # install.test.ts, sources.test.ts
    mcp/                # server.test.ts — uses vi.hoisted() for constructable MockMcpServer spy
    tui/                # screens.test.tsx, app.test.tsx
  __fixtures__/         # Shared test helpers
```

---

## Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 20+ (ESM, `"type": "module"`) |
| Language | TypeScript 5.7 |
| CLI framework | Commander v13 |
| TUI | Ink 6 + React 19 |
| GitHub API | @octokit/rest 22 |
| Config format | js-yaml 4 |
| Schema | @cowboylogic/cerebro-schema (local sibling package) |
| MCP | @modelcontextprotocol/sdk ^1.29.0 |
| Validation | zod ^4.3.6 (named export: `import { z } from 'zod'`) |
| Test runner | Vitest 4.x |

---

## Security Layers — Must Be Maintained

Three layers of defence against malicious repositories and hand-edited config files:

| Layer | Location | What it does |
|---|---|---|
| Input validation | `src/core/github.ts` — `validateGitHubIdentifiers()` | Rejects owner/repo strings that don't match GitHub's naming rules before any network call |
| Name sanitization | `src/core/registry.ts` — `sanitizeName()` | Strips `..`, path separators, and non-printable chars from component names derived from repo paths |
| Path confinement | `src/targets/base.ts` — `BaseInstaller.assertConfined()` | Calls `path.resolve()` on every file write target and throws if it escapes the install directory |

Settings file (`settings.ts`): enforces a 64 KB size cap, validates JSON structure, re-validates every saved `owner/repo` through `parseRepoUrl()` on load, and caps the list at 20 entries.

When adding new code that writes files, calls external APIs, or processes user/remote input, apply the same pattern: validate early, sanitize names, confine paths.

---

## MCP Mode (SPEC-0009)

Activated when `--mcp` is present in `process.argv`. Detected in `src/index.ts` **before** Commander runs, using dynamic imports to branch cleanly.

- `runMcpServer()` in `src/mcp/server.ts` creates a `McpServer` (name: `cerebro`, version: `0.1.0`) and connects via `StdioServerTransport`.
- All diagnostic output goes to **stderr**. stdout is reserved for the JSON-RPC stream.
- Startup errors from `createSession()` (`ConfigParseError`, `ManifestParseError`) are logged to stderr and `process.exit(1)`.
- Tool input schemas use Zod raw shapes (plain objects with `z.*` fields, **not** `z.object(...)`).

**5 registered tools:** `list_sources`, `list_artifacts`, `get_artifact_status`, `install_artifact`, `add_source`

---

## Known Test Gotchas

### Vitest mock constructors (`vi.hoisted`)

`vi.mock()` factories are hoisted before module-level variable declarations. Any variable needed inside a `vi.mock()` factory **must** be created with `vi.hoisted()`:

```ts
const { MockFoo } = vi.hoisted(() => {
  const MockFoo = vi.fn(function MockFoo(this: any) { return mockFooInstance; });
  return { MockFoo };
});
vi.mock('some-module', () => ({ Foo: MockFoo }));
```

Use a **regular function** (not arrow) as the `vi.fn()` implementation so it is newable as a constructor. When a constructor returns an object, `new Foo()` yields that object.

### Ink `useInput` and multi-character input

`ink-testing-library`'s `stdin.write(str)` emits `str` as a **single** data event. Ink parses the whole string as one keypress with `input = str` (not char by char). The `useInput` handler is called once with the entire string. Therefore:

- Handle `input.length >= 1` (not just `=== 1`) for text accumulation in TUI components.
- Use a `useRef` mirroring URL/text state so the `isSubmit` handler always reads the current value, even within the same React render cycle.

---


## `cerebro-catalog.yaml` Catalog Format

Repos can place a `cerebro-catalog.yaml` at their root to declare their artifacts explicitly. Cerebro checks for it first (fallback filename: `cerebro-catalog.yml`); if absent or invalid it falls back to heuristic discovery. The schema is defined by `@cowboylogic/cerebro-schema` and validated with `validateCatalog()` — do not duplicate or redefine catalog types locally.

**Schema (excerpt):**

```yaml
cerebro: "1"          # format version (string, required)
name: my-repo         # optional display name
description: "..."    # optional
artifacts:
  - id: code-review                 # required; lowercase slug ^[a-z0-9][a-z0-9-]*[a-z0-9]$
    name: Code Review               # required display name
    type: agent                     # required: skill | agent | prompt | instruction | snippet | workflow | mcp-server | hook | other
    description: "..."              # optional
    tags: [review, quality]         # optional
    compatibility:
      - tool: claude-code           # required: claude-code | copilot | opencode | visual-studio | intellij
        scope: [workspace, global]  # required
        files:
          - source: agents/code-review.agent.md   # repo-relative path
            target: agents/code-review.agent.md   # install-relative path
```

**If `cerebro-catalog.yaml` is absent, invalid, or yields zero artifacts** after `validateCatalog()`, `fetchCatalog()` in `src/core/catalog.ts` falls back to heuristic scanning. A non-404 fetch error propagates — only 404 triggers the fallback.

---

## Coding Conventions

- **Imports:** Node built-ins use the `node:` prefix (`import fs from 'node:fs'`). All imports use `.js` extensions (ESM requirement).
- **`const enum` is banned** — `tsx`/esbuild does not inline `const enum` values, causing silent switch misses. Use `const obj = { ... } as const` instead.
- **Entry-point guard:** Use `if (!process.env.VITEST)` to gate `program.parseAsync()`. Do not use `fileURLToPath` path comparisons — they are unreliable on Windows due to drive-letter casing.
- **Targets:** New IDE targets extend `BaseInstaller` (`src/targets/base.ts`) and must call `BaseInstaller.assertConfined()` before every `writeFileSync`.
- **Installed-by header:** All installers prepend an HTML comment `<!-- Installed by cerebro … -->` to installed files.
- **Platform paths:** Use `getUserConfigDir()` from `src/utils/platform.ts` for config dirs — it handles Windows (`%APPDATA%`), macOS (`~/Library/Application Support`), and Linux (`$XDG_CONFIG_HOME` / `~/.config`).

### TUI Conventions (CLI-0002)

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

Rationale: distributed `useInput` in screen components makes navigation logic untestable without
Ink's async event system. The centralized model makes every navigation requirement in SPEC-0007
testable as a plain synchronous call to `handleKey()`. See
`docs/adr/CLI-0002-tui-centralized-state-machine.md` for full rationale.

---

## Test Conventions

- Mock `node:fs` and platform utilities at the top of each test file using `vi.mock(...)`.
- Use `makeComponent()` from `tests/__fixtures__/tree-responses.ts` for test data.
- Integration tests use `memfs` for real in-memory file I/O without touching disk.
- Do not mock the GitHub API in integration tests — use fixtures or recorded responses.
- `npm run test:unit` / `test:integration` / `test:cli` run subsets; `npm test` runs all (from the project root).
- All tests are in `tests/unit/` — no separate integration or CLI test categories.
- Test files mirror source structure: `tests/unit/core/`, `tests/unit/cli/`, `tests/unit/tui/`, `tests/unit/mcp/`.
- Each test references the requirement ID it covers (e.g. `// TUI-REQ-0007`).
- Coverage excludes `src/index.ts`.
- **Ink keyboard testing caveat:** Escape key uses `setImmediate` internally — cannot be tested synchronously. Arrow key navigation requires React `act()` to flush batch updates.
