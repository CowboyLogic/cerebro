---
name: cerebro-cli-architecture
description: Use this skill when working in the cerebro CLI repo. Covers the core data flow, security layers, target installer pattern, interactive wizard, platform path handling, and key conventions. Trigger on questions about how the CLI works, where to add a new IDE target, how installation works, or how to handle cross-platform paths.
---

# Cerebro CLI Architecture

## Data Flow

```
CLI entry (src/index.ts)
  └── interactive wizard (src/ui/interactive.ts)  OR  direct command
        └── registry / discovery (src/core/registry.ts)
              └── GitHub fetch (src/core/github.ts)
                    └── installer orchestrator (src/core/installer.ts)
                          └── target installer (src/targets/<ide>.ts)
                                └── file placement on disk
```

## Security — Three Non-Negotiable Layers

Every code path touching external input, file paths, or remote content must pass through all three:

1. **Input validation** (`src/core/github.ts` → `validateGitHubIdentifiers()`): regex-checks `owner/repo` before any network call
2. **Name sanitization** (`src/core/registry.ts` → `sanitizeName()`): strips `..`, path separators, non-printable chars from artifact names
3. **Path confinement** (`src/targets/base.ts` → `assertConfined()`): `path.resolve()` on every write target; throws if the resolved path escapes the install directory

Never bypass or weaken these. New code that writes files or processes remote input must apply the same pattern.

## Adding a New IDE Target

1. Create `src/targets/<ide-name>.ts` extending `BaseInstaller`
2. Implement `install()` — call `this.assertConfined(targetPath)` before every `writeFileSync`
3. Register in `src/targets/index.ts`
4. Add the target ID to `TargetIDE` in `src/core/types.ts`
5. Map user-scope and workspace-scope paths in `src/utils/paths.ts`
6. Use `getUserConfigDir()` from `src/utils/platform.ts` for user-scoped config — never hardcode `~/.config` or `%APPDATA%`

## Key Conventions

- **Node.js imports** use `node:` prefix: `import fs from 'node:fs'`
- **ESM extensions** required: `import { foo } from './bar.js'`
- **`const enum` is banned** — tsx/esbuild doesn't inline them; use `const obj = { ... } as const`
- **Entry-point guard**: `if (!process.env.VITEST)` gates `program.parseAsync()` in `src/index.ts`
- **Installed-by header**: all installers prepend an HTML comment `<!-- Installed by cerebro … -->`

## Catalog Format (post-migration)

The registry reads `cerebro-catalog.yaml` (validated by `@cowboylogic/cerebro-schema`). The old `cerebro.json` format is superseded. Types come from the schema package — do not duplicate `Artifact`, `Catalog`, or `ArtifactType` locally.

## Test Conventions

- Mock `node:fs` and platform utilities via `vi.mock(...)` at the top of each file
- Integration tests use `memfs` for in-memory I/O
- Do not mock the GitHub API in integration tests — use fixtures
- Run `npm test` from the repo root before any PR; all tests must pass
