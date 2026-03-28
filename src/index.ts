#!/usr/bin/env node

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import path from 'node:path';
import * as readline from 'node:readline';
import {
  Artifact, DEFAULT_REPOS, ToolId, Scope,
  IDE_DISPLAY_NAMES, ArtifactType,
} from './core/types.js';
import { parseRepoUrl } from './core/github.js';
import { discoverArtifacts } from './core/registry.js';
import { installComponent, installMultiple } from './core/installer.js';
import { findWorkspaceRoot } from './utils/paths.js';
import { theme, icons, banner } from './utils/theme.js';
import { runInteractive } from './ui/interactive.js';
import { logger } from './utils/logger.js';

const program = new Command();

program
  .name('cerebro')
  .description('Install AI components (skills, agents, prompts) from GitHub into your IDE')
  .version('1.0.0')
  .option('--debug', 'Write a detailed debug log to agent-output/cerebro-debug.log');

// Initialise debug logging before any command action runs.
program.hook('preAction', () => {
  if (program.opts().debug) {
    logger.init(path.join(process.cwd(), 'agent-output'));
    console.log(`  Debug log → ${theme.cyan(logger.logPath)}`);
  }
});

// Default: interactive mode when no subcommand is given
program
  .action(async () => {
    await runInteractive();
  });

// Also available as an explicit subcommand
program
  .command('interactive')
  .description('Launch interactive installer UI')
  .action(async () => {
    await runInteractive();
  });

// Browse artifacts in a repo
program
  .command('browse')
  .description('Browse available artifacts in a repository')
  .argument('[repo]', 'GitHub repo (owner/repo or URL)')
  .option('-t, --type <type>', 'Filter by artifact type (skill, agent, prompt, instruction)')
  .action(async (repo, opts) => {
    console.log(theme.muted('[cerebro build: 2026-03-27-v2]'));
    console.log(banner());

    const sources = repo
      ? [parseRepoUrl(repo)]
      : DEFAULT_REPOS;

    for (const source of sources) {
      const s = ora(`Scanning ${theme.cyan(`${source.owner}/${source.repo}`)}...`).start();

      try {
        let artifacts = await discoverArtifacts(source);

        if (opts.type) {
          artifacts = artifacts.filter(a => a.type === opts.type);
        } else if (process.stdin.isTTY && process.stdout.isTTY) {
          artifacts = await promptTypeFilter(artifacts);
        }

        s.succeed(`${theme.brandBold(`${source.owner}/${source.repo}`)} — ${artifacts.length} artifacts`);

        if (artifacts.length === 0) {
          console.log(theme.muted('  No artifacts found.'));
          continue;
        }

        if (!process.stdout.isTTY || !process.stdin.isTTY) {
          renderArtifactGroups(artifacts);
        } else {
          await browsePaginated(artifacts);
        }
      } catch (err) {
        logger.error(`browse command failed  repo=${source.owner}/${source.repo}  ${(err as Error).message}`, (err as Error).stack);
        s.fail(`Failed: ${(err as Error).message}`);
      }
    }

    console.log('');
  });

// Direct install command
program
  .command('install')
  .description('Install an artifact directly')
  .argument('<artifact>', 'Artifact name to install')
  .option('-r, --repo <repo>', 'GitHub repo (owner/repo or URL)')
  .option('-t, --target <tool>', 'Target tool (claude-code, opencode, copilot)', 'claude-code')
  .option('-s, --scope <scope>', 'Installation scope (global, workspace)', 'workspace')
  .option('--dry-run', 'Preview without installing', false)
  .action(async (artifactName, opts) => {
    console.log(banner());

    const sources = opts.repo
      ? [parseRepoUrl(opts.repo)]
      : DEFAULT_REPOS;

    const tool = opts.target as ToolId;
    const scope = opts.scope as Scope;
    const workspaceRoot = findWorkspaceRoot() || undefined;

    const s = ora().start();

    for (const source of sources) {
      s.text = `Searching for "${artifactName}" in ${source.owner}/${source.repo}...`;
      const sourceRepo = `${source.owner}/${source.repo}`;

      try {
        const artifacts = await discoverArtifacts(source);
        const matches = artifacts.filter(a =>
          a.name.toLowerCase().includes(artifactName.toLowerCase())
        );

        if (matches.length === 0) {
          s.text = theme.muted(`Not found in ${source.owner}/${source.repo}`);
          continue;
        }

        s.succeed(`Found ${matches.length} match${matches.length > 1 ? 'es' : ''}`);

        for (const artifact of matches) {
          const installSpinner = ora().start();
          const prefix = opts.dryRun ? '[dry-run] ' : '';
          installSpinner.text = `${prefix}Installing ${theme.cyan(artifact.name)} → ${IDE_DISPLAY_NAMES[tool]}...`;

          const result = await installComponent(artifact, tool, scope, sourceRepo, workspaceRoot, opts.dryRun);

          if (result.success) {
            installSpinner.succeed(`${prefix}${theme.success(artifact.name)} installed`);
            for (const f of result.installedFiles) {
              console.log(`  ${theme.muted(f)}`);
            }
          } else {
            installSpinner.fail(`${theme.error(artifact.name)}: ${result.errors.join(', ')}`);
          }
        }
        return; // Found and installed, done
      } catch (err) {
        logger.error(`install command failed  artifact=${artifactName}  repo=${source.owner}/${source.repo}  ${(err as Error).message}`, (err as Error).stack);
        s.fail(`Error: ${(err as Error).message}`);
      }
    }

    s.stop();
    console.error(chalk.red(`Artifact "${artifactName}" not found in any repository.`));
  });

// List supported tools
program
  .command('targets')
  .description('Show supported tool targets')
  .action(() => {
    console.log(banner());
    console.log(theme.bold('  Supported Tool Targets:\n'));

    const targets: [ToolId, string, string][] = [
      ['claude-code',    '🧠', 'Skills, agents, prompts, and CLAUDE.md instructions'],
      ['copilot',        '🤖', 'Copilot instructions, agents, and snippets'],
      ['opencode',       '💻', 'Agents, prompts, and instructions'],
      ['visual-studio',  '🔷', 'Extensions and instructions for Visual Studio'],
      ['intellij',       '🧩', 'Extensions and instructions for IntelliJ IDEA'],
    ];

    for (const [id, icon, desc] of targets) {
      console.log(`  ${icon} ${theme.brandBold(IDE_DISPLAY_NAMES[id])} ${theme.muted(`(${id})`)}`);
      console.log(`     ${theme.muted(desc)}\n`);
    }
  });

// Skip auto-parse when running under Vitest — tests import this module and
// call program.parseAsync() manually with their own mock arguments.
if (!process.env.VITEST) {
  process.on('uncaughtException', (err) => {
    logger.error(`[FATAL] uncaughtException  ${err.message}`, err.stack);
    console.error(chalk.red(`\n[cerebro] Unexpected error: ${err.message}`));
    if (logger.active) console.error(chalk.dim(`  See ${logger.logPath} for the full stack trace.`));
    try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch { /* ignore */ }
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logger.error(`[FATAL] unhandledRejection  ${msg}`, stack);
    console.error(chalk.red(`\n[cerebro] Unhandled async error: ${msg}`));
    if (logger.active) console.error(chalk.dim(`  See ${logger.logPath} for the full stack trace.`));
    try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch { /* ignore */ }
    process.exit(1);
  });

  program.parseAsync().catch((err) => {
    logger.error(`program.parseAsync threw  ${(err as Error).message}`, (err as Error).stack);
    console.error(err);
    process.exit(1);
  });
}

export { program };

function getTypeIcon(type: ArtifactType): string {
  const map: Record<string, string> = {
    skill: '🎯', agent: '🤖', prompt: '💬',
    instruction: '📋', snippet: '✂️', workflow: '🔄',
    hook: '🪝', 'mcp-server': '🔌', other: '📄',
  };
  return map[type] || '📄';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderArtifactGroups(artifacts: Artifact[]): void {
  const TYPE_ORDER: ArtifactType[] = ['agent', 'instruction', 'prompt', 'skill', 'snippet', 'workflow', 'hook', 'mcp-server', 'other'];
  const grouped = new Map<string, Artifact[]>();

  for (const a of artifacts) {
    if (!grouped.has(a.type)) grouped.set(a.type, []);
    grouped.get(a.type)!.push(a);
  }

  for (const items of grouped.values()) {
    items.sort((a, b) => a.name.localeCompare(b.name));
  }

  const orderedTypes = [
    ...TYPE_ORDER.filter(t => grouped.has(t)),
    ...[...grouped.keys()].filter(t => !TYPE_ORDER.includes(t as ArtifactType)),
  ];

  for (const type of orderedTypes) {
    const items = grouped.get(type)!;
    const icon = getTypeIcon(type as ArtifactType);
    console.log(`\n  ${icon} ${theme.bold(capitalize(type) + 's')} ${theme.muted(`(${items.length})`)}`);
    console.log(`  ${theme.brand('─'.repeat(40))}`);
    for (const item of items) {
      const tools = [...new Set(item.compatibility.map(c => c.tool))].map(t => IDE_DISPLAY_NAMES[t]).join(', ');
      console.log(`  ${icons.arrow} ${theme.white(item.name)}`);
      console.log(`    ${theme.muted(item.description ?? '')}`);
      console.log(`    ${theme.dim('Tools:')} ${theme.cyan(tools)}`);
    }
  }
}

async function promptTypeFilter(artifacts: Artifact[]): Promise<Artifact[]> {
  const TYPE_ORDER: ArtifactType[] = ['agent', 'instruction', 'prompt', 'skill', 'snippet', 'workflow', 'hook', 'mcp-server', 'other'];
  const typeCounts = new Map<ArtifactType, number>();

  for (const artifact of artifacts) {
    typeCounts.set(artifact.type, (typeCounts.get(artifact.type) ?? 0) + 1);
  }

  const presentTypes = TYPE_ORDER.filter(type => typeCounts.has(type));

  if (presentTypes.length <= 1) {
    return artifacts;
  }

  const lines: string[] = [];
  lines.push(`  ${theme.muted('0)')} All Types (${artifacts.length})`);
  presentTypes.forEach((type, index) => {
    lines.push(`  ${theme.muted(`${index + 1})`)} ${getTypeIcon(type)} ${capitalize(type)}s (${typeCounts.get(type)})`);
  });

  console.log('');
  console.log(theme.brand('  Select artifact type:'));
  lines.forEach(line => console.log(line));
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let choice = -1;

  while (true) {
    const answer = await new Promise<string>(resolve => {
      rl.question(`  Enter number (0-${presentTypes.length}): `, resolve);
    });
    const parsed = parseInt(answer.trim(), 10);

    if (!isNaN(parsed) && parsed >= 0 && parsed <= presentTypes.length) {
      choice = parsed;
      break;
    }

    console.log(theme.muted(`  Please enter a number between 0 and ${presentTypes.length}`));
  }

  rl.close();

  if (choice === 0) {
    return artifacts;
  }

  const selectedType = presentTypes[choice - 1];
  return artifacts.filter(artifact => artifact.type === selectedType);
}

async function browsePaginated(artifacts: Artifact[]): Promise<void> {
  // Approx lines per artifact: 1 name + 1 description + 1 tools + 1 blank = 4 lines
  // Plus group headers (~1 line per type group). Reserve 8 lines for footer/separator/padding.
  const termHeight = process.stdout.rows ?? 24;
  const LINES_PER_ITEM = 4;
  const RESERVED_LINES = 8;
  const PAGE_SIZE = Math.max(5, Math.floor((termHeight - RESERVED_LINES) / LINES_PER_ITEM));
  const MAX_SEARCH_LENGTH = 200;
  const baseArtifacts = artifacts;
  let filtered = artifacts;
  let pageIndex = 0;

  console.log('');

  while (true) {
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (pageIndex >= pageCount) pageIndex = pageCount - 1;

    // Clear terminal for clean page render
    process.stdout.write('\x1b[2J\x1b[H');
    console.log(`  ${theme.muted(`── Page ${pageIndex + 1} of ${pageCount} ──`)}`);
    console.log('');

    const start = pageIndex * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);
    renderArtifactGroups(pageItems);

    const isLastPage = pageIndex >= pageCount - 1;
    console.log(`  ${theme.muted('─'.repeat(55))}`);
    console.log(isLastPage
      ? `  ${theme.muted('[S] search   [Q] quit   (end of list)')}`
      : `  ${theme.muted('[N] next page   [S] search   [Q] quit')}`);
    console.log(`  ${theme.muted('─'.repeat(55))}`);

    const cmd = await readCommand('  Command: ');
    if (cmd === 'q' || cmd === '') {
      return;
    }

    if (cmd === 'n' && !isLastPage) {
      pageIndex += 1;
      continue;
    }

    if (cmd === 's') {
      while (true) {
        const query = await readCommand('  Search (name or description): ');
        const sanitized = query.trim().slice(0, MAX_SEARCH_LENGTH);
        if (!sanitized) {
          filtered = baseArtifacts;
          pageIndex = 0;
          break;
        }

        const lowered = sanitized.toLowerCase();
        const nextFiltered = baseArtifacts.filter(artifact => {
          const name = artifact.name.toLowerCase();
          const description = (artifact.description ?? '').toLowerCase();
          return name.includes(lowered) || description.includes(lowered);
        });

        if (nextFiltered.length === 0) {
          console.log(`  ${theme.warning('No matches found.')}`);
          continue;
        }

        filtered = nextFiltered;
        pageIndex = 0;
        break;
      }
    }

    continue;
  }
}

async function readCommand(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const answer = await new Promise<string>(resolve => rl.question(prompt, resolve));
    return answer.trim().toLowerCase();
  } finally {
    rl.close();
  }
}
