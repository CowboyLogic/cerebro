/**
 * SPEC-0008 — CLI Mode: sources command
 * Requirements: CLI-REQ-0001, CLI-REQ-0009, CLI-REQ-0013
 */
import type { Command } from 'commander';
import { createSession } from '../core/session.js';
import { ConfigParseError, addSource, trustSource } from '../core/config.js';
import { ManifestParseError } from '../core/manifest.js';
import { parseRepoUrl } from '../core/provider.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SourcesListOpts {
  json?: boolean;
}

export interface SourcesAddOpts {
  trust?: boolean;
  noSave?: boolean;
}

// ---------------------------------------------------------------------------
// Actions (exported for direct testing)
// ---------------------------------------------------------------------------

export async function sourcesListAction(opts: SourcesListOpts): Promise<number> {
  let session;
  try {
    session = createSession();
  } catch (err) {
    if (err instanceof ConfigParseError) {
      process.stderr.write(
        'Config file is invalid YAML. Fix or delete ~/.config/cerebro/config.yaml.\n',
      );
      return 1;
    }
    if (err instanceof ManifestParseError) {
      process.stderr.write(
        'Manifest file is invalid YAML. Fix or delete ~/.config/cerebro/installed.yaml.\n',
      );
      return 1;
    }
    process.stderr.write(`Unexpected error: ${(err as Error).message}\n`);
    return 1;
  }

  const { sources } = session.config;

  // CLI-REQ-0009: JSON to stdout
  if (opts.json) {
    process.stdout.write(JSON.stringify(sources, null, 2) + '\n');
    return 0;
  }

  process.stdout.write('Configured sources:\n\n');
  if (sources.length === 0) {
    process.stdout.write('  (none)\n');
    return 0;
  }

  for (const s of sources) {
    const check = s.enabled ? '✓' : '✗';
    const trust = s.trusted ? 'trusted' : 'not trusted';
    const name = s.name.padEnd(26);
    const url = s.url.padEnd(48);
    process.stdout.write(`  ${check} ${name}${url}${trust}\n`);
  }

  return 0;
}

export async function sourcesAddAction(url: string, opts: SourcesAddOpts): Promise<number> {
  let session;
  try {
    session = createSession();
  } catch (err) {
    if (err instanceof ConfigParseError) {
      process.stderr.write(
        'Config file is invalid YAML. Fix or delete ~/.config/cerebro/config.yaml.\n',
      );
      return 1;
    }
    if (err instanceof ManifestParseError) {
      process.stderr.write(
        'Manifest file is invalid YAML. Fix or delete ~/.config/cerebro/installed.yaml.\n',
      );
      return 1;
    }
    process.stderr.write(`Unexpected error: ${(err as Error).message}\n`);
    return 1;
  }

  let owner: string, repo: string;
  try {
    ({ owner, repo } = parseRepoUrl(url));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }

  const entry = {
    name: `${owner}/${repo}`,
    url,
    enabled: true,
    trusted: opts.trust ?? false,
  };

  if (!opts.noSave) {
    session.config = addSource(session.config, entry);
    const verb = opts.trust ? 'Added and trusted' : 'Added';
    process.stdout.write(`${verb}: ${url}\n`);
  } else {
    process.stdout.write(`Validated (session only): ${url}\n`);
  }

  return 0;
}

export async function sourcesTrustAction(url: string): Promise<number> {
  let session;
  try {
    session = createSession();
  } catch (err) {
    if (err instanceof ConfigParseError) {
      process.stderr.write(
        'Config file is invalid YAML. Fix or delete ~/.config/cerebro/config.yaml.\n',
      );
      return 1;
    }
    if (err instanceof ManifestParseError) {
      process.stderr.write(
        'Manifest file is invalid YAML. Fix or delete ~/.config/cerebro/installed.yaml.\n',
      );
      return 1;
    }
    process.stderr.write(`Unexpected error: ${(err as Error).message}\n`);
    return 1;
  }

  try {
    trustSource(session.config, url);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }

  process.stdout.write(`Trusted: ${url}\n`);
  return 0;
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

export function registerSourcesCommand(program: Command): void {
  const sources = program
    .command('sources')
    .description('List configured sources')
    .option('--json', 'Output as JSON')
    .action(async (opts: SourcesListOpts) => {
      const code = await sourcesListAction(opts);
      process.exit(code);
    });

  sources
    .command('add <url>')
    .description('Add a custom source')
    .option('--trust', 'Also mark the source as trusted')
    .option('--no-save', 'Validate and use for this session only; do not persist')
    .action(async (url: string, opts: SourcesAddOpts) => {
      const code = await sourcesAddAction(url, opts);
      process.exit(code);
    });

  sources
    .command('trust <url>')
    .description('Mark an existing source as trusted')
    .action(async (url: string) => {
      const code = await sourcesTrustAction(url);
      process.exit(code);
    });
}
