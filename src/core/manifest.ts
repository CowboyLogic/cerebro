/**
 * SPEC-0002 — Install Manifest
 *
 * Manages ~/.config/cerebro/installed.yaml.
 * Tracks every artifact Cerebro has installed and provides the logic for
 * computing display status at browse time.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import type { ArtifactType, ToolId, Scope } from '@cowboylogic/cerebro-schema';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface InstalledEntry {
  id: string;
  name: string;
  type: ArtifactType;
  sourceUrl: string;
  target: ToolId;
  scope: Scope;
  installedPath: string;
  installedAt: string;
  sourceSha?: string;
}

export interface InstallManifest {
  installed: InstalledEntry[];
}

export type ArtifactStatus = 'available' | 'installed' | 'conflict' | 'exists';

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class ManifestParseError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(
      `Install manifest at ${filePath} could not be parsed. ` +
        'Delete the file to reset (installed items will no longer be tracked).',
    );
    this.name = 'ManifestParseError';
    if (cause instanceof Error) this.cause = cause;
  }
}

export class ManifestWriteError extends Error {
  constructor(dirPath: string, cause: unknown) {
    super(`Unable to write install manifest. Check permissions on ${dirPath}.`);
    this.name = 'ManifestWriteError';
    if (cause instanceof Error) this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function manifestPath(): string {
  return path.join(os.homedir(), '.config', 'cerebro', 'installed.yaml');
}

function atomicWrite(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    throw new ManifestWriteError(path.dirname(filePath), err);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** MAN-REQ-0002: returns empty manifest if file absent; never throws on absence */
export function loadManifest(): InstallManifest {
  const mPath = manifestPath();

  if (!fs.existsSync(mPath)) {
    return { installed: [] };
  }

  let raw: unknown;
  try {
    const content = fs.readFileSync(mPath, 'utf8');
    raw = yamlLoad(content);
  } catch (err) {
    throw new ManifestParseError(mPath, err);
  }

  // MAN-REQ-0010: corrupt file must throw, not silently return empty
  if (raw === null || typeof raw !== 'object') {
    throw new ManifestParseError(mPath, new Error('Manifest is empty or not a mapping'));
  }

  const data = raw as Record<string, unknown>;
  return {
    installed: Array.isArray(data['installed']) ? (data['installed'] as InstalledEntry[]) : [],
  };
}

/** MAN-REQ-0009: atomic write */
export function saveManifest(manifest: InstallManifest): void {
  atomicWrite(manifestPath(), yamlDump(manifest));
}

/** MAN-REQ-0008: upsert — replaces existing entry with same id+target+scope */
export function recordInstall(
  manifest: InstallManifest,
  entry: InstalledEntry,
): InstallManifest {
  const filtered = manifest.installed.filter(
    (e) => !(e.id === entry.id && e.target === entry.target && e.scope === entry.scope),
  );
  return { installed: [...filtered, entry] };
}

/** Remove a stale entry. Does nothing if not found. */
export function removeEntry(
  manifest: InstallManifest,
  id: string,
  target: ToolId,
  scope: Scope,
): InstallManifest {
  return {
    installed: manifest.installed.filter(
      (e) => !(e.id === id && e.target === target && e.scope === scope),
    ),
  };
}

/**
 * MAN-REQ-0003 through MAN-REQ-0007: compute display status.
 *
 * Steps:
 * 1. Check installPath on disk.
 *    - Does not exist → check for stale manifest entry → remove if found → 'available'
 * 2. Path exists → check manifest for entry matching id+target+scope.
 *    - Entry found, sourceUrl matches → 'installed'
 *    - Entry found, sourceUrl differs → 'conflict'
 *    - No entry found → 'exists'
 */
export function getArtifactStatus(
  manifest: InstallManifest,
  id: string,
  sourceUrl: string,
  target: ToolId,
  scope: Scope,
  installPath: string,
): ArtifactStatus {
  const pathExists = fs.existsSync(installPath);

  if (!pathExists) {
    // MAN-REQ-0004: stale entry — remove and save
    const entry = manifest.installed.find(
      (e) => e.id === id && e.target === target && e.scope === scope,
    );
    if (entry) {
      const updated = removeEntry(manifest, id, target, scope);
      // Mutate in place so the session's in-memory manifest stays consistent
      manifest.installed.splice(0, manifest.installed.length, ...updated.installed);
      saveManifest(manifest);
    }
    return 'available';
  }

  // MAN-REQ-0005 / MAN-REQ-0006 / MAN-REQ-0007
  const entry = manifest.installed.find(
    (e) => e.id === id && e.target === target && e.scope === scope,
  );

  if (!entry) return 'exists';           // MAN-REQ-0007
  if (entry.sourceUrl === sourceUrl) return 'installed'; // MAN-REQ-0005
  return 'conflict';                     // MAN-REQ-0006
}
