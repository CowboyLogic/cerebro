# S-0003: Installer Follows Catalog-Declared Target Paths

**Level:** Suite<br />
**Status:** Accepted<br />
**Date:** 2026-03-28<br />

## Context

The original `cerebro` CLI implemented a separate installer class for each supported IDE (`ClaudeCodeInstaller`, `CopilotInstaller`, `OpenCodeInstaller`, etc.). Each class contained hardcoded knowledge of where files should be placed for that IDE — for example, skills go to `.claude/skills/<name>/`, Copilot instructions go to `.github/copilot-instructions.md`, and so on.

This approach has two compounding problems: adding support for a new tool requires code changes to the installer layer in every Cerebro product, and the installer's hardcoded paths can become wrong whenever an AI tool changes its conventions — without any catalog author being able to correct it.

## Decision

The installer layer reads `compatibility[].files[].target` from the catalog entry and writes each source file to its declared target path. The installer contains no hardcoded, tool-specific path logic. Where a file lands is entirely determined by the catalog.

## Rationale

**Control belongs with catalog authors.** The people who maintain an artifact repository are best positioned to know where their files should be installed for each tool. Hardcoding that knowledge in the installer creates a dependency inversion.<br />

**New tool support without installer changes.** Adding a new `ToolId` to the schema (e.g., a new AI assistant) does not require changes to any installer. The catalog author declares targets for that tool; the installer executes them generically.<br />

**Heuristic fallback as best-effort.** When no catalog is present, heuristic discovery synthesizes target paths using `defaultTargetPath()`. These synthesized paths encode current community conventions but are explicitly second-class — catalog-declared paths always win.<br />

Alternatives considered:
- **Keep per-tool installer classes, driven by catalog metadata** — rejected; the catalog-driven dispatch still leaks tool-specific logic into the installer.
- **Catalog declares a `tool-hint` and installers interpret it** — rejected; this is the same problem with extra indirection.

## Consequences

- Catalog quality directly determines install correctness. Poor or missing `target` values produce incorrect installations.
- The heuristic `defaultTargetPath()` function in the registry must be kept current with AI tool conventions, since it is the fallback for repos without a catalog.
- Path confinement security (`assertConfined()`) becomes more critical than ever, since target paths are now externally supplied strings rather than values that exist in source code.

## Compliance

Installer implementations must not contain `switch`/`if` blocks that select a target path based on `tool` or `type` values. All path decisions must come from `compatibility[].files[].target` (catalog) or `defaultTargetPath()` (heuristic fallback in the registry layer — not the installer). Code review must treat hardcoded path logic in any installer as a violation of this ADR.

---

*Supersedes: (none)*
*Related: [S-0002](S-0002-catalog-format-standard.md), [CLI-0001](CLI-0001-path-confinement-security.md)*
