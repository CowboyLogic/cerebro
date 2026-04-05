/**
 * SPEC-0006 — Installer
 *
 * Installs a single artifact from a source repository to the local machine.
 * The only module that writes to the filesystem outside of ~/.config/cerebro/.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Artifact, ToolId, Scope } from '@cowboylogic/cerebro-schema';
import { resolveInstallBase, type CerebroConfig } from './config.js';
import { recordInstall, saveManifest, type InstallManifest, type InstalledEntry } from './manifest.js';
import type { SourceProvider } from './provider.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface InstallOptions {
  overwrite: boolean;
}

export type InstallOutcome =
  | { status: 'success'; installedPath: string }
  | { status: 'skipped'; reason: 'exists' | 'conflict' | 'unsupported-target' }
  | { status: 'error'; message: string };

// ---------------------------------------------------------------------------
// Baseline file protection (INS-REQ-0006)
// ---------------------------------------------------------------------------

const BASELINE_FILENAMES = new Set(['claude.md', 'agents.md', 'copilot-instructions.md']);

function isBaselineFile(filePath: string): boolean {
  return BASELINE_FILENAMES.has(path.basename(filePath).toLowerCase());
}

// ---------------------------------------------------------------------------
// Path confinement
// ---------------------------------------------------------------------------

function assertConfined(base: string, target: string): void {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  if (
    resolvedTarget !== resolvedBase &&
    !resolvedTarget.startsWith(resolvedBase + path.sep)
  ) {
    throw Object.assign(
      new Error(`Path confinement violation: '${target}' escapes '${base}'`),
      { code: 'PATH_CONFINEMENT' },
    );
  }
}

// ---------------------------------------------------------------------------
// Install helpers
// ---------------------------------------------------------------------------

/** INS-REQ-0007: skill — download entire directory tree */
async function installSkill(
  provider: SourceProvider,
  owner: string,
  repo: string,
  artifact: Artifact,
  installBase: string,
): Promise<string> {
  const dest = path.join(installBase, artifact.id);

  assertConfined(installBase, dest);

  // INS-REQ-0013: atomic — download to temp dir, then rename
  const tmpDest = `${dest}.tmp-${Date.now()}`;

  await provider.downloadDirectory(owner, repo, artifact.source, tmpDest);

  fs.mkdirSync(installBase, { recursive: true });
  fs.renameSync(tmpDest, dest);

  return dest;
}

/** INS-REQ-0008: instruction — download single file */
async function installInstruction(
  provider: SourceProvider,
  owner: string,
  repo: string,
  artifact: Artifact,
  installBase: string,
): Promise<string> {
  const filename = path.basename(artifact.source);
  const dest = path.join(installBase, filename);

  assertConfined(installBase, dest);

  // INS-REQ-0006: never write to baseline files
  if (isBaselineFile(dest)) {
    throw Object.assign(
      new Error(`Refusing to write to baseline file: '${filename}'`),
      { code: 'BASELINE_FILE' },
    );
  }

  // INS-REQ-0009: create parent dirs
  fs.mkdirSync(installBase, { recursive: true });

  await provider.downloadFile(owner, repo, artifact.source, dest);

  return dest;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function installArtifact(
  artifact: Artifact,
  sourceOwner: string,
  sourceRepo: string,
  tool: ToolId,
  scope: Scope,
  config: CerebroConfig,
  manifest: InstallManifest,
  provider: SourceProvider,
  options: InstallOptions,
): Promise<InstallOutcome> {
  try {
    // INS-REQ-0001: supports check
    if (artifact.supports && !artifact.supports.includes(tool)) {
      return { status: 'skipped', reason: 'unsupported-target' };
    }

    // INS-REQ-0014: only skill and instruction supported in MVP
    if (artifact.type !== 'skill' && artifact.type !== 'instruction') {
      return { status: 'skipped', reason: 'unsupported-target' };
    }

    // INS-REQ-0002: always use resolveInstallBase
    const installBase = resolveInstallBase(config, tool, artifact.type, scope);

    // Compute destination path for the overwrite check
    let destPath: string;
    if (artifact.type === 'skill') {
      destPath = path.join(installBase, artifact.id);
    } else {
      destPath = path.join(installBase, path.basename(artifact.source));
    }

    // INS-REQ-0006: baseline file protection (check for instructions before write)
    if (artifact.type === 'instruction' && isBaselineFile(destPath)) {
      return {
        status: 'error',
        message: `Refusing to write to baseline file: '${path.basename(destPath)}'`,
      };
    }

    // INS-REQ-0003: path confinement pre-check
    try {
      assertConfined(installBase, destPath);
    } catch (err) {
      return {
        status: 'error',
        message: `Path confinement violation: destination escapes install base. ${(err as Error).message}`,
      };
    }

    // INS-REQ-0004: if dest exists and overwrite is false, skip
    if (fs.existsSync(destPath)) {
      if (!options.overwrite) {
        return { status: 'skipped', reason: 'exists' };
      }
      // INS-REQ-0005: remove existing before writing
      fs.rmSync(destPath, { recursive: true, force: true });
    }

    // Perform the install
    let installedPath: string;
    if (artifact.type === 'skill') {
      installedPath = await installSkill(
        provider, sourceOwner, sourceRepo, artifact, installBase,
      );
    } else {
      installedPath = await installInstruction(
        provider, sourceOwner, sourceRepo, artifact, installBase,
      );
    }

    // INS-REQ-0010: record in manifest and save
    const entry: InstalledEntry = {
      id: artifact.id,
      name: artifact.name,
      type: artifact.type,
      sourceUrl: `https://github.com/${sourceOwner}/${sourceRepo}`,
      target: tool,
      scope,
      installedPath,
      installedAt: new Date().toISOString(),
    };
    const updatedManifest = recordInstall(manifest, entry);
    // Mutate in place so the session's in-memory manifest stays consistent
    // (same pattern used in getArtifactStatus for stale-entry cleanup)
    manifest.installed.splice(0, manifest.installed.length, ...updatedManifest.installed);
    saveManifest(manifest);

    return { status: 'success', installedPath };
  } catch (err) {
    // INS-REQ-0011: clean up partial writes on error (rmSync with force:true is safe on missing paths)
    try {
      const installBase = resolveInstallBase(config, tool, artifact.type as 'skill' | 'instruction', scope);
      if (artifact.type === 'skill') {
        const destPath = path.join(installBase, artifact.id);
        // Always attempt removal — force:true makes this safe if path doesn't exist
        fs.rmSync(destPath, { recursive: true, force: true });
        // Also clean up any .tmp- staging directories
        try {
          if (fs.existsSync(installBase)) {
            const tmpDirs = fs.readdirSync(installBase).filter(
              (f) => f.startsWith(`${artifact.id}.tmp-`),
            );
            for (const d of tmpDirs) {
              fs.rmSync(path.join(installBase, d), { recursive: true, force: true });
            }
          }
        } catch {
          // best-effort
        }
      }
    } catch {
      // best-effort cleanup
    }

    // INS-REQ-0012: return error object, never throw
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
