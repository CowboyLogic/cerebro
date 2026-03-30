# SPEC-0002 — Install Manifest

**Product:** cerebro CLI
**Status:** Draft
**Date:** 2026-03-29
**Area:** core
**Depends on:** `@cowboylogic/cerebro-schema` (ArtifactType, ToolId, Scope)
**Consumed by:** SPEC-0004 (Session), SPEC-0006 (Installer), TUI ItemList screen

---

## Overview

Manages the install manifest at `~/.config/cerebro/installed.yaml`. The manifest tracks every artifact that Cerebro has installed: what it is, where it came from, which tool and scope it was installed for, and where it landed on disk. It is the authoritative record for computing artifact status when browsing a source repo.

The manifest is intentionally separate from the config file because it changes on every install operation, while config changes infrequently and is user-edited.

---

## Scope

**In scope:**
- Loading and saving `~/.config/cerebro/installed.yaml`
- Adding, removing, and querying installed entries
- Computing the display status of an artifact relative to a source repo and install path

**Out of scope:**
- Resolving install paths (SPEC-0001)
- Performing the actual file installation (SPEC-0006)
- Any network activity

---

## Public Interface

```typescript
import type { ArtifactType, ToolId, Scope } from '@cowboylogic/cerebro-schema';

export interface InstalledEntry {
  /** Artifact ID from the catalog or heuristic scan. */
  id: string;
  /** Human-readable name at time of install. */
  name: string;
  /** Artifact type. */
  type: ArtifactType;
  /** Full GitHub URL of the source repository. Example: 'https://github.com/anthropics/skills' */
  sourceUrl: string;
  /** Tool the artifact was installed for. */
  target: ToolId;
  /** Scope the artifact was installed under. */
  scope: Scope;
  /** Absolute path to the installed artifact on disk (folder for skills, file for instructions). */
  installedPath: string;
  /** ISO 8601 timestamp of when Cerebro installed this artifact. */
  installedAt: string;
  /**
   * Git tree SHA of the artifact at time of install (for skills: directory tree SHA;
   * for instructions: blob SHA). Optional in MVP — populated when available from the
   * GitHub API response. Reserved for update detection in a future release: compare
   * this value against the current remote SHA to determine if a newer version exists.
   */
  sourceSha?: string;
}

export interface InstallManifest {
  installed: InstalledEntry[];
}

/**
 * Artifact status as displayed in the item list.
 *
 * - 'available'  — nothing at the install path; safe to install
 * - 'installed'  — Cerebro installed this artifact from this source repo; path verified
 * - 'conflict'   — Cerebro installed this artifact from a *different* source repo
 * - 'exists'     — something exists at the install path but Cerebro did not install it
 */
export type ArtifactStatus = 'available' | 'installed' | 'conflict' | 'exists';

/**
 * Load the manifest from ~/.config/cerebro/installed.yaml.
 * Returns an empty manifest if the file does not exist.
 */
export function loadManifest(): InstallManifest;

/**
 * Persist the manifest to ~/.config/cerebro/installed.yaml.
 */
export function saveManifest(manifest: InstallManifest): void;

/**
 * Add or replace an entry in the manifest and persist.
 * If an entry with the same id + target + scope already exists, it is replaced.
 */
export function recordInstall(manifest: InstallManifest, entry: InstalledEntry): InstallManifest;

/**
 * Remove a stale entry from the manifest (e.g. the installed path no longer exists).
 * Does nothing if the entry is not found.
 */
export function removeEntry(
  manifest: InstallManifest,
  id: string,
  target: ToolId,
  scope: Scope
): InstallManifest;

/**
 * Compute the display status of an artifact for a given source repo and install path.
 *
 * Logic:
 * 1. Check whether `installPath` exists on disk.
 *    - Does not exist → 'available'
 * 2. Path exists — check manifest for an entry matching id + target + scope.
 *    - Entry found, sourceUrl matches → 'installed'  (path already verified in step 1)
 *    - Entry found, sourceUrl differs → 'conflict'
 *    - No entry found → 'exists'
 * 3. If 'installed' is returned but the path does not exist (stale entry): remove the
 *    stale entry from the manifest, save, and return 'available'.
 */
export function getArtifactStatus(
  manifest: InstallManifest,
  id: string,
  sourceUrl: string,
  target: ToolId,
  scope: Scope,
  installPath: string
): ArtifactStatus;
```

---

## Requirements

| ID | Keyword | Requirement |
|----|---------|-------------|
| MAN-REQ-0001 | MUST | The manifest MUST be located at `~/.config/cerebro/installed.yaml`. |
| MAN-REQ-0002 | MUST | `loadManifest()` MUST return an empty manifest (`{ installed: [] }`) if the file does not exist. It MUST NOT throw. |
| MAN-REQ-0003 | MUST | `getArtifactStatus()` MUST check whether `installPath` exists on disk as its first step, regardless of manifest state. |
| MAN-REQ-0004 | MUST | If `getArtifactStatus()` finds a manifest entry for the artifact but the `installPath` does not exist on disk, it MUST remove the stale entry, save the manifest, and return `'available'`. |
| MAN-REQ-0005 | MUST | `'installed'` MUST only be returned when both: (a) the path exists on disk, AND (b) a manifest entry exists with a matching `sourceUrl`, `target`, and `scope`. |
| MAN-REQ-0006 | MUST | `'conflict'` MUST be returned when the path exists on disk AND a manifest entry exists but with a different `sourceUrl`. |
| MAN-REQ-0007 | MUST | `'exists'` MUST be returned when the path exists on disk AND no manifest entry matches the given `id` + `target` + `scope`. |
| MAN-REQ-0008 | MUST | `recordInstall()` MUST replace any existing entry with the same `id` + `target` + `scope`, not append a duplicate. |
| MAN-REQ-0009 | SHOULD | `saveManifest()` SHOULD write atomically (temp file + rename) to prevent data loss on interrupted writes. |
| MAN-REQ-0010 | MUST | A parse error on `loadManifest()` MUST be surfaced as a descriptive error. Cerebro MUST NOT silently return an empty manifest on a corrupt file. |
| MAN-REQ-0011 | MUST NOT | The manifest MUST NOT store any user credentials, tokens, or private repository information. |

---

## Error Cases

| Condition | Error | User-visible message |
|-----------|-------|----------------------|
| Manifest file exists but is not valid YAML | `ManifestParseError` | `Install manifest at ~/.config/cerebro/installed.yaml could not be parsed. Delete the file to reset (installed items will no longer be tracked).` |
| Manifest file cannot be written (permissions) | `ManifestWriteError` | `Unable to write install manifest. Check permissions on ~/.config/cerebro/.` |

---

## Notes

- Status is computed on the fly at browse time — it is not stored in the manifest. This ensures the status always reflects the current filesystem state.
- `getArtifactStatus()` takes the fully-resolved absolute `installPath` as input. Path resolution is the responsibility of SPEC-0001 (`resolveInstallBase`) and SPEC-0006 (Installer), not this module.
- The `conflict` status refers specifically to conflicts Cerebro is aware of (i.e., Cerebro installed something from repo A, and repo B has an artifact with the same id). Manually created items with no manifest entry show as `exists`, not `conflict`.
