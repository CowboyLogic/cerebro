# AGENTS.md — Ground Rules for AI Coding Agents

## Non-Negotiable Rules

1. **Every code change ships with unit tests.** No exceptions. Tests live in `cerebro-cli/tests/unit/` mirroring the `cerebro-cli/src/` tree. Run `npm test` (from `cerebro-cli/`) before considering any task complete; all 173+ tests must pass.

2. **Every code change requires an open GitHub issue.** Before writing code, confirm a matching issue exists at `https://github.com/CowboyLogic/cerebro/issues`. Post progress updates on that issue during development (at minimum: started, approach chosen, done). Do not open a PR without linking it to the issue.

3. **Security is first-class.** This app fetches and installs content from arbitrary remote repositories onto the user's machine. Every code path that touches external input, file paths, or persisted data must be hardened. See the Security section below.

---

## Project Layout

```
cerebro-cli/
  src/
    index.ts              # CLI entry point (Commander); guarded by !process.env.VITEST
    core/
      types.ts            # Shared types: Component, InstallOptions, RepoSource, etc.
      github.ts           # GitHub API client; validates owner/repo identifiers
      registry.ts         # Component discovery; sanitizes component names
      installer.ts        # Orchestrates install across targets
      settings.ts         # Persistent user settings (~/.config/cerebro/user-settings.json)
    targets/
      base.ts             # BaseInstaller with assertConfined() path-confinement guard
      claude-code.ts      # Claude Code installer
      opencode.ts         # OpenCode installer
      vscode.ts           # VS Code installer
      copilot.ts          # Copilot CLI installer
      index.ts            # Target registry
    ui/
      interactive.ts      # Clack-based wizard (state machine; step navigation)
    utils/
      platform.ts         # OS detection; getUserConfigDir() per platform
      paths.ts            # findWorkspaceRoot(), ensureDir(), IDE path map
      theme.ts            # Chalk theme, icons, banner, resultBox, stepBadge, etc.

  tests/
    unit/                 # Fast, fs-mocked unit tests
    integration/          # Tests that exercise real file I/O
    cli/                  # End-to-end CLI invocation tests
    __fixtures__/         # Shared test helpers (makeComponent, etc.)
```

---

## Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 20.12+ (ESM, `"type": "module"`) |
| Language | TypeScript 5.x |
| Dev execution | `tsx` (esbuild-based — see gotchas below) |
| CLI framework | Commander v13 |
| Prompts | `@clack/prompts` v1.1.0 |
| Styling | chalk v5 |
| Test runner | Vitest 4.x |

---

## Security Layers — Must Be Maintained

Three layers of defence against malicious repositories and hand-edited config files:

| Layer | Location | What it does |
|---|---|---|
| Input validation | `cerebro-cli/src/core/github.ts` — `validateGitHubIdentifiers()` | Rejects owner/repo strings that don't match GitHub's naming rules before any network call |
| Name sanitization | `cerebro-cli/src/core/registry.ts` — `sanitizeName()` | Strips `..`, path separators, and non-printable chars from component names derived from repo paths |
| Path confinement | `cerebro-cli/src/targets/base.ts` — `BaseInstaller.assertConfined()` | Calls `path.resolve()` on every file write target and throws if it escapes the install directory |

Settings file (`settings.ts`): enforces a 64 KB size cap, validates JSON structure, re-validates every saved `owner/repo` through `parseRepoUrl()` on load, and caps the list at 20 entries.

When adding new code that writes files, calls external APIs, or processes user/remote input, apply the same pattern: validate early, sanitize names, confine paths.

---

## cerebro.json Manifest

Repos can place a `cerebro.json` at their root to declare an authoritative component list. Cerebro checks for it first; if absent or invalid it falls back to heuristic discovery.

**Schema:**

```jsonc
{
  "cerebro": "1",            // schema version (string, required)
  "name": "my-repo",         // optional display name
  "description": "...",      // optional
  "components": [
    {
      "name": "code-review",         // required, sanitized on load
      "type": "agent",               // required: skill | agent | prompt | instruction | snippet | workflow | unknown
      "description": "...",          // optional, max 200 chars
      "files": ["agents/code-review.agent.md"],  // required, relative paths only
      "targets": ["claude-code", "opencode"],    // optional; inferred from type if omitted
      "tags": ["review", "quality"]              // optional
    }
  ]
}
```

**Valid types:** `skill`, `agent`, `prompt`, `instruction`, `snippet`, `workflow`, `unknown`

**Valid targets:** `claude-code`, `opencode`, `vscode`, `copilot`

**Security:** `validateManifest()` in `cerebro-cli/src/core/registry.ts` rejects any file path containing `..` or an absolute path. `sanitizeName()` is applied to all component names. Components with no valid files after validation are silently dropped. A manifest with zero valid components causes fallback to heuristic discovery.

---

## Coding Conventions

- **Imports:** Node built-ins use the `node:` prefix (`import fs from 'node:fs'`). All imports use `.js` extensions (ESM requirement).
- **`const enum` is banned** — `tsx`/esbuild does not inline `const enum` values, causing silent switch misses. Use `const obj = { ... } as const` instead.
- **Entry-point guard:** Use `if (!process.env.VITEST)` to gate `program.parseAsync()`. Do not use `fileURLToPath` path comparisons — they are unreliable on Windows due to drive-letter casing.
- **Targets:** New IDE targets extend `BaseInstaller` (`cerebro-cli/src/targets/base.ts`) and must call `BaseInstaller.assertConfined()` before every `writeFileSync`.
- **Installed-by header:** All installers prepend an HTML comment `<!-- Installed by cerebro … -->` to installed files.
- **Platform paths:** Use `getUserConfigDir()` from `cerebro-cli/src/utils/platform.ts` for config dirs — it handles Windows (`%APPDATA%`), macOS (`~/Library/Application Support`), and Linux (`$XDG_CONFIG_HOME` / `~/.config`).

---

## Test Conventions

- Mock `node:fs` and platform utilities at the top of each test file using `vi.mock(...)`.
- Use `makeComponent()` from `cerebro-cli/tests/__fixtures__/tree-responses.ts` for test data.
- Integration tests use `memfs` for real in-memory file I/O without touching disk.
- Do not mock the GitHub API in integration tests — use fixtures or recorded responses.
- `npm run test:unit` / `test:integration` / `test:cli` run subsets; `npm test` runs all (from `cerebro-cli/`).
