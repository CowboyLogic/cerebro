import type { Artifact, ToolId, Scope, InstallOptions, InstallResult } from './types.js';
import { installArtifact } from '../targets/artifactInstaller.js';
import { logger } from '../utils/logger.js';

export async function installComponent(
  artifact: Artifact,
  tool: ToolId,
  scope: Scope,
  sourceRepo: string,
  workspaceRoot?: string,
  dryRun = false,
): Promise<InstallResult> {
  logger.info(`installComponent  id=${artifact.id}  tool=${tool}  scope=${scope}  dryRun=${dryRun}`);
  return installArtifact({ artifact, tool, scope, sourceRepo, workspaceRoot, dryRun });
}

export async function installMultiple(
  artifacts: Artifact[],
  tool: ToolId,
  scope: Scope,
  sourceRepo: string,
  workspaceRoot?: string,
  dryRun = false,
): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const artifact of artifacts) {
    const result = await installComponent(artifact, tool, scope, sourceRepo, workspaceRoot, dryRun);
    results.push(result);
  }
  return results;
}
