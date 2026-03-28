import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Artifact, CompatibilityEntry, ToolId, Scope, InstallOptions, InstallResult } from '../core/types.js';
import { getFileContent } from '../core/github.js';
import { findWorkspaceRoot, ensureDir } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

/**
 * Resolves the scope-specific base directory.
 * - workspace: the nearest .git root, or cwd as fallback
 * - global: the user's home directory
 */
function resolveBaseDir(scope: Scope, workspaceRoot?: string): string {
  if (scope === 'workspace') {
    return workspaceRoot ?? findWorkspaceRoot() ?? process.cwd();
  }
  return os.homedir();
}

/**
 * Security check: throw if the resolved path escapes the base directory.
 * Prevents path traversal attacks from malicious 'target' values in catalogs.
 */
function assertConfined(baseDir: string, resolvedPath: string): void {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(resolvedPath);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`Security: path "${resolved}" escapes base directory "${base}"`);
  }
  logger.debug(`assertConfined ok  base=${base}  target=${resolved}`);
}

/**
 * Install a single artifact for a given tool and scope.
 *
 * Finds the matching compatibility entry, fetches each source file from GitHub,
 * and writes it to the path declared in the catalog's 'target' field.
 */
export async function installArtifact(options: InstallOptions): Promise<InstallResult> {
  const { artifact, tool, scope, sourceRepo, workspaceRoot, dryRun = false } = options;
  logger.info(`installArtifact  id=${artifact.id}  tool=${tool}  scope=${scope}  dryRun=${dryRun}`);

  const compat = findCompatibility(artifact, tool, scope);
  if (!compat) {
    const msg = `Artifact "${artifact.name}" does not support tool "${tool}" with scope "${scope}"`;
    logger.error(`installArtifact  ${msg}`);
    return { success: false, artifact, tool, scope, installedFiles: [], errors: [msg] };
  }

  const [owner, repo] = sourceRepo.split('/');
  if (!owner || !repo) {
    const msg = `Invalid source repo format: "${sourceRepo}". Expected "owner/repo"`;
    return { success: false, artifact, tool, scope, installedFiles: [], errors: [msg] };
  }

  const baseDir = resolveBaseDir(scope, workspaceRoot);
  const installedFiles: string[] = [];
  const errors: string[] = [];

  for (const file of compat.files) {
    // Validate target path before any I/O
    const absoluteTarget = path.join(baseDir, file.target);
    try {
      assertConfined(baseDir, absoluteTarget);
    } catch (err) {
      errors.push((err as Error).message);
      continue;
    }

    if (dryRun) {
      installedFiles.push(`[dry-run] ${absoluteTarget}`);
      logger.debug(`installArtifact dry-run  target=${absoluteTarget}`);
      continue;
    }

    try {
      const source = { owner, repo };
      const content = await getFileContent(source, file.source);
      ensureDir(path.dirname(absoluteTarget));
      fs.writeFileSync(absoluteTarget, content, 'utf-8');
      installedFiles.push(absoluteTarget);
      logger.debug(`installArtifact wrote  target=${absoluteTarget}  bytes=${content.length}`);
    } catch (err) {
      const msg = `Failed to install "${file.source}" → "${absoluteTarget}": ${(err as Error).message}`;
      errors.push(msg);
      logger.error(`installArtifact error  ${msg}`);
    }
  }

  const success = errors.length === 0 && installedFiles.length > 0;
  if (success) {
    logger.info(`installArtifact success  files=${installedFiles.length}`, installedFiles);
  } else {
    logger.warn(`installArtifact completed with issues`, { installedFiles, errors });
  }

  return { success, artifact, tool, scope, installedFiles, errors };
}

/**
 * Find the compatibility entry for a given tool and scope.
 * Returns undefined if the artifact does not support that combination.
 */
export function findCompatibility(
  artifact: Artifact,
  tool: ToolId,
  scope: Scope,
): CompatibilityEntry | undefined {
  return artifact.compatibility.find(c => c.tool === tool && c.scope.includes(scope));
}

/**
 * Return the list of tools this artifact supports.
 */
export function getSupportedTools(artifact: Artifact): ToolId[] {
  return [...new Set(artifact.compatibility.map(c => c.tool))];
}

/**
 * Return the list of scopes an artifact supports for a given tool.
 */
export function getSupportedScopes(artifact: Artifact, tool: ToolId): Scope[] {
  const entry = artifact.compatibility.find(c => c.tool === tool);
  return entry ? [...entry.scope] : [];
}
