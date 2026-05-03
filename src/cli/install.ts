/**
 * SPEC-0008 — CLI Mode: install command
 * Requirements: CLI-REQ-0001 through CLI-REQ-0014
 */
import type { Command } from 'commander';
import type { ToolId, Scope } from '@cowboylogic/cerebro-schema';
import { createSession, setTarget, setScope } from '../core/session.js';
import {
  ConfigParseError,
  trustSource,
  addSource,
} from '../core/config.js';
import { ManifestParseError } from '../core/manifest.js';
import { fetchCatalog } from '../core/catalog.js';
import { installArtifact } from '../core/installer.js';
import { parseRepoUrl } from '../core/provider.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface InstallOpts {
  source: string;
  id: string;
  target?: string;
  scope?: string;
  trust?: boolean;
  persist?: boolean;
  overwrite?: boolean;
}

// ---------------------------------------------------------------------------
// Action (exported for direct testing without Commander overhead)
// ---------------------------------------------------------------------------

export async function installAction(opts: InstallOpts): Promise<number> {
  // CLI-REQ-0001: createSession() first; handle parse errors
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

  // CLI-REQ-0006: resolve target from flag or persisted default
  const tool = (opts.target ?? session.target) as ToolId | null;
  if (!tool) {
    process.stderr.write(
      '--target is required (or set a default in config with --persist).\n',
    );
    return 1;
  }

  // CLI-REQ-0007: scope defaults to workspace
  const scope = (opts.scope ?? 'workspace') as Scope;

  // Parse URL → owner/repo
  let owner: string, repo: string;
  try {
    ({ owner, repo } = parseRepoUrl(opts.source));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }

  // CLI-REQ-0004: --trust — add source to config as trusted before any fetch
  if (opts.trust) {
    const existing = session.config.sources.find((s) => s.url === opts.source);
    if (existing) {
      session.config = trustSource(session.config, opts.source);
    } else {
      session.config = addSource(session.config, {
        name: `${owner}/${repo}`,
        url: opts.source,
        enabled: true,
        trusted: true,
      });
    }
  }

  // CLI-REQ-0003: check trust — must be explicit in config
  const sourceEntry = session.config.sources.find((s) => s.url === opts.source);
  if (!sourceEntry?.trusted) {
    process.stderr.write(
      'Source is not trusted. Run with --trust to acknowledge and proceed.\n',
    );
    return 3;
  }

  // Fetch catalog
  const provider = session.getProvider(opts.source);
  let catalog;
  try {
    catalog = await fetchCatalog(provider, owner, repo);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }

  // Find artifact by id
  const artifact = catalog.artifacts.find((a) => a.id === opts.id);
  if (!artifact) {
    process.stderr.write(
      `Artifact '${opts.id}' not found in ${opts.source}. ` +
        `Run 'cerebro list --source ${opts.source}' to see available artifacts.\n`,
    );
    return 1;
  }

  // Install
  const outcome = await installArtifact(
    artifact,
    owner,
    repo,
    tool,
    scope,
    session.config,
    session.manifest,
    provider,
    { overwrite: opts.overwrite ?? false },
  );

  // CLI-REQ-0008: handle outcomes
  if (outcome.status === 'success') {
    // CLI-REQ-0012: include resolved destination path
    process.stdout.write(`✓ Installed ${opts.id} → ${outcome.installedPath}\n`);

    // CLI-REQ-0005: --persist saves defaults
    if (opts.persist) {
      setTarget(session, tool, true);
      setScope(session, scope, true);
    }
    return 0;
  }

  if (outcome.status === 'skipped') {
    if (outcome.reason === 'exists') {
      process.stderr.write(
        `⚠ Skipped: Artifact '${opts.id}' already exists at destination. Use --overwrite to replace it.\n`,
      );
    } else if (outcome.reason === 'conflict') {
      process.stderr.write(
        `⚠ Skipped: Artifact '${opts.id}' exists but was installed from a different source. Use --overwrite to replace it.\n`,
      );
    } else {
      process.stderr.write(
        `⚠ Skipped: Artifact '${opts.id}' does not support target '${tool}'. Check artifact's supports list.\n`,
      );
    }
    return 2;
  }

  // outcome.status === 'error'
  process.stderr.write(`${outcome.message}\n`);
  return 1;
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

export function registerInstallCommand(program: Command): void {
  program
    .command('install')
    .description('Install an artifact from a source repository')
    .requiredOption('--source <url>', 'GitHub repository URL')
    .requiredOption('--id <id>', 'Artifact ID to install')
    .option('--target <tool>', 'Target tool: agents | claude-code | copilot')
    .option('--scope <scope>', 'Install scope: workspace | user', 'workspace')
    .option('--trust', 'Bypass the trust warning for this source')
    .option('--persist', 'Save --target and --scope as config defaults')
    .option('--overwrite', 'Overwrite if artifact already exists at destination')
    .action(async (opts: InstallOpts) => {
      const code = await installAction(opts);
      process.exit(code);
    });
}
