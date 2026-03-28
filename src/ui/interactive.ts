import { select, checkbox, input, confirm, Separator } from '@inquirer/prompts';
import readline from 'node:readline';
import ora from 'ora';
import {
  Artifact, ToolId, Scope, RepoSource,
  DEFAULT_REPOS, IDE_DISPLAY_NAMES, InstallResult,
} from '../core/types.js';
import { parseRepoUrl } from '../core/github.js';
import { discoverArtifacts } from '../core/registry.js';
import { installComponent } from '../core/installer.js';
import { getSupportedTools } from '../targets/artifactInstaller.js';
import { findWorkspaceRoot } from '../utils/paths.js';
import { loadSettings, addCustomRepo, UserSettings } from '../core/settings.js';
import { theme, icons, banner, resultBox, stepBadge, tagLabel, statsLine } from '../utils/theme.js';
import { logger } from '../utils/logger.js';

const BACK = Symbol('back');

const TOOL_TYPE_HINTS: Record<ToolId, string> = {
  'claude-code':   'skills · agents · prompts · instructions · hooks',
  'opencode':      'agents · instructions · prompts',
  'copilot':       'prompts · instructions · agents',
  'visual-studio': 'prompts · instructions',
  'intellij':      'prompts · instructions',
};

// ── wizard steps ─────────────────────────────────────────────────────────────

const Step = {
  REPO:      'repo',
  ARTIFACTS: 'artifacts',
  TOOL:      'tool',
  SCOPE:     'scope',
  CONFIRM:   'confirm',
} as const;
type Step = typeof Step[keyof typeof Step];

const TOTAL_STEPS = 5;

/** Maximum options rendered without a pre-filter step */
const RENDER_MAX = 50;
const PROMPT_WATCHDOG_MS = 5000;
const PROMPT_FREEZE_SUMMARY_MS = 15000;

// ── main entry point ─────────────────────────────────────────────────────────

function printHeader(): void {
  console.log(banner());
  console.log(theme.brandBold('◆') + '  ' + theme.brandBold('Welcome to Cerebro') + theme.muted(' — your AI artifact installer'));
  console.log('');
}

export async function runInteractive(): Promise<void> {
  const settings = loadSettings();

  let source: RepoSource | null = null;
  let cachedArtifacts: Artifact[] = [];
  let cachedSource: RepoSource | null = null;
  let selectedArtifacts: Artifact[] = [];
  let tool: ToolId | null = null;
  let scope: Scope | null = null;

  let step: Step = Step.REPO;

  logger.info('wizard started');

  // ── State-machine loop ────────────────────────────────────────────────────
  while (true) {
    console.clear();
    printHeader();
    logger.debug(`wizard loop  step=${step}`);
    switch (step) {

      // ── Step 1: choose repo ───────────────────────────────────────────────
      case Step.REPO: {
        const choice = await promptRepo(settings);

        if (choice === BACK) {
          logger.info('wizard exit  reason=cancelled-at-repo');
          console.log('\n' + theme.muted('  Cancelled.') + '\n');
          return;
        }

        if (choice === 'custom') {
          const url = await promptCustomUrl();
          if (url === BACK) break;
          source = parseRepoUrl(url as string);
          logger.info(`custom repo parsed  source=${source.owner}/${source.repo}`);
          const updated = addCustomRepo(settings, source);
          settings.customRepos = updated.customRepos;
        } else {
          source = resolveBuiltinSource(choice as string, settings);
          logger.info(`builtin repo resolved  source=${source.owner}/${source.repo}`);
        }

        step = Step.ARTIFACTS;
        break;
      }

      // ── Step 2: discover & select artifacts ──────────────────────────────
      case Step.ARTIFACTS: {
        if (!sourcesEqual(source!, cachedSource)) {
          logger.info(`fetchArtifacts cache-miss  source=${source!.owner}/${source!.repo}`);
          const fetched = await fetchArtifacts(source!);
          if (fetched === null) { step = Step.REPO; break; }
          cachedArtifacts = fetched;
          cachedSource = source;
        } else {
          logger.debug(`fetchArtifacts cache-hit  source=${source!.owner}/${source!.repo}  count=${cachedArtifacts.length}`);
        }

        logger.debug(`prompt:artifacts  totalOptions=${cachedArtifacts.length}`);
        const selected = await promptArtifacts(cachedArtifacts);
        if (selected === BACK) { step = Step.REPO; break; }

        selectedArtifacts = (selected as Artifact[]).filter(Boolean);
        logger.info(`prompt:artifacts  selected=${selectedArtifacts.length}`, selectedArtifacts.map(a => a.id));
        step = Step.TOOL;
        break;
      }

      // ── Step 3: choose target tool ────────────────────────────────────────
      case Step.TOOL: {
        const choice = await promptTool(selectedArtifacts);
        if (choice === BACK) { step = Step.ARTIFACTS; break; }
        tool = choice as ToolId;
        logger.debug(`prompt:tool  choice=${tool}`);
        step = Step.SCOPE;
        break;
      }

      // ── Step 4: choose scope ──────────────────────────────────────────────
      case Step.SCOPE: {
        const choice = await promptScope();
        if (choice === BACK) { step = Step.TOOL; break; }
        scope = choice as Scope;
        logger.debug(`prompt:scope  choice=${scope}`);
        step = Step.CONFIRM;
        break;
      }

      // ── Step 5: confirm & install ─────────────────────────────────────────
      case Step.CONFIRM: {
        const confirmed = await promptConfirm(source!, selectedArtifacts, tool!, scope!);
        if (confirmed === BACK || !confirmed) { step = Step.SCOPE; break; }

        const sourceRepo = `${source!.owner}/${source!.repo}`;
        logger.info(`install begin  artifacts=${selectedArtifacts.length}  tool=${tool}  scope=${scope}`);
        await doInstall(selectedArtifacts, tool!, scope!, sourceRepo);
        logger.info('install complete  prompting continue');

        const next = await promptContinue();
        if (next === BACK || next === 'exit') {
          logger.info('wizard exit  reason=post-install');
          console.log('\n' + theme.brandBold('◆') + '  ' + theme.brandBold('Goodbye!') + theme.muted('  Happy coding  ') + icons.rocket + '\n');
          return;
        }
        if (next === 'same') {
          logger.debug('post-install  continue=same-repo');
          step = Step.ARTIFACTS;
        } else {
          logger.debug('post-install  continue=new-repo');
          step = Step.REPO;
        }
        selectedArtifacts = [];
        tool = null;
        scope = null;
        break;
      }

      default: {
        step = Step.REPO;
        break;
      }
    }
  }
}

// ── prompt helpers ────────────────────────────────────────────────────────────

async function withPromptLogging<T>(
  name: string,
  promptFn: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T | typeof BACK> {
  const startedAt = Date.now();
  let emittedFreezeSummary = false;

  logger.debug(`prompt:${name} enter`, meta ?? {});

  const watchdog = setInterval(() => {
    const elapsedMs = Date.now() - startedAt;
    logger.warn(`prompt:${name} still-waiting`, { elapsedMs, ...(meta ?? {}) });
    if (!emittedFreezeSummary && elapsedMs >= PROMPT_FREEZE_SUMMARY_MS) {
      emittedFreezeSummary = true;
      logger.warn(`prompt:${name} freeze-summary`, {
        prompt: name,
        elapsedMs,
        metaKeys: Object.keys(meta ?? {}),
      });
    }
  }, PROMPT_WATCHDOG_MS);

  try {
    const result = await promptFn();
    logger.debug(`prompt:${name} exit`, {
      elapsedMs: Date.now() - startedAt,
      ...summarizePromptResult(result),
    });
    return result;
  } catch (err) {
    if (err instanceof Error && err.name === 'ExitPromptError') {
      logger.debug(`prompt:${name} cancelled`);
      try {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.pause();
        logger.debug(`prompt:${name} stdin-reset`);
      } catch { /* ignore — non-TTY environments */ }
      return BACK;
    }
    logger.error(`prompt:${name} threw  ${(err as Error).message}`, {
      elapsedMs: Date.now() - startedAt,
      ...(meta ?? {}),
      stack: (err as Error).stack,
    });
    throw err;
  } finally {
    clearInterval(watchdog);
  }
}

function summarizePromptResult(result: unknown): Record<string, unknown> {
  if (Array.isArray(result)) {
    const preview = result.slice(0, 5).map(item => {
      if (item && typeof item === 'object' && 'name' in (item as Record<string, unknown>)) {
        return String((item as { name?: unknown }).name);
      }
      return typeof item;
    });
    return { arrayLength: result.length, preview };
  }
  if (result && typeof result === 'object') return { type: 'object' };
  return { type: typeof result, value: result ?? null };
}

async function promptRepo(settings: UserSettings) {
  const savedOptions = settings.customRepos.map(r => ({
    name: `${icons.star} ${theme.white(`${r.owner}/${r.repo}`)}`,
    value: `saved:${r.owner}/${r.repo}`,
    description: 'Previously used',
  }));

  const choices = [
    {
      name:        `${icons.star} ${theme.white('github/awesome-copilot')}`,
      value:       'awesome-copilot',
      description: 'Curated Copilot extensions & prompts',
    },
    {
      name:        `${icons.sparkles} ${theme.white('anthropics/skills')}`,
      value:       'anthropic-skills',
      description: 'Official Claude Code skills',
    },
    ...savedOptions,
    {
      name:        `${icons.globe} ${theme.white('Custom repository')}`,
      value:       'custom',
      description: 'Enter a GitHub URL or owner/repo',
    },
  ];

  return withPromptLogging('repo-select', () => select({
    message: `${stepBadge(1, TOTAL_STEPS)} Where would you like to browse artifacts?`,
    choices,
  }), { options: choices.length });
}

async function promptCustomUrl() {
  return withPromptLogging('custom-url', () => input({
    message: 'Enter GitHub repository (owner/repo or URL):',
    validate: (val) => {
      if (!val) return 'Invalid format. Use owner/repo or a GitHub URL.';
      try { parseRepoUrl(val); return true; }
      catch { return 'Invalid format. Use owner/repo or a GitHub URL.'; }
    },
  }));
}

async function fetchArtifacts(source: RepoSource): Promise<Artifact[] | null> {
  const spinner = ora(`Scanning ${theme.cyan(`${source.owner}/${source.repo}`)} for artifacts...`).start();

  let artifacts: Artifact[];
  try {
    artifacts = await discoverArtifacts(source);
  } catch (err) {
    const msg = (err as Error).message;
    logger.error(`fetchArtifacts threw  source=${source.owner}/${source.repo}  ${msg}`, (err as Error).stack);
    spinner.fail(`Failed to scan repository: ${msg}`);
    return null;
  }

  if (artifacts.length === 0) {
    spinner.warn(`No artifacts found in ${theme.cyan(`${source.owner}/${source.repo}`)}`);
    console.log(theme.muted('  No installable artifacts were found. Try a different repo.'));
    return null;
  }

  spinner.succeed(`Found ${theme.brandBold(String(artifacts.length))} artifacts in ${theme.cyan(`${source.owner}/${source.repo}`)}`);

  const typeCounts = artifacts.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const summary = Object.entries(typeCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => `${getTypeIcon(type)} ${theme.bold(String(count))} ${theme.muted(type + (count > 1 ? 's' : ''))}`)
    .join('  ');
  console.log('  ' + summary);

  return artifacts;
}

/**
 * Cooked-mode line input that bypasses @inquirer/core's raw-mode lifecycle.
 * Immune to raw-mode state left by the previous prompt on Windows/Node 25.
 */
async function plainLineInput(message: string): Promise<string | typeof BACK> {
  return new Promise<string | typeof BACK>((resolve) => {
    let resolved = false;
    const done = (value: string | typeof BACK) => {
      if (resolved) return;
      resolved = true;
      process.removeListener('SIGINT', sigintHandler);
      resolve(value);
    };

    const sigintHandler = () => {
      process.stdout.write('\n');
      rl.close();
      done(BACK);
    };
    process.once('SIGINT', sigintHandler);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.once('close', () => done(BACK));
    rl.question(message, (answer) => {
      rl.removeAllListeners('close');
      rl.close();
      done(answer.trim());
    });
  });
}

async function promptArtifacts(artifacts: Artifact[]) {
  const TYPE_ORDER = ['agent', 'instruction', 'prompt', 'skill', 'snippet', 'workflow', 'hook', 'mcp-server', 'other'];
  const largeList = artifacts.length > RENDER_MAX;

  let isRedoSearch = false;
  while (true) {
    if (isRedoSearch) {
      console.clear();
      printHeader();
    }

    let filteredArtifacts: Artifact[];
    if (!largeList) {
      filteredArtifacts = artifacts;
    } else {
      logger.debug(`promptArtifacts pre-filter required  total=${artifacts.length}  max=${RENDER_MAX}`);

      const typeCounts = artifacts.reduce((acc, a) => {
        acc[a.type] = (acc[a.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const presentTypes = [
        ...TYPE_ORDER.filter(t => typeCounts[t]),
        ...Object.keys(typeCounts).filter(t => !TYPE_ORDER.includes(t)).sort((a, b) => a.localeCompare(b)),
      ];

      let typeFilteredArtifacts = artifacts;
      if (presentTypes.length > 1) {
        console.log('');
        console.log(`  ${theme.brand('Filter by artifact type:')}`);
        console.log(`  ${theme.muted('0)')} ${theme.white('All Types')} ${theme.muted(`(${artifacts.length})`)}`);
        presentTypes.forEach((t, i) => {
          console.log(`  ${theme.muted(`${i + 1})`)} ${getTypeIcon(t)} ${theme.white(capitalize(t) + 's')} ${theme.muted(`(${typeCounts[t]})`)}`);
        });
        console.log('');

        let selectedType: string = 'all';
        while (true) {
          const result = await plainLineInput(`  Enter number (0-${presentTypes.length}, Ctrl+C to go back): `);
          if (result === BACK) return BACK;
          const n = parseInt((result as string).trim(), 10);
          if (!isNaN(n) && n >= 0 && n <= presentTypes.length) {
            selectedType = n === 0 ? 'all' : presentTypes[n - 1];
            break;
          }
          console.log(theme.muted(`  Please enter a number between 0 and ${presentTypes.length}`));
        }

        if (selectedType !== 'all') {
          typeFilteredArtifacts = artifacts.filter(a => a.type === selectedType);
        }
        logger.debug(`promptArtifacts type filter selected  type=${selectedType}  remaining=${typeFilteredArtifacts.length}`);
      }

      if (typeFilteredArtifacts.length <= RENDER_MAX) {
        filteredArtifacts = typeFilteredArtifacts;
      } else {
        while (true) {
          const message =
            `  ${stepBadge(2, TOTAL_STEPS)} Search ` +
            theme.muted(`(${typeFilteredArtifacts.length} available · Enter to browse first ${RENDER_MAX} · Ctrl+C to go back)`) +
            ': ';
          const filterResult = await plainLineInput(message);
          logger.debug(`prompt:artifacts-prefilter ${filterResult === BACK ? 'cancelled' : 'answered'}`);

          if (filterResult === BACK) return BACK;

          const query = (filterResult as string).slice(0, 200);
          if (query === '') {
            filteredArtifacts = typeFilteredArtifacts.slice(0, RENDER_MAX);
            break;
          }

          const matches = typeFilteredArtifacts.filter(a =>
            a.name.toLowerCase().includes(query.toLowerCase()) ||
            (a.description ?? '').toLowerCase().includes(query.toLowerCase())
          );

          if (matches.length === 0) {
            console.log(theme.warning('  No artifacts match — try a different search term'));
            continue;
          }

          filteredArtifacts = matches.length > RENDER_MAX ? matches.slice(0, RENDER_MAX) : matches;
          if (matches.length > RENDER_MAX) {
            console.log(theme.muted(`  ${matches.length} results — showing first ${RENDER_MAX}. Ctrl+C after the list to refine.`));
          }
          break;
        }
      }
    }

    // ── Build grouped choices ───────────────────────────────────────────────
    const grouped = new Map<string, Artifact[]>();
    for (const a of filteredArtifacts) {
      if (!grouped.has(a.type)) grouped.set(a.type, []);
      grouped.get(a.type)!.push(a);
    }
    for (const items of grouped.values()) items.sort((a, b) => a.name.localeCompare(b.name));

    const orderedTypes = [
      ...TYPE_ORDER.filter(t => grouped.has(t)),
      ...[...grouped.keys()].filter(t => !TYPE_ORDER.includes(t)),
    ];

    type Choice = Separator | { name: string; value: Artifact; description?: string };
    const choices: Choice[] = [];
    for (const type of orderedTypes) {
      const items = grouped.get(type)!;
      choices.push(new Separator(`${getTypeIcon(type)} ${theme.brandBold(capitalize(type) + 's')} (${items.length})`));
      for (const a of items) {
        const tags = a.tags?.slice(0, 3).map(t => tagLabel(t)).join(' ') ?? '';
        const srcCount = new Set(a.compatibility.flatMap(c => c.files.map(f => f.source))).size;
        const fileCount = srcCount > 0 ? theme.muted(`${srcCount} file${srcCount > 1 ? 's' : ''}`) : '';
        choices.push({
          name: [theme.white(a.name), tags, fileCount].filter(Boolean).join('  '),
          value: a,
          description: truncate(a.description ?? '', 52),
        });
      }
    }

    const headerCount = orderedTypes.length;
    const selectableCount = choices.filter(c => !(c instanceof Separator)).length;
    const navHint = largeList ? theme.muted('Ctrl+C to refine search') : theme.muted('Ctrl+C to go back');

    logger.debug('promptArtifacts building options', {
      totalArtifacts: filteredArtifacts.length,
      groupCount: grouped.size,
      byType: Object.fromEntries([...grouped.entries()].map(([t, v]) => [t, v.length])),
    });

    const result = await withPromptLogging('artifacts-checkbox', () => checkbox({
      message: `${stepBadge(2, TOTAL_STEPS)} Select artifacts to install  ${navHint}`,
      choices,
      pageSize: 10,
      loop: false,
      validate: (selected) => selected.length > 0 || 'Select at least one artifact',
    }), {
      headers: headerCount,
      selectable: selectableCount,
      totalOptions: choices.length,
    });

    if (result === BACK) {
      if (largeList) { isRedoSearch = true; continue; }
      return BACK;
    }

    return result;
  }
}

async function promptTool(selectedArtifacts: Artifact[]) {
  const tools = getAvailableTools(selectedArtifacts);
  const choices = tools.map(t => ({
    name:        `${getToolIcon(t)} ${theme.white(IDE_DISPLAY_NAMES[t])}`,
    value:       t,
    description: TOOL_TYPE_HINTS[t],
  }));
  return withPromptLogging('tool-select', () => select({
    message: `${stepBadge(3, TOTAL_STEPS)} Install into which tool?`,
    choices,
  }), { options: choices.length });
}

async function promptScope() {
  const workspaceRoot = findWorkspaceRoot();
  const choices = [
    {
      name:        `${icons.shield} ${theme.white('Global')}`,
      value:       'global' as Scope,
      description: 'Available across all your projects (installs to home directory)',
    },
    {
      name:        `${icons.folder} ${theme.white('Workspace')} ${theme.muted('(local)')}`,
      value:       'workspace' as Scope,
      description: workspaceRoot
        ? `Installs into ${theme.cyan(workspaceRoot)}`
        : 'Uses current directory (no git root found)',
    },
  ];
  return withPromptLogging('scope-select', () => select({
    message: `${stepBadge(4, TOTAL_STEPS)} Installation scope:`,
    choices,
  }), { workspaceRoot: workspaceRoot ?? null });
}

async function promptConfirm(
  source: RepoSource,
  selectedArtifacts: Artifact[],
  tool: ToolId,
  scope: Scope,
) {
  console.log('');
  console.log(theme.brandBold('  Installation Summary'));

  const rows: [string, string][] = [
    ['Artifacts', selectedArtifacts.map(a => theme.cyan(a.name)).join(theme.muted(', '))],
    ['Tool',      `${getToolIcon(tool)} ${IDE_DISPLAY_NAMES[tool]}`],
    ['Scope',     scope === 'global' ? `${icons.shield} Global` : `${icons.folder} Workspace`],
    ['Source',    theme.cyan(`${source.owner}/${source.repo}`)],
  ];
  for (const [label, value] of rows) {
    console.log(`  ${theme.muted(label.padEnd(11))} ${value}`);
  }
  console.log('');

  return withPromptLogging('confirm-install', () => confirm({
    message: `${stepBadge(5, TOTAL_STEPS)} Proceed with installation?`,
    default: true,
  }), {
    artifactCount: selectedArtifacts.length,
    source: `${source.owner}/${source.repo}`,
    tool,
    scope,
  });
}

async function promptContinue() {
  return withPromptLogging('continue-select', () => select({
    message: 'What would you like to do next?',
    choices: [
      { name: `${icons.sparkles} Install more from the same repository`, value: 'same' },
      { name: `${icons.globe} Browse a different repository`,             value: 'new'  },
      { name: `${icons.cross} Exit`,                                      value: 'exit' },
    ],
  }));
}

async function doInstall(
  selectedArtifacts: Artifact[],
  tool: ToolId,
  scope: Scope,
  sourceRepo: string,
): Promise<void> {
  const workspaceRoot = findWorkspaceRoot();
  console.log('');
  const results: InstallResult[] = [];
  const total = selectedArtifacts.length;

  for (let i = 0; i < total; i++) {
    const artifact = selectedArtifacts[i];
    const progress = theme.muted(`[${i + 1}/${total}]`);
    const spinner = ora(`${progress} Installing ${theme.cyan(artifact.name)}...`).start();
    try {
      const result = await installComponent(artifact, tool, scope, sourceRepo, workspaceRoot || undefined);
      results.push(result);
      if (result.success) {
        spinner.succeed(`${progress} ${theme.success(artifact.name)} ${theme.muted('installed')}`);
      } else {
        spinner.fail(`${progress} ${theme.error(artifact.name)} ${theme.muted('failed:')} ${result.errors.join(', ')}`);
      }
    } catch (err) {
      const msg = (err as Error).message;
      logger.error(`doInstall caught  artifact=${artifact.id}  ${msg}`, (err as Error).stack);
      spinner.fail(`${progress} ${theme.error(artifact.name)} ${theme.muted('error:')} ${msg}`);
      results.push({ success: false, artifact, tool, scope, installedFiles: [], errors: [msg] });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount    = results.filter(r => !r.success).length;

  console.log('');

  if (successCount > 0) {
    const successItems = results
      .filter(r => r.success)
      .flatMap(r => r.installedFiles.map(f => `  ${icons.check} ${theme.muted(f)}`));

    console.log(resultBox('Installation Complete', [
      statsLine([
        { label: `artifact${successCount > 1 ? 's' : ''} installed`, value: successCount, color: theme.success },
        ...(failCount > 0 ? [{ label: 'failed', value: failCount, color: theme.error }] : []),
      ]),
      ...successItems.slice(0, 8),
      ...(successItems.length > 8 ? [`  ${theme.muted(`... and ${successItems.length - 8} more files`)}`] : []),
    ]));
  }

  if (failCount > 0) {
    console.log('');
    console.log(theme.error(`  ${failCount} artifact${failCount > 1 ? 's' : ''} failed to install:`));
    for (const r of results.filter(r => !r.success)) {
      console.log(`  ${theme.error('▸')} ${theme.bold(r.artifact.name)}: ${r.errors.join(', ')}`);
    }
  }

  console.log('');
}

// ── utilities ─────────────────────────────────────────────────────────────────

function resolveBuiltinSource(choice: string, _settings: UserSettings): RepoSource {
  if (choice === 'awesome-copilot') return DEFAULT_REPOS[0];
  if (choice === 'anthropic-skills') return DEFAULT_REPOS[1];
  if (choice.startsWith('saved:')) {
    const slug = choice.slice('saved:'.length);
    return parseRepoUrl(slug);
  }
  return DEFAULT_REPOS[0];
}

function sourcesEqual(a: RepoSource, b: RepoSource | null): boolean {
  return b !== null && a.owner === b.owner && a.repo === b.repo;
}

function getAvailableTools(artifacts: Artifact[]): ToolId[] {
  const all = new Set<ToolId>();
  for (const a of artifacts) for (const t of getSupportedTools(a)) all.add(t);
  const ordered: ToolId[] = ['claude-code', 'copilot', 'opencode', 'visual-studio', 'intellij'];
  return ordered.filter(t => all.has(t)).concat([...all].filter(t => !ordered.includes(t)));
}

function getToolIcon(tool: ToolId): string {
  const map: Record<ToolId, string> = {
    'claude-code':   '🧠',
    'opencode':      '💻',
    'copilot':       '🤖',
    'visual-studio': '🔷',
    'intellij':      '🧩',
  };
  return map[tool] ?? '🔧';
}

function getTypeIcon(type: string): string {
  const typeIcons: Record<string, string> = {
    skill:       '🎯',
    agent:       '🤖',
    prompt:      '💬',
    instruction: '📋',
    snippet:     '✂️',
    workflow:    '🔄',
    hook:        '🪝',
    'mcp-server': '🔌',
    other:       '📄',
  };
  return typeIcons[type] ?? '📄';
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
