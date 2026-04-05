# SPEC-0006 — Installer

**Product:** cerebro CLI
**Status:** Draft
**Date:** 2026-03-29
**Area:** core
**Depends on:** SPEC-0001 (Config), SPEC-0002 (Manifest), SPEC-0003 (Source Provider), `@cowboylogic/cerebro-schema` (Artifact, ToolId, Scope)
**Consumed by:** TUI install action, CLI install command, MCP install_artifact tool

---

## Overview

Installs a single artifact from a source GitHub repository to the user's local machine. Resolves the install path from config, enforces non-destructive behaviour (warn before overwrite), downloads the artifact via the GitHub client, writes it to disk, and records the install in the manifest.

The installer is the only module that writes to the user's filesystem outside of `~/.config/cerebro/`.

---

## Scope

**In scope:**
- Resolving the final install path for a given artifact + tool + scope
- Checking whether the destination already exists (pre-install status check)
- Downloading artifact content from GitHub (delegating to SPEC-0003)
- Writing skill directories and instruction files to disk
- Enforcing path confinement on every write
- Recording successful installs in the manifest
- Returning a structured result to the caller (the UI layer decides how to present it)

**Out of scope:**
- Asking the user whether to overwrite (that is the UI layer's responsibility — the installer receives an explicit `overwrite` option)
- Computing display status for the item list (SPEC-0002 `getArtifactStatus`)
- Any network calls beyond file download (SPEC-0003)

---

## Public Interface

```typescript
import type { Artifact, ToolId, Scope } from '@cowboylogic/cerebro-schema';
import type { CerebroConfig } from './config.js';
import type { InstallManifest } from './manifest.js';
import type { SourceProvider } from './provider.js';

export interface InstallOptions {
  /** If true, overwrite the destination if it already exists. Default: false. */
  overwrite: boolean;
}

export type InstallOutcome =
  | { status: 'success'; installedPath: string }
  | { status: 'skipped'; reason: 'exists' | 'conflict' | 'unsupported-target' }
  | { status: 'error'; message: string };

/**
 * Install an artifact from a source repository to the resolved local path.
 *
 * Steps:
 * 1. Validate that the selected tool is in artifact.supports (if set)
 * 2. Resolve install base path from config
 * 3. Determine final destination (installBase / artifactId for skills, installBase / filename for instructions)
 * 4. Check if destination exists — if yes and overwrite is false, return 'skipped'
 * 5. Download artifact content from GitHub to a temp location
 * 6. Move/copy from temp to destination (atomic where possible)
 * 7. Record install in manifest and save
 * 8. Return success result
 */
export function installArtifact(
  artifact: Artifact,
  sourceOwner: string,
  sourceRepo: string,
  tool: ToolId,
  scope: Scope,
  config: CerebroConfig,
  manifest: InstallManifest,
  provider: SourceProvider,
  options: InstallOptions
): Promise<InstallOutcome>;
```

---

## Install Destination Logic

### Skills (`type: 'skill'`)
```
installBase = resolveInstallBase(config, tool, 'skill', scope)
destination = path.join(installBase, artifactId)
```
The entire directory tree at `artifact.source` in the source repo is downloaded to `destination`.

### Instructions (`type: 'instruction'`)
```
installBase = resolveInstallBase(config, tool, 'instruction', scope)
filename    = path.basename(artifact.source)
destination = path.join(installBase, filename)
```
The single file at `artifact.source` is downloaded to `destination`.

---

## Requirements

| ID | Keyword | Requirement |
|----|---------|-------------|
| INS-REQ-0001 | MUST | If `artifact.supports` is set and `tool` is not in the list, `installArtifact()` MUST return `{ status: 'skipped', reason: 'unsupported-target' }` without writing anything. |
| INS-REQ-0002 | MUST | `installArtifact()` MUST call `resolveInstallBase()` (SPEC-0001) to determine the install path. It MUST NOT construct install paths independently. |
| INS-REQ-0003 | MUST | Before any write, `installArtifact()` MUST verify that the resolved destination is confined within `installBase` using `assertConfined(installBase, destination)`. |
| INS-REQ-0004 | MUST | If the destination already exists and `options.overwrite` is `false`, `installArtifact()` MUST return `{ status: 'skipped', reason: 'exists' }` without writing or modifying any files. |
| INS-REQ-0005 | MUST | If the destination already exists and `options.overwrite` is `true`, the existing destination MUST be removed before writing the new content. |
| INS-REQ-0006 | MUST NOT | The installer MUST NEVER write to any path that matches the following baseline file names, regardless of overwrite setting: `CLAUDE.md`, `AGENTS.md`, `copilot-instructions.md`. |
| INS-REQ-0007 | MUST | For `type: 'skill'`, the installer MUST download the entire directory tree at `artifact.source` and preserve its internal structure under the destination directory. |
| INS-REQ-0008 | MUST | For `type: 'instruction'`, the installer MUST download the single file at `artifact.source` to the destination path. |
| INS-REQ-0009 | MUST | The installer MUST create all necessary parent directories before writing. |
| INS-REQ-0010 | MUST | On successful install, the installer MUST call `recordInstall()` (SPEC-0002) and `saveManifest()` to persist the install record. |
| INS-REQ-0011 | MUST | On any error during download or write, the installer MUST NOT leave partial files or directories at the destination. It MUST clean up any partially-written content before returning the error. |
| INS-REQ-0012 | MUST | `installArtifact()` MUST return `{ status: 'error', message: string }` for any unrecoverable failure — it MUST NOT throw. |
| INS-REQ-0013 | SHOULD | For `type: 'skill'`, the install SHOULD be atomic: download to a temp directory first, then rename/move to the final destination. |
| INS-REQ-0014 | MUST NOT | The installer MUST NOT handle artifact types other than `'skill'` and `'instruction'` in the MVP. For any other type, it MUST return `{ status: 'skipped', reason: 'unsupported-target' }`. |

---

## Error Cases

| Condition | INS-REQ | Outcome |
|-----------|---------|---------|
| `artifact.supports` set and `tool` not included | INS-REQ-0001 | `{ status: 'skipped', reason: 'unsupported-target' }` |
| Destination exists, `overwrite: false` | INS-REQ-0004 | `{ status: 'skipped', reason: 'exists' }` |
| Resolved path escapes install base | INS-REQ-0003 | `{ status: 'error', message: 'Path confinement violation...' }` |
| Network error during download | INS-REQ-0012 | `{ status: 'error', message: '...' }` |
| Write permission denied | INS-REQ-0012 | `{ status: 'error', message: '...' }` |
| Artifact type not supported | INS-REQ-0014 | `{ status: 'skipped', reason: 'unsupported-target' }` |

---

## Notes

- The `overwrite` decision is made by the UI layer (TUI, CLI, MCP), not by the installer. The TUI presents the conflict/exists status to the user and asks for confirmation before calling `installArtifact()` with `overwrite: true`. The CLI uses the `--overwrite` flag. The MCP tool exposes an `overwrite` parameter.
- `assertConfined(base, target)` carries forward from the provisional code as a non-negotiable security control. It resolves both paths with `path.resolve()` and throws if `target` does not begin with `base + path.sep`.
- The baseline file protection list in INS-REQ-0006 (`CLAUDE.md`, `AGENTS.md`, `copilot-instructions.md`) is checked by exact filename match, case-insensitively on Windows. This list may be extended in future releases.
