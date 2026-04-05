/**
 * SPEC-0008 — CLI Mode: list command
 * Requirements: CLI-REQ-0001, CLI-REQ-0009, CLI-REQ-0010, CLI-REQ-0013
 */
import path from 'node:path';
import type { Command } from 'commander';
import type { Artifact, ArtifactType, ToolId, Scope } from '@cowboylogic/cerebro-schema';
import { createSession } from '../core/session.js';
import { ConfigParseError, resolveInstallBase } from '../core/config.js';
import { ManifestParseError, getArtifactStatus, type ArtifactStatus } from '../core/manifest.js';
import { fetchCatalog, type CatalogSource } from '../core/catalog.js';
import { parseRepoUrl } from '../core/provider.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ListOpts {
  source: string;
  type?: string;
  filter?: string;
  target?: string;
  scope?: string;
  json?: boolean;
}

export interface ListArtifactEntry {
  id: string;
  name: string;
  type: ArtifactType;
  source: string;
  status: ArtifactStatus;
}

// ---------------------------------------------------------------------------
// Action (exported for direct testing without Commander overhead)
// ---------------------------------------------------------------------------

export async function listAction(opts: ListOpts): Promise<number> {
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

  // Parse URL
  let owner: string, repo: string;
  try {
    ({ owner, repo } = parseRepoUrl(opts.source));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }

  // Fetch catalog with optional filters
  const provider = session.getProvider(opts.source);
  let catalogResult: { source: CatalogSource; artifacts: Artifact[] };
  try {
    catalogResult = await fetchCatalog(provider, owner, repo, {
      type: opts.type as ArtifactType | undefined,
      // CLI-REQ-0010: case-insensitive keyword filter
      keyword: opts.filter,
    });
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }

  const { artifacts } = catalogResult;
  const sourceUrl = opts.source;
  const scope = (opts.scope ?? 'workspace') as Scope;
  const tool = opts.target as ToolId | undefined;

  // Determine status for each artifact if a target is provided
  const entries: ListArtifactEntry[] = artifacts.map((a) => {
    let status: ArtifactStatus = 'available';
    if (tool) {
      try {
        const installBase = resolveInstallBase(session.config, tool, a.type, scope);
        const installPath =
          a.type === 'skill'
            ? path.join(installBase, a.id)
            : path.join(installBase, path.basename(a.source));
        status = getArtifactStatus(
          session.manifest,
          a.id,
          sourceUrl,
          tool,
          scope,
          installPath,
        );
      } catch {
        // Unsupported tool/type combo — treat as available
        status = 'available';
      }
    }
    return { id: a.id, name: a.name, type: a.type, source: a.source, status };
  });

  // CLI-REQ-0009: JSON output to stdout
  if (opts.json) {
    process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
    return 0;
  }

  // Plain-text output
  const sourceLabel =
    catalogResult.source === 'catalog'
      ? `${opts.source}  (catalog)`
      : `${opts.source}  (heuristic)`;
  process.stdout.write(`Source: ${sourceLabel}\n\n`);

  if (entries.length === 0) {
    process.stdout.write('  No artifacts found.\n');
    return 0;
  }

  let installedCount = 0;
  let existsCount = 0;

  for (const e of entries) {
    const statusLabel =
      e.status === 'installed'
        ? '  (Installed)'
        : e.status === 'exists'
          ? '  (Exists)'
          : e.status === 'conflict'
            ? '  (Conflict)'
            : '';
    const pad = (s: string, n: number) => s.padEnd(n);
    process.stdout.write(
      `  ${pad(e.type, 14)}${pad(e.id, 34)}${e.name}${statusLabel}\n`,
    );
    if (e.status === 'installed') installedCount++;
    if (e.status === 'exists') existsCount++;
  }

  process.stdout.write(
    `\n${entries.length} artifact${entries.length !== 1 ? 's' : ''}` +
      (tool
        ? `  ·  ${installedCount} installed  ·  ${existsCount} exists`
        : '') +
      '\n',
  );

  return 0;
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List available artifacts in a source repository')
    .requiredOption('--source <url>', 'GitHub repository URL')
    .option('--type <type>', 'Filter by artifact type: skill | instruction | ...')
    .option('--filter <keyword>', 'Filter by keyword (name match, case-insensitive)')
    .option('--target <tool>', 'Show install status relative to this target')
    .option('--scope <scope>', 'Scope for status check', 'workspace')
    .option('--json', 'Output as JSON array')
    .action(async (opts: ListOpts) => {
      const code = await listAction(opts);
      process.exit(code);
    });
}
