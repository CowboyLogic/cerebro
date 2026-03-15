import * as p from '@clack/prompts';
import chalk from 'chalk';
import {
  Component, TargetIDE, Scope, RepoSource,
  DEFAULT_REPOS, IDE_DISPLAY_NAMES, InstallResult,
} from '../core/types.js';
import { parseRepoUrl } from '../core/github.js';
import { discoverComponents } from '../core/registry.js';
import { installComponent } from '../core/installer.js';
import { findWorkspaceRoot } from '../utils/paths.js';
import { theme, icons, banner, resultBox } from '../utils/theme.js';

const TYPE_ICONS: Record<string, string> = {
  skill: '🎯',
  agent: '🤖',
  prompt: '💬',
  instruction: '📋',
  snippet: '✂️',
  workflow: '🔄',
  unknown: '📄',
};

export async function runInteractive(): Promise<void> {
  console.log(banner());

  p.intro(theme.brandBold('Welcome! Let\'s install some AI components.'));

  // Step 1: Choose repository source
  const repoChoice = await p.select({
    message: 'Where would you like to browse components?',
    options: [
      {
        value: 'awesome-copilot',
        label: `${icons.star} github/awesome-copilot`,
        hint: 'Curated Copilot extensions & prompts',
      },
      {
        value: 'anthropic-skills',
        label: `${icons.sparkles} anthropics/skills`,
        hint: 'Official Claude Code skills',
      },
      {
        value: 'custom',
        label: `${icons.globe} Custom repository`,
        hint: 'Enter a GitHub URL or owner/repo',
      },
    ],
  });

  if (p.isCancel(repoChoice)) { p.cancel('Cancelled.'); process.exit(0); }

  let source: RepoSource;
  if (repoChoice === 'custom') {
    const repoInput = await p.text({
      message: 'Enter GitHub repository (owner/repo or URL):',
      placeholder: 'e.g., github/awesome-copilot',
      validate: (val) => {
        try { parseRepoUrl(val); return undefined; }
        catch { return 'Invalid format. Use owner/repo or a GitHub URL.'; }
      },
    });
    if (p.isCancel(repoInput)) { p.cancel('Cancelled.'); process.exit(0); }
    source = parseRepoUrl(repoInput as string);
  } else if (repoChoice === 'awesome-copilot') {
    source = DEFAULT_REPOS[0];
  } else {
    source = DEFAULT_REPOS[1];
  }

  // Step 2: Discover components
  const s = p.spinner();
  s.start(`Scanning ${theme.cyan(`${source.owner}/${source.repo}`)} for components...`);

  let components: Component[];
  try {
    components = await discoverComponents(source);
  } catch (err) {
    s.stop(`${icons.cross} Failed to scan repository`);
    p.log.error((err as Error).message);
    process.exit(1);
  }

  if (components.length === 0) {
    s.stop(`${icons.cross} No components found`);
    p.log.warn('No installable components were found in this repository.');
    p.log.info('The repository may use a different structure. Try a different repo.');
    process.exit(0);
  }

  s.stop(`${icons.check} Found ${theme.brandBold(String(components.length))} components`);

  // Show summary by type
  const typeCounts = components.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const summaryParts = Object.entries(typeCounts)
    .map(([type, count]) => `${TYPE_ICONS[type] || '📄'} ${count} ${type}${count > 1 ? 's' : ''}`)
    .join('  ');
  p.log.info(summaryParts);

  // Step 3: Select components to install — grouped by type, alphabetical within each group
  const TYPE_ORDER = ['agent', 'instruction', 'prompt', 'skill', 'snippet', 'workflow', 'unknown'];
  const grouped = new Map<string, Component[]>();
  for (const c of components) {
    if (!grouped.has(c.type)) grouped.set(c.type, []);
    grouped.get(c.type)!.push(c);
  }
  for (const items of grouped.values()) {
    items.sort((a, b) => a.name.localeCompare(b.name));
  }
  const orderedTypes = [
    ...TYPE_ORDER.filter(t => grouped.has(t)),
    ...[...grouped.keys()].filter(t => !TYPE_ORDER.includes(t)),
  ];

  const componentChoices: { value: Component; label: string; hint?: string }[] = [];
  for (const type of orderedTypes) {
    const items = grouped.get(type)!;
    const icon = TYPE_ICONS[type] || '📄';
    // Group header as a non-selectable spacer row
    componentChoices.push({
      value: null as unknown as Component,
      label: theme.brand(`${icon} ${capitalize(type)}s`) + theme.muted(` (${items.length})`),
    });
    for (const c of items) {
      componentChoices.push({
        value: c,
        label: `   ${theme.white(c.name)}`,
        hint: truncate(c.description, 55),
      });
    }
  }

  const selected = await p.multiselect({
    message: 'Select components to install:',
    options: componentChoices,
    required: true,
  });

  if (p.isCancel(selected)) { p.cancel('Cancelled.'); process.exit(0); }
  // Filter out any spacer entries (null values used as visual separators)
  const selectedComponents = (selected as Component[]).filter(Boolean);

  // Step 4: Choose target IDE
  const targetOptions = getAvailableTargets(selectedComponents);
  const targetChoice = await p.select({
    message: 'Install into which IDE?',
    options: targetOptions.map(t => ({
      value: t,
      label: `${getIDEIcon(t)} ${IDE_DISPLAY_NAMES[t]}`,
    })),
  });

  if (p.isCancel(targetChoice)) { p.cancel('Cancelled.'); process.exit(0); }
  const target = targetChoice as TargetIDE;

  // Step 5: Choose scope
  const workspaceRoot = findWorkspaceRoot();
  const scopeChoice = await p.select({
    message: 'Installation scope:',
    options: [
      {
        value: 'user' as Scope,
        label: `${icons.shield} User (global)`,
        hint: 'Available in all projects',
      },
      {
        value: 'workspace' as Scope,
        label: `${icons.folder} Workspace`,
        hint: workspaceRoot
          ? `Install in ${workspaceRoot}`
          : 'Current directory (no git repo found)',
      },
    ],
  });

  if (p.isCancel(scopeChoice)) { p.cancel('Cancelled.'); process.exit(0); }
  const scope = scopeChoice as Scope;

  // Step 6: Confirm
  p.log.step(theme.bold('\n  Installation Summary'));
  p.log.message(`  ${theme.muted('Components:')} ${selectedComponents.map(c => theme.cyan(c.name)).join(', ')}`);
  p.log.message(`  ${theme.muted('Target:')}     ${IDE_DISPLAY_NAMES[target]}`);
  p.log.message(`  ${theme.muted('Scope:')}      ${scope === 'user' ? 'User (global)' : 'Workspace'}`);
  p.log.message(`  ${theme.muted('Source:')}     ${source.owner}/${source.repo}`);

  const confirm = await p.confirm({
    message: 'Proceed with installation?',
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Installation cancelled.');
    process.exit(0);
  }

  // Step 7: Install
  const installSpinner = p.spinner();
  const results: InstallResult[] = [];

  for (const comp of selectedComponents) {
    installSpinner.start(`Installing ${theme.cyan(comp.name)}...`);
    try {
      const result = await installComponent(comp, target, scope, workspaceRoot || undefined);
      results.push(result);
      if (result.success) {
        installSpinner.stop(`${icons.check} ${theme.success(comp.name)} installed`);
      } else {
        installSpinner.stop(`${icons.cross} ${theme.error(comp.name)} failed: ${result.errors.join(', ')}`);
      }
    } catch (err) {
      installSpinner.stop(`${icons.cross} ${theme.error(comp.name)} error: ${(err as Error).message}`);
      results.push({
        success: false,
        component: comp,
        target,
        scope,
        installedFiles: [],
        errors: [(err as Error).message],
      });
    }
  }

  // Step 8: Show results
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log('');
  if (successCount > 0) {
    const successItems = results
      .filter(r => r.success)
      .flatMap(r => r.installedFiles.map(f => `  ${icons.check} ${theme.muted(f)}`));
    console.log(resultBox('Installation Complete', [
      `${successCount} component${successCount > 1 ? 's' : ''} installed successfully`,
      ...successItems.slice(0, 10),
      ...(successItems.length > 10 ? [`  ${theme.muted(`... and ${successItems.length - 10} more`)}`] : []),
    ]));
  }

  if (failCount > 0) {
    p.log.error(`${failCount} component${failCount > 1 ? 's' : ''} failed to install.`);
    for (const r of results.filter(r => !r.success)) {
      p.log.error(`  ${r.component.name}: ${r.errors.join(', ')}`);
    }
  }

  p.outro(theme.brandBold('Done! Happy coding! ') + icons.rocket);
}

function getAvailableTargets(components: Component[]): TargetIDE[] {
  const all: Set<TargetIDE> = new Set();
  for (const c of components) {
    for (const t of c.compatibleTargets) all.add(t);
  }
  // Always show all IDEs, but compatible ones first
  const ordered: TargetIDE[] = ['claude-code', 'vscode', 'copilot', 'opencode'];
  return ordered.filter(t => all.has(t)).concat(ordered.filter(t => !all.has(t)));
}

function getIDEIcon(ide: TargetIDE): string {
  const icons: Record<TargetIDE, string> = {
    'claude-code': '🧠',
    'opencode': '💻',
    'vscode': '🔷',
    'copilot': '🤖',
  };
  return icons[ide];
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
