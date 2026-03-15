#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import {
  DEFAULT_REPOS, TargetIDE, Scope,
  IDE_DISPLAY_NAMES, ComponentType,
} from './core/types.js';
import { parseRepoUrl } from './core/github.js';
import { discoverComponents } from './core/registry.js';
import { installComponent, installMultiple } from './core/installer.js';
import { findWorkspaceRoot } from './utils/paths.js';
import { theme, icons, banner } from './utils/theme.js';
import { runInteractive } from './ui/interactive.js';

const program = new Command();

program
  .name('ai-install')
  .description('Install AI components (skills, agents, prompts) from GitHub into your IDE')
  .version('1.0.0');

// Default: interactive mode
program
  .command('interactive', { isDefault: true })
  .description('Launch interactive installer UI')
  .action(async () => {
    await runInteractive();
  });

// Browse components in a repo
program
  .command('browse')
  .description('Browse available components in a repository')
  .argument('[repo]', 'GitHub repo (owner/repo or URL)')
  .option('-t, --type <type>', 'Filter by component type (skill, agent, prompt, instruction)')
  .action(async (repo, opts) => {
    console.log(banner());

    const sources = repo
      ? [parseRepoUrl(repo)]
      : DEFAULT_REPOS;

    for (const source of sources) {
      const s = p.spinner();
      s.start(`Scanning ${theme.cyan(`${source.owner}/${source.repo}`)}...`);

      try {
        let components = await discoverComponents(source);

        if (opts.type) {
          components = components.filter(c => c.type === opts.type);
        }

        s.stop(`${icons.check} ${theme.brandBold(`${source.owner}/${source.repo}`)} — ${components.length} components`);

        if (components.length === 0) {
          p.log.warn('  No components found.');
          continue;
        }

        // Group by type, sorted alphabetically within each group
        const TYPE_ORDER: ComponentType[] = ['agent', 'instruction', 'prompt', 'skill', 'snippet', 'workflow', 'unknown'];
        const grouped = new Map<string, typeof components>();
        for (const c of components) {
          if (!grouped.has(c.type)) grouped.set(c.type, []);
          grouped.get(c.type)!.push(c);
        }
        // Sort components within each group alphabetically
        for (const items of grouped.values()) {
          items.sort((a, b) => a.name.localeCompare(b.name));
        }
        // Render in defined type order, then any remaining types
        const orderedTypes = [
          ...TYPE_ORDER.filter(t => grouped.has(t)),
          ...[...grouped.keys()].filter(t => !TYPE_ORDER.includes(t as ComponentType)),
        ];

        for (const type of orderedTypes) {
          const items = grouped.get(type)!;
          const icon = getTypeIcon(type as ComponentType);
          console.log(`\n  ${icon} ${theme.bold(capitalize(type) + 's')} ${theme.muted(`(${items.length})`)}`);
          console.log(`  ${theme.brand('─'.repeat(40))}`);
          for (const item of items) {
            const targets = item.compatibleTargets.map(t => IDE_DISPLAY_NAMES[t]).join(', ');
            console.log(`  ${icons.arrow} ${theme.white(item.name)}`);
            console.log(`    ${theme.muted(item.description)}`);
            console.log(`    ${theme.dim('Targets:')} ${theme.cyan(targets)}`);
          }
        }
      } catch (err) {
        s.stop(`${icons.cross} Failed: ${(err as Error).message}`);
      }
    }

    console.log('');
  });

// Direct install command
program
  .command('install')
  .description('Install a component directly')
  .argument('<component>', 'Component name to install')
  .option('-r, --repo <repo>', 'GitHub repo (owner/repo or URL)')
  .option('-t, --target <ide>', 'Target IDE (claude-code, opencode, vscode, copilot)', 'claude-code')
  .option('-s, --scope <scope>', 'Installation scope (user, workspace)', 'workspace')
  .option('--dry-run', 'Preview without installing', false)
  .action(async (componentName, opts) => {
    console.log(banner());

    const sources = opts.repo
      ? [parseRepoUrl(opts.repo)]
      : DEFAULT_REPOS;

    const target = opts.target as TargetIDE;
    const scope = opts.scope as Scope;
    const workspaceRoot = findWorkspaceRoot() || undefined;

    const s = p.spinner();

    for (const source of sources) {
      s.start(`Searching for "${componentName}" in ${source.owner}/${source.repo}...`);

      try {
        const components = await discoverComponents(source);
        const matches = components.filter(c =>
          c.name.toLowerCase().includes(componentName.toLowerCase())
        );

        if (matches.length === 0) {
          s.stop(`${theme.muted('Not found in')} ${source.owner}/${source.repo}`);
          continue;
        }

        s.stop(`${icons.check} Found ${matches.length} match${matches.length > 1 ? 'es' : ''}`);

        for (const comp of matches) {
          const installSpinner = p.spinner();
          const prefix = opts.dryRun ? '[dry-run] ' : '';
          installSpinner.start(`${prefix}Installing ${theme.cyan(comp.name)} → ${IDE_DISPLAY_NAMES[target]}...`);

          const result = await installComponent(comp, target, scope, workspaceRoot, opts.dryRun);

          if (result.success) {
            installSpinner.stop(`${icons.check} ${prefix}${theme.success(comp.name)} installed`);
            for (const f of result.installedFiles) {
              p.log.info(`  ${theme.muted(f)}`);
            }
          } else {
            installSpinner.stop(`${icons.cross} ${theme.error(comp.name)}: ${result.errors.join(', ')}`);
          }
        }
        return; // Found and installed, done
      } catch (err) {
        s.stop(`${icons.cross} Error: ${(err as Error).message}`);
      }
    }

    p.log.error(`Component "${componentName}" not found in any repository.`);
  });

// List supported targets
program
  .command('targets')
  .description('Show supported IDE targets')
  .action(() => {
    console.log(banner());
    console.log(theme.bold('  Supported IDE Targets:\n'));

    const targets: [TargetIDE, string, string][] = [
      ['claude-code', '🧠', 'Skills, agents, prompts, and CLAUDE.md instructions'],
      ['vscode', '🔷', 'Copilot instructions, snippets, and extensions'],
      ['copilot', '🤖', 'Copilot CLI instructions and agents'],
      ['opencode', '💻', 'Agents, prompts, and instructions'],
    ];

    for (const [id, icon, desc] of targets) {
      console.log(`  ${icon} ${theme.brandBold(IDE_DISPLAY_NAMES[id])} ${theme.muted(`(${id})`)}`);
      console.log(`     ${theme.muted(desc)}\n`);
    }
  });

// Only auto-parse when executed directly (not when imported in tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  program.parse();
}

export { program };

function getTypeIcon(type: ComponentType): string {
  const map: Record<string, string> = {
    skill: '🎯', agent: '🤖', prompt: '💬',
    instruction: '📋', snippet: '✂️', workflow: '🔄', unknown: '📄',
  };
  return map[type] || '📄';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
