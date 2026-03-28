import { select, checkbox, input, confirm, Separator } from '@inquirer/prompts';
import readline from 'node:readline';
import ora from 'ora';
import {
  Component, TargetIDE, Scope, RepoSource,
  DEFAULT_REPOS, IDE_DISPLAY_NAMES, InstallResult,
} from '../core/types.js';
import { parseRepoUrl } from '../core/github.js';
import { discoverComponents } from '../core/registry.js';
import { installComponent } from '../core/installer.js';
import { findWorkspaceRoot } from '../utils/paths.js';
import { loadSettings, addCustomRepo, UserSettings } from '../core/settings.js';
import { theme, icons, banner, resultBox, stepBadge, tagLabel, statsLine } from '../utils/theme.js';
import { logger } from '../utils/logger.js';

const BACK = Symbol('back');

const IDE_TYPE_HINTS: Record<TargetIDE, string> = {
  'claude-code': 'skills · agents · prompts · instructions',
  'opencode':    'agents · instructions · prompts',
  'vscode':      'snippets · prompts · workflows',
  'copilot':     'prompts · instructions',
};

// ── wizard steps ─────────────────────────────────────────────────────────────

const Step = {
  REPO:       'repo',
  COMPONENTS: 'components',
  IDE:        'ide',
  SCOPE:      'scope',
  CONFIRM:    'confirm',
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
  console.log(theme.brandBold('◆') + '  ' + theme.brandBold('Welcome to Cerebro') + theme.muted(' — your AI component installer'));
  console.log('');
}

export async function runInteractive(): Promise<void> {
  const settings = loadSettings();

  let source: RepoSource | null = null;
  let cachedComponents: Component[] = [];
  let cachedSource: RepoSource | null = null;
  let selectedComponents: Component[] = [];
  let target: TargetIDE | null = null;
  let scope: Scope | null = null;

  let step: Step = Step.REPO;

  logger.info('wizard started');

  // ── State-machine loop ────────────────────────────────────────────────────
  while (true) {
    // Clear and redraw the header on every step so the screen stays clean
    // regardless of how we arrived here (forward, back, or post-install).
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
          if (url === BACK) break; // stay at Step.REPO
          source = parseRepoUrl(url as string);
          logger.info(`custom repo parsed  source=${source.owner}/${source.repo}`);
          const updated = addCustomRepo(settings, source);
          settings.customRepos = updated.customRepos;
        } else {
          source = resolveBuiltinSource(choice as string, settings);
          logger.info(`builtin repo resolved  source=${source.owner}/${source.repo}`);
        }

        step = Step.COMPONENTS;
        break;
      }

      // ── Step 2: discover & select components ─────────────────────────────
      case Step.COMPONENTS: {
        if (!sourcesEqual(source!, cachedSource)) {
          logger.info(`fetchComponents cache-miss  source=${source!.owner}/${source!.repo}`);
          const fetched = await fetchComponents(source!);
          if (fetched === null) { step = Step.REPO; break; }
          cachedComponents = fetched;
          cachedSource = source;
        } else {
          logger.debug(`fetchComponents cache-hit  source=${source!.owner}/${source!.repo}  count=${cachedComponents.length}`);
        }

        logger.debug(`prompt:components  totalOptions=${cachedComponents.length}`);
        const selected = await promptComponents(cachedComponents);
        if (selected === BACK) { step = Step.REPO; break; }

        selectedComponents = (selected as Component[]).filter(Boolean);
        logger.info(`prompt:components  selected=${selectedComponents.length}`, selectedComponents.map(c => c.name));
        step = Step.IDE;
        break;
      }

      // ── Step 3: choose target IDE ─────────────────────────────────────────
      case Step.IDE: {
        const choice = await promptIDE(selectedComponents);
        if (choice === BACK) { step = Step.COMPONENTS; break; }
        target = choice as TargetIDE;
        logger.debug(`prompt:ide  choice=${target}`);
        step = Step.SCOPE;
        break;
      }

      // ── Step 4: choose scope ──────────────────────────────────────────────
      case Step.SCOPE: {
        const choice = await promptScope();
        if (choice === BACK) { step = Step.IDE; break; }
        scope = choice as Scope;
        logger.debug(`prompt:scope  choice=${scope}`);
        step = Step.CONFIRM;
        break;
      }

      // ── Step 5: confirm & install ─────────────────────────────────────────
      case Step.CONFIRM: {
        const confirmed = await promptConfirm(source!, selectedComponents, target!, scope!);
        if (confirmed === BACK || !confirmed) { step = Step.SCOPE; break; }

        logger.info(`install begin  components=${selectedComponents.length}  target=${target}  scope=${scope}`);
        await doInstall(selectedComponents, target!, scope!);
        logger.info('install complete  prompting continue');

        const next = await promptContinue();
        if (next === BACK || next === 'exit') {
          logger.info('wizard exit  reason=post-install');
          console.log('\n' + theme.brandBold('◆') + '  ' + theme.brandBold('Goodbye!') + theme.muted('  Happy coding  ') + icons.rocket + '\n');
          return;
        }
        if (next === 'same') {
          logger.debug('post-install  continue=same-repo');
          step = Step.COMPONENTS;
        } else {
          logger.debug('post-install  continue=new-repo');
          step = Step.REPO;
        }
        selectedComponents = [];
        target = null;
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

/**
 * Wraps an @inquirer/prompts call with watchdog logging.
 * Returns BACK if the user cancels (Ctrl+C → ExitPromptError).
 */
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
    // ExitPromptError is thrown by @inquirer/prompts when the user presses Ctrl+C
    if (err instanceof Error && err.name === 'ExitPromptError') {
      logger.debug(`prompt:${name} cancelled`);
      // @inquirer/prompts leaves stdin in raw mode on Windows after Ctrl+C,
      // which causes all subsequent prompts to freeze. Restore it explicitly.
      // pause() (not resume()) so the next prompt initialises its own readline
      // and keypress handlers before stdin starts flowing — pre-calling resume()
      // causes the next prompt to receive data before it is ready, which
      // scrambles the cursor and swallows Ctrl+C.
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
    message: `${stepBadge(1, TOTAL_STEPS)} Where would you like to browse components?`,
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

async function fetchComponents(source: RepoSource): Promise<Component[] | null> {
  const spinner = ora(`Scanning ${theme.cyan(`${source.owner}/${source.repo}`)} for components...`).start();

  let components: Component[];
  try {
    components = await discoverComponents(source);
  } catch (err) {
    const msg = (err as Error).message;
    logger.error(`fetchComponents threw  source=${source.owner}/${source.repo}  ${msg}`, (err as Error).stack);
    spinner.fail(`Failed to scan repository: ${msg}`);
    return null;
  }

  if (components.length === 0) {
    spinner.warn(`No components found in ${theme.cyan(`${source.owner}/${source.repo}`)}`);
    console.log(theme.muted('  No installable components were found. Try a different repo.'));
    return null;
  }

  spinner.succeed(`Found ${theme.brandBold(String(components.length))} components in ${theme.cyan(`${source.owner}/${source.repo}`)}`);

  const typeCounts = components.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const summary = Object.entries(typeCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => `${getTypeIcon(type)} ${theme.bold(String(count))} ${theme.muted(type + (count > 1 ? 's' : ''))}`)
    .join('  ');
  console.log('  ' + summary);

  return components;
}

/**
 * Cooked-mode line input that bypasses @inquirer/core's raw-mode lifecycle.
 * Because it runs in canonical (line-buffered) terminal mode, it's immune to
 * raw-mode state left by the previous prompt on Windows/Node 25.
 * Ctrl+C generates a real SIGINT which we intercept to return BACK.
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

async function promptComponents(components: Component[]) {
  const TYPE_ORDER = ['agent', 'instruction', 'prompt', 'skill', 'snippet', 'workflow', 'unknown'];
  const largeList = components.length > RENDER_MAX;

  // Outer loop: Ctrl+C in the checkbox returns here so the user can refine
  // their search rather than being thrown all the way back to repo selection.
  let isRedoSearch = false;
  while (true) {
    // Clear + reprint header when cycling back from the checkbox so stale
    // checkbox output doesn't accumulate below the banner.
    if (isRedoSearch) {
      console.clear();
      printHeader();
    }

    // ── Pre-filter step for large lists ────────────────────────────────────
    let filteredComponents: Component[];
    if (!largeList) {
      filteredComponents = components;
    } else {
      logger.debug(`promptComponents pre-filter required  total=${components.length}  max=${RENDER_MAX}`);

      // Step A: if multiple types exist, allow narrowing by type first.
      const typeCounts = components.reduce((acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const presentTypes = [
        ...TYPE_ORDER.filter(t => typeCounts[t]),
        ...Object.keys(typeCounts).filter(t => !TYPE_ORDER.includes(t)).sort((a, b) => a.localeCompare(b)),
      ];

      let typeFilteredComponents = components;
      if (presentTypes.length > 1) {
        console.log('');
        console.log(`  ${theme.brand('Filter by component type:')}`);
        console.log(`  ${theme.muted('0)')} ${theme.white('All Types')} ${theme.muted(`(${components.length})`)}`);
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
          typeFilteredComponents = components.filter(c => c.type === selectedType);
        }

        logger.debug(`promptComponents type filter selected  type=${selectedType}  remaining=${typeFilteredComponents.length}`);
      }

      // Step B: keep existing search logic when we still exceed render cap.
      if (typeFilteredComponents.length <= RENDER_MAX) {
        filteredComponents = typeFilteredComponents;
      } else {
        // Inner loop: re-prompt only when the query matches nothing at all.
        while (true) {
          const message =
            `  ${stepBadge(2, TOTAL_STEPS)} Search ` +
            theme.muted(`(${typeFilteredComponents.length} available · Enter to browse first ${RENDER_MAX} · Ctrl+C to go back)`) +
            ': ';
          const filterResult = await plainLineInput(message);
          logger.debug(`prompt:components-prefilter ${filterResult === BACK ? 'cancelled' : 'answered'}`);

          if (filterResult === BACK) return BACK;

          const query = (filterResult as string).slice(0, 200);
          logger.debug(`promptComponents pre-filter query  length=${query.length}`);

          if (query === '') {
            filteredComponents = typeFilteredComponents.slice(0, RENDER_MAX);
            logger.debug(`promptComponents pre-filter  empty query  using first ${RENDER_MAX}`);
            break;
          }

          const matches = typeFilteredComponents.filter(c =>
            c.name.toLowerCase().includes(query.toLowerCase()) ||
            (c.description ?? '').toLowerCase().includes(query.toLowerCase())
          );

          if (matches.length === 0) {
            console.log(theme.warning('  No components match — try a different search term'));
            logger.debug('promptComponents pre-filter  zero matches  re-prompting');
            continue;
          }

          if (matches.length > RENDER_MAX) {
            console.log(theme.muted(`  ${matches.length} results — showing first ${RENDER_MAX}. Ctrl+C after the list to refine your search.`));
            filteredComponents = matches.slice(0, RENDER_MAX);
            logger.debug(`promptComponents pre-filter  too many matches=${matches.length}  capped at ${RENDER_MAX}`);
          } else {
            filteredComponents = matches;
            logger.debug(`promptComponents pre-filter  matched=${filteredComponents.length}`);
          }
          break;
        }
      }
    }

    // ── Build grouped choices ───────────────────────────────────────────────
    const grouped = new Map<string, Component[]>();
    for (const c of filteredComponents) {
      if (!grouped.has(c.type)) grouped.set(c.type, []);
      grouped.get(c.type)!.push(c);
    }
    for (const items of grouped.values()) items.sort((a, b) => a.name.localeCompare(b.name));

    const orderedTypes = [
      ...TYPE_ORDER.filter(t => grouped.has(t)),
      ...[...grouped.keys()].filter(t => !TYPE_ORDER.includes(t)),
    ];

    type Choice = Separator | { name: string; value: Component; description?: string };
    const choices: Choice[] = [];
    for (const type of orderedTypes) {
      const items = grouped.get(type)!;
      choices.push(new Separator(`${getTypeIcon(type)} ${theme.brandBold(capitalize(type) + 's')} (${items.length})`));
      for (const c of items) {
        const tags = c.tags?.slice(0, 3).map(t => tagLabel(t)).join(' ') ?? '';
        const fileCount = c.files.length > 0 ? theme.muted(`${c.files.length} file${c.files.length > 1 ? 's' : ''}`) : '';
        choices.push({
          name: [theme.white(c.name), tags, fileCount].filter(Boolean).join('  '),
          value: c,
          description: truncate(c.description, 52),
        });
      }
    }

    const headerCount = orderedTypes.length;
    const selectableCount = choices.filter(c => !(c instanceof Separator)).length;
    const navHint = largeList ? theme.muted('Ctrl+C to refine search') : theme.muted('Ctrl+C to go back');

    logger.debug('promptComponents building options', {
      totalComponents: filteredComponents.length,
      groupCount: grouped.size,
      byType: Object.fromEntries([...grouped.entries()].map(([t, v]) => [t, v.length])),
    });
    logger.debug(`promptComponents entering checkbox  total=${choices.length}  headers=${headerCount}  selectable=${selectableCount}`);

    const result = await withPromptLogging('components-checkbox', () => checkbox({
      message: `${stepBadge(2, TOTAL_STEPS)} Select components to install  ${navHint}`,
      choices,
      pageSize: 10,
      loop: false,
      validate: (selected) => selected.length > 0 || 'Select at least one component',
    }), {
      headers: headerCount,
      selectable: selectableCount,
      totalOptions: choices.length,
    });

    if (result === BACK) {
      // Large list: loop back to the search prompt so the user can refine.
      // Small list: bubble BACK up to the repo step.
      if (largeList) { isRedoSearch = true; continue; }
      return BACK;
    }

    return result;
  }
}

async function promptIDE(selectedComponents: Component[]) {
  const targets = getAvailableTargets(selectedComponents);
  const choices = targets.map(t => ({
    name:        `${getIDEIcon(t)} ${theme.white(IDE_DISPLAY_NAMES[t])}`,
    value:       t,
    description: IDE_TYPE_HINTS[t],
  }));
  return withPromptLogging('ide-select', () => select({
    message: `${stepBadge(3, TOTAL_STEPS)} Install into which IDE?`,
    choices,
  }), { options: choices.length });
}

async function promptScope() {
  const workspaceRoot = findWorkspaceRoot();
  const choices = [
    {
      name:        `${icons.shield} ${theme.white('User')} ${theme.muted('(global)')}`,
      value:       'user' as Scope,
      description: 'Available across all your projects',
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
  selectedComponents: Component[],
  target: TargetIDE,
  scope: Scope,
) {
  console.log('');
  console.log(theme.brandBold('  Installation Summary'));

  const rows: [string, string][] = [
    ['Components', selectedComponents.map(c => theme.cyan(c.name)).join(theme.muted(', '))],
    ['Target IDE', `${getIDEIcon(target)} ${IDE_DISPLAY_NAMES[target]}`],
    ['Scope',      scope === 'user' ? `${icons.shield} User (global)` : `${icons.folder} Workspace`],
    ['Source',     theme.cyan(`${source.owner}/${source.repo}`)],
  ];
  for (const [label, value] of rows) {
    console.log(`  ${theme.muted(label.padEnd(11))} ${value}`);
  }
  console.log('');

  return withPromptLogging('confirm-install', () => confirm({
    message: `${stepBadge(5, TOTAL_STEPS)} Proceed with installation?`,
    default: true,
  }), {
    componentCount: selectedComponents.length,
    source: `${source.owner}/${source.repo}`,
    target,
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
  selectedComponents: Component[],
  target: TargetIDE,
  scope: Scope,
): Promise<void> {
  const workspaceRoot = findWorkspaceRoot();
  console.log('');
  const results: InstallResult[] = [];
  const total = selectedComponents.length;

  for (let i = 0; i < total; i++) {
    const comp = selectedComponents[i];
    const progress = theme.muted(`[${i + 1}/${total}]`);
    const spinner = ora(`${progress} Installing ${theme.cyan(comp.name)}...`).start();
    try {
      const result = await installComponent(comp, target, scope, workspaceRoot || undefined);
      results.push(result);
      if (result.success) {
        spinner.succeed(`${progress} ${theme.success(comp.name)} ${theme.muted('installed')}`);
      } else {
        spinner.fail(`${progress} ${theme.error(comp.name)} ${theme.muted('failed:')} ${result.errors.join(', ')}`);
      }
    } catch (err) {
      const msg = (err as Error).message;
      logger.error(`doInstall caught  component=${comp.name}  ${msg}`, (err as Error).stack);
      spinner.fail(`${progress} ${theme.error(comp.name)} ${theme.muted('error:')} ${msg}`);
      results.push({ success: false, component: comp, target, scope, installedFiles: [], errors: [msg] });
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
        { label: `component${successCount > 1 ? 's' : ''} installed`, value: successCount, color: theme.success },
        ...(failCount > 0 ? [{ label: 'failed', value: failCount, color: theme.error }] : []),
      ]),
      ...successItems.slice(0, 8),
      ...(successItems.length > 8 ? [`  ${theme.muted(`... and ${successItems.length - 8} more files`)}`] : []),
    ]));
  }

  if (failCount > 0) {
    console.log('');
    console.log(theme.error(`  ${failCount} component${failCount > 1 ? 's' : ''} failed to install:`));
    for (const r of results.filter(r => !r.success)) {
      console.log(`  ${theme.error('▸')} ${theme.bold(r.component.name)}: ${r.errors.join(', ')}`);
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

function getAvailableTargets(components: Component[]): TargetIDE[] {
  const all = new Set<TargetIDE>();
  for (const c of components) for (const t of c.compatibleTargets) all.add(t);
  const ordered: TargetIDE[] = ['claude-code', 'vscode', 'copilot', 'opencode'];
  return ordered.filter(t => all.has(t)).concat(ordered.filter(t => !all.has(t)));
}

function getIDEIcon(ide: TargetIDE): string {
  const map: Record<TargetIDE, string> = {
    'claude-code': '🧠', 'opencode': '💻', 'vscode': '🔷', 'copilot': '🤖',
  };
  return map[ide];
}

function getTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    skill: '🎯', agent: '🤖', prompt: '💬',
    instruction: '📋', snippet: '✂️', workflow: '🔄', unknown: '📄',
  };
  return icons[type] ?? '📄';
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
