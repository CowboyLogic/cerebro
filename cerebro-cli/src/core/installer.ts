import { Component, InstallOptions, InstallResult, TargetIDE, Scope } from './types.js';
import { getFileContents } from './github.js';
import { getInstaller } from '../targets/index.js';
import { logger } from '../utils/logger.js';

export async function installComponent(
  component: Component,
  target: TargetIDE,
  scope: Scope,
  workspaceRoot?: string,
  dryRun = false,
): Promise<InstallResult> {
  logger.info(`installComponent  name=${component.name}  target=${target}  scope=${scope}  dryRun=${dryRun}`);
  logger.debug(`installComponent files`, component.files.map(f => f.path));

  // Fetch file contents if not already loaded
  const filePaths = component.files.map(f => f.path);
  const filesWithContent = await getFileContents(component.source, filePaths);

  // Merge content into component
  const enrichedComponent: Component = {
    ...component,
    files: filesWithContent,
  };

  let installer: ReturnType<typeof getInstaller>;
  try {
    installer = getInstaller(target);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`installComponent unknown target  name=${component.name}  target=${target}`, message);
    return { success: false, component, target, scope, installedFiles: [], errors: [message] };
  }
  const options: InstallOptions = {
    component: enrichedComponent,
    target,
    scope,
    workspaceRoot,
    dryRun,
  };

  const result = await installer.install(options);
  if (result.success) {
    logger.info(`installComponent success  files=${result.installedFiles.length}`, result.installedFiles);
  } else {
    logger.error(`installComponent failed  name=${component.name}`, result.errors);
  }
  return result;
}

export async function installMultiple(
  components: Component[],
  target: TargetIDE,
  scope: Scope,
  workspaceRoot?: string,
  dryRun = false,
): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const component of components) {
    const result = await installComponent(component, target, scope, workspaceRoot, dryRun);
    results.push(result);
  }
  return results;
}
