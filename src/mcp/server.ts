/**
 * SPEC-0009 — MCP Mode
 *
 * Exposes Cerebro's install capabilities as a Model Context Protocol server.
 * Activated when `--mcp` is present in process.argv (detected in src/index.ts
 * BEFORE Commander runs — MCP-REQ-0013).
 *
 * All diagnostic output goes to stderr. stdout is reserved for the JSON-RPC stream.
 * (MCP-REQ-0003)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createSession } from '../core/session.js';
import { fetchCatalog } from '../core/catalog.js';
import { installArtifact } from '../core/installer.js';
import { addSource, resolveInstallBase, trustSource } from '../core/config.js';
import { getArtifactStatus } from '../core/manifest.js';
import { parseRepoUrl } from '../core/provider.js';
import type { ToolId, Scope } from '@cowboylogic/cerebro-schema';

// ---------------------------------------------------------------------------
// Constants  (MCP-REQ-0010: name/version from package.json)
// ---------------------------------------------------------------------------

const SERVER_NAME = 'cerebro';
const SERVER_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Tool parameter schemas  (MCP-REQ-0004)
// ---------------------------------------------------------------------------

const TOOL_ENUM = ['agents', 'claude-code', 'copilot', 'cursor', 'windsurf', 'opencode'] as const;
const SCOPE_ENUM = ['workspace', 'user'] as const;
const TYPE_ENUM = [
  'skill', 'instruction', 'prompt', 'agent', 'hook',
  'mcp-server', 'snippet', 'workflow', 'other',
] as const;

const listArtifactsSchema = {
  source_url: z.string().url().describe('GitHub repository URL'),
  type: z
    .enum(TYPE_ENUM)
    .optional()
    .describe('Filter by artifact type'),
  filter: z
    .string()
    .optional()
    .describe('Case-insensitive keyword filter on artifact name'),
};

const getArtifactStatusSchema = {
  source_url: z.string().url().describe('GitHub repository URL'),
  artifact_id: z.string().describe('Artifact ID'),
  target: z.enum(TOOL_ENUM).describe('Target tool'),
  scope: z.enum(SCOPE_ENUM).default('workspace').describe('Install scope'),
};

const installArtifactSchema = {
  source_url: z.string().url().describe('GitHub repository URL'),
  artifact_id: z.string().describe('Artifact ID to install'),
  target: z.enum(TOOL_ENUM).describe('Target tool to install for'),
  scope: z.enum(SCOPE_ENUM).default('workspace').describe('Install scope'),
  trust: z
    .boolean()
    .default(false)
    .describe(
      'Acknowledge trust for this source. Required if source is not already trusted.',
    ),
  overwrite: z
    .boolean()
    .default(false)
    .describe('Overwrite if artifact already exists at destination'),
};

const addSourceSchema = {
  url: z.string().url().describe('GitHub repository URL'),  
  name: z.string().optional().describe('Display name for this source'),
  trust: z.boolean().default(false).describe('Also mark source as trusted'),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textContent(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorContent(message: string): { content: [{ type: 'text'; text: string }]; isError: true } {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true as const,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * MCP-REQ-0001: activated exclusively via --mcp flag in src/index.ts.
 * MCP-REQ-0002: uses StdioServerTransport.
 * MCP-REQ-0008: createSession() errors → log to stderr, exit 1.
 */
export async function runMcpServer(): Promise<void> {
  // MCP-REQ-0008: catch startup errors before accepting any tool calls
  let session;
  try {
    session = createSession();
  } catch (err) {
    process.stderr.write(
      `[cerebro:mcp] Startup error: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
  );

  // -------------------------------------------------------------------------
  // Tool: list_sources
  // -------------------------------------------------------------------------

  server.registerTool(
    'list_sources',
    {
      description: 'Returns the configured source repositories.',
      inputSchema: undefined,
    },
    async () => {
      const sources = session.config.sources.map((s) => ({
        name: s.name,
        url: s.url,
        enabled: s.enabled,
        trusted: s.trusted,
      }));
      return textContent({ sources });
    },
  );

  // -------------------------------------------------------------------------
  // Tool: list_artifacts  (MCP-REQ-0011)
  // -------------------------------------------------------------------------

  server.registerTool(
    'list_artifacts',
    {
      description: 'Lists available artifacts in a source repository.',
      inputSchema: listArtifactsSchema,
    },
    async ({ source_url, type, filter }) => {
      try {
        const { owner, repo } = parseRepoUrl(source_url);
        const provider = session.getProvider(source_url);
        const catalogFilter =
          type !== undefined || filter !== undefined
            ? {
                // Only pass type if it's a valid ArtifactType
                ...(type === 'skill' || type === 'instruction' ? { type } : {}),
                ...(filter !== undefined ? { keyword: filter } : {}),
              }
            : undefined;
        const result = await fetchCatalog(provider, owner, repo, catalogFilter);
        return textContent({
          source: result.source,
          artifacts: result.artifacts,
          total: result.artifacts.length,
        });
      } catch (err) {
        return errorContent((err as Error).message);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tool: get_artifact_status  (MCP-REQ-0012)
  // -------------------------------------------------------------------------

  server.registerTool(
    'get_artifact_status',
    {
      description: 'Returns the current install status of an artifact.',
      inputSchema: getArtifactStatusSchema,
    },
    async ({ source_url, artifact_id, target, scope }) => {
      try {
        const { owner, repo } = parseRepoUrl(source_url);
        const provider = session.getProvider(source_url);
        const result = await fetchCatalog(provider, owner, repo);
        const artifact = result.artifacts.find((a) => a.id === artifact_id);
        if (!artifact) {
          return errorContent(
            `Artifact '${artifact_id}' not found in ${source_url}`,
          );
        }

        // MCP-REQ-0012: use resolveInstallBase + getArtifactStatus
        let installPath: string;
        try {
          installPath = resolveInstallBase(
            session.config,
            target as ToolId,
            artifact.type as 'skill' | 'instruction',
            scope as Scope,
          );
        } catch {
          // type not supported for this tool/scope — treat as available
          return textContent({
            artifact_id,
            status: 'available',
            install_path: null,
          });
        }

        const fullPath =
          artifact.type === 'skill'
            ? `${installPath}/${artifact.id}`
            : `${installPath}/${artifact.source.split('/').pop()}`;

        const sourceUrl = `https://github.com/${owner}/${repo}`;
        const status = getArtifactStatus(
          session.manifest,
          artifact_id,
          sourceUrl,
          target as ToolId,
          scope as Scope,
          fullPath,
        );

        return textContent({
          artifact_id,
          status,
          install_path: fullPath,
        });
      } catch (err) {
        return errorContent((err as Error).message);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tool: install_artifact  (MCP-REQ-0005 / MCP-REQ-0006)
  // -------------------------------------------------------------------------

  server.registerTool(
    'install_artifact',
    {
      description: 'Installs an artifact from a source repository.',
      inputSchema: installArtifactSchema,
    },
    async ({ source_url, artifact_id, target, scope, trust, overwrite }) => {
      try {
        const { owner, repo } = parseRepoUrl(source_url);
        const provider = session.getProvider(source_url);

        // MCP-REQ-0005: trust check before installing
        const sourceEntry = session.config.sources.find((s) => s.url === source_url);
        const isTrusted = sourceEntry?.trusted ?? false;

        if (!isTrusted && !trust) {
          return textContent({
            status: 'trust_required',
            source_url,
            message:
              'Source is not trusted. Pass trust: true to acknowledge and proceed.',
          });
        }

        // MCP-REQ-0006: persist trust when trust: true
        if (trust) {
          if (sourceEntry && !sourceEntry.trusted) {
            session.config = trustSource(session.config, source_url);
          } else if (!sourceEntry) {
            // Source not in config — add it as trusted
            const { repo: repoName } = parseRepoUrl(source_url);
            session.config = addSource(session.config, {
              name: repoName,
              url: source_url,
              enabled: true,
              trusted: true,
            });
          }
        }

        // Fetch catalog to find the artifact
        const result = await fetchCatalog(provider, owner, repo);
        const artifact = result.artifacts.find((a) => a.id === artifact_id);
        if (!artifact) {
          return errorContent(
            `Artifact '${artifact_id}' not found in ${source_url}`,
          );
        }

        const outcome = await installArtifact(
          artifact,
          owner,
          repo,
          target as ToolId,
          scope as Scope,
          session.config,
          session.manifest,
          provider,
          { overwrite },
        );

        if (outcome.status === 'success') {
          return textContent({
            status: 'success',
            artifact_id,
            installed_path: outcome.installedPath,
          });
        }

        if (outcome.status === 'skipped') {
          const installBase = resolveInstallBase(
            session.config,
            target as ToolId,
            artifact.type as 'skill' | 'instruction',
            scope as Scope,
          );
          const installPath =
            artifact.type === 'skill'
              ? `${installBase}/${artifact.id}`
              : `${installBase}/${artifact.source.split('/').pop()}`;

          return textContent({
            status: 'skipped',
            reason: outcome.reason,
            artifact_id,
            install_path: installPath,
            message:
              outcome.reason === 'exists'
                ? 'Artifact already exists at destination. Pass overwrite: true to replace it.'
                : `Artifact skipped: ${outcome.reason}`,
          });
        }

        // status === 'error'
        return errorContent(outcome.message);
      } catch (err) {
        return errorContent((err as Error).message);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tool: add_source
  // -------------------------------------------------------------------------

  server.registerTool(
    'add_source',
    {
      description: 'Add and optionally trust a custom source repository.',
      inputSchema: addSourceSchema,
    },
    async ({ url, name, trust }) => {
      try {
        const { repo } = parseRepoUrl(url);
        const displayName = name ?? repo;
        const entry = {
          name: displayName,
          url,
          enabled: true,
          trusted: trust,
        };
        session.config = addSource(session.config, entry);

        const saved = session.config.sources.find((s) => s.url === url);
        return textContent({
          status: 'added',
          source: saved ?? entry,
        });
      } catch (err) {
        return errorContent((err as Error).message);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Start server
  // -------------------------------------------------------------------------

  const transport = new StdioServerTransport();
  process.stderr.write(`[cerebro:mcp] Starting MCP server v${SERVER_VERSION}\n`);
  await server.connect(transport);
}
