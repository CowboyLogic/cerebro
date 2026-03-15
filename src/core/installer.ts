import { Component, InstallOptions, InstallResult, TargetIDE, Scope } from './types.js';
import { getFileContents } from './github.js';
import { getInstaller } from '../targets/index.js';

export async function installComponent(
  component: Component,
  target: TargetIDE,
  scope: Scope,
  workspaceRoot?: string,
  dryRun = false,
): Promise<InstallResult> {
  // Fetch file contents if not already loaded
  const filePaths = component.files.map(f => f.path);
  const filesWithContent = await getFileContents(component.source, filePaths);

  // Merge content into component
  const enrichedComponent: Component = {
    ...component,
    files: filesWithContent,
  };

  const installer = getInstaller(target);
  const options: InstallOptions = {
    component: enrichedComponent,
    target,
    scope,
    workspaceRoot,
    dryRun,
  };

  return installer.install(options);
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
