/**
 * SPEC-0008 — CLI Mode: status command
 * Requirements: CLI-REQ-0001, CLI-REQ-0009, CLI-REQ-0013
 */
import path from 'node:path';
import type { Command } from 'commander';
import type { ToolId, Scope } from '@cowboylogic/cerebro-schema';
import { createSession } from '../core/session.js';
import { ConfigParseError, resolveInstallBase } from '../core/config.js';
import { ManifestParseError, getArtifactStatus } from '../core/manifest.js';
import { fetchCatalog } from '../core/catalog.js';
import { parseRepoUrl } from '../core/provider.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StatusOpts {
  source: string;
  id: string;
  target: string;
  scope?: string;
  json?: boolean;
}

// ---------------------------------------------------------------------------
// Action (exported for direct testing)
// ---------------------------------------------------------------------------

export async function statusAction(opts: StatusOpts): Promise<number> {
  // CLI-REQ-0001
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

  const tool = opts.target as ToolId;
  const scope = (opts.scope ?? 'workspace') as Scope;

  // Parse URL
  let owner: string, repo: string;
  try {
    ({ owner, repo } = parseRepoUrl(opts.source));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }

  // Fetch catalog to get artifact type (needed to compute install path)
  const provider = session.getProvider(opts.source);
  let catalog;
  try {
    catalog = await fetchCatalog(provider, owner, repo);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }

  const artifact = catalog.artifacts.find((a) => a.id === opts.id);
  if (!artifact) {
    process.stderr.write(
      `Artifact '${opts.id}' not found in ${opts.source}. ` +
        `Run 'cerebro list --source ${opts.source}' to see available artifacts.\n`,
    );
    return 1;
  }

  // Resolve install path
  let installBase: string;
  try {
    installBase = resolveInstallBase(session.config, tool, artifact.type, scope);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }

  const installPath =
    artifact.type === 'skill'
      ? path.join(installBase, artifact.id)
      : path.join(installBase, path.basename(artifact.source));

  const status = getArtifactStatus(
    session.manifest,
    artifact.id,
    opts.source,
    tool,
    scope,
    installPath,
  );

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ id: artifact.id, status, installPath }, null, 2) + '\n',
    );
    return 0;
  }

  const statusLabel =
    status === 'installed'
      ? '(Installed)'
      : status === 'exists'
        ? '(Exists)'
        : status === 'conflict'
          ? '(Conflict)'
          : '(Available)';

  process.stdout.write(`${artifact.id}  →  ${installPath}  ${statusLabel}\n`);

  return 0;
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show install status for an artifact')
    .requiredOption('--source <url>', 'GitHub repository URL')
    .requiredOption('--id <id>', 'Artifact ID')
    .requiredOption('--target <tool>', 'Target tool')
    .option('--scope <scope>', 'Scope', 'workspace')
    .option('--json', 'Output as JSON')
    .action(async (opts: StatusOpts) => {
      const code = await statusAction(opts);
      process.exit(code);
    });
}
