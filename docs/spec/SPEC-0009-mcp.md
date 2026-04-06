# SPEC-0009 â€” MCP Mode

**Product:** cerebro CLI<br />
**Status:** Draft<br />
**Date:** 2026-03-29<br />
**Area:** mcp<br />
**Depends on:** [SPEC-0001](SPEC-0001-config.md) (Config), [SPEC-0002](SPEC-0002-manifest.md) (Manifest), [SPEC-0004](SPEC-0004-session.md) (Session), [SPEC-0005](SPEC-0005-catalog.md) (Catalog), [SPEC-0006](SPEC-0006-installer.md) (Installer)<br />
**Consumed by:** `src/index.ts` (entry point when `--mcp` flag is present); AI agents via MCP protocol<br />

---

## Overview

The MCP mode exposes Cerebro's install capabilities as a Model Context Protocol server, allowing AI agents (Claude Code, GitHub Copilot, and others) to invoke Cerebro as a native tool. Activated via `cerebro --mcp`, it starts a stdio-based JSON-RPC server using the `@modelcontextprotocol/sdk`. Tool schemas are defined with `zod` for strong typing and agent discoverability.

This mode enables agents to autonomously install skills and instructions without human interaction, and is a compelling demonstration of Cerebro's value when pitching `cerebro-catalog.yaml` adoption to source repo maintainers.

---

## Scope

**In scope:**<br />
- MCP server startup and stdio transport
- Tool definitions with zod schemas
- Mapping MCP tool calls to core module operations
- Structured JSON responses for all tools
- Trust handling in an agent context

**Out of scope:**<br />
- Interactive prompts or TUI rendering ([SPEC-0007](SPEC-0007-tui.md))
- CLI argument parsing for non-MCP commands ([SPEC-0008](SPEC-0008-cli.md))
- OAuth flows or interactive token acquisition

---

## Activation

```bash
cerebro --mcp
```

The process starts in MCP mode, opens a `StdioServerTransport`, and waits for tool calls. All diagnostic output (startup message, debug logs) MUST be written to `stderr` â€” `stdout` is reserved exclusively for the JSON-RPC stream.

**Mode detection must happen first.** `src/index.ts` MUST check for the `--mcp` flag before Commander parses any arguments. Commander writes help text and argument validation errors to `stdout` by default â€” if Commander runs before mode detection, even a malformed invocation could write to `stdout` and corrupt the JSON-RPC stream before the server starts.<br />

Correct pattern:
```typescript
// src/index.ts â€” mode detection BEFORE Commander
if (process.argv.includes('--mcp')) {
  runMcpServer().catch(console.error); // catch goes to stderr
} else {
  // Commander and all CLI/TUI logic here
}
```

---

## Agent Registration

To register Cerebro as an MCP tool in a project, add the following to `.agents/manifest.yaml`:

```yaml
# .agents/manifest.yaml
version: "1.0.0"
name: cerebro
mcpServers:
  cerebro:
    command: npx
    args: [cerebro, --mcp]
    description: "Installs AI augmentation artifacts (skills, instructions) from GitHub repositories into your development environment."
```

---

## Tools

### `list_sources`

Returns the configured source repositories.

**Parameters:** none<br />

**Response:**<br />
```json
{
  "sources": [
    {
      "name": "anthropics/skills",
      "url": "https://github.com/anthropics/skills",
      "enabled": true,
      "trusted": true
    }
  ]
}
```

---

### `list_artifacts`

Lists available artifacts in a source repository.

**Parameters (zod schema):**<br />
```typescript
z.object({
  source_url: z.string().url().describe("GitHub repository URL"),
  type:       z.enum(['skill', 'instruction', 'prompt', 'agent', 'hook', 'mcp-server', 'snippet', 'workflow', 'other'])
               .optional()
               .describe("Filter by artifact type"),
  filter:     z.string().optional()
               .describe("Case-insensitive keyword filter on artifact name"),
})
```

**Response:**<br />
```json
{
  "source": "heuristic",
  "artifacts": [
    {
      "id": "git-commit-assistant",
      "name": "Git Commit Assistant",
      "type": "skill",
      "description": "Helps write conventional commit messages",
      "source": "skills/git-commit-assistant/",
      "supports": ["claude-code", "agents"]
    }
  ],
  "total": 1
}
```

---

### `get_artifact_status`

Returns the current install status of an artifact.

**Parameters (zod schema):**<br />
```typescript
z.object({
  source_url:  z.string().url().describe("GitHub repository URL"),
  artifact_id: z.string().describe("Artifact ID"),
  target:      z.enum(['agents', 'claude-code', 'copilot', 'cursor', 'windsurf', 'opencode'])
                .describe("Target tool"),
  scope:       z.enum(['workspace', 'user']).default('workspace')
                .describe("Install scope"),
})
```

**Response:**<br />
```json
{
  "artifact_id": "git-commit-assistant",
  "status": "available",
  "install_path": ".claude/commands/git-commit-assistant/"
}
```

`status` is one of: `"available"` | `"installed"` | `"conflict"` | `"exists"`

---

### `install_artifact`

Installs an artifact from a source repository.

**Parameters (zod schema):**<br />
```typescript
z.object({
  source_url:  z.string().url().describe("GitHub repository URL"),
  artifact_id: z.string().describe("Artifact ID to install"),
  target:      z.enum(['agents', 'claude-code', 'copilot', 'cursor', 'windsurf', 'opencode'])
                .describe("Target tool to install for"),
  scope:       z.enum(['workspace', 'user']).default('workspace')
                .describe("Install scope"),
  trust:       z.boolean().default(false)
                .describe("Acknowledge trust for this source. Required if source is not already trusted."),
  overwrite:   z.boolean().default(false)
                .describe("Overwrite if artifact already exists at destination"),
})
```

**Response (success):**<br />
```json
{
  "status": "success",
  "artifact_id": "git-commit-assistant",
  "installed_path": ".claude/commands/git-commit-assistant/"
}
```

**Response (skipped):**<br />
```json
{
  "status": "skipped",
  "reason": "exists",
  "artifact_id": "git-commit-assistant",
  "install_path": ".claude/commands/git-commit-assistant/",
  "message": "Artifact already exists at destination. Pass overwrite: true to replace it."
}
```

**Response (trust required):**<br />
```json
{
  "status": "trust_required",
  "source_url": "https://github.com/example/repo",
  "message": "Source is not trusted. Pass trust: true to acknowledge and proceed."
}
```

---

### `add_source`

Add and optionally trust a custom source repository.

**Parameters (zod schema):**<br />
```typescript
z.object({
  url:   z.string().url().describe("GitHub repository URL"),
  name:  z.string().optional().describe("Display name for this source"),
  trust: z.boolean().default(false).describe("Also mark source as trusted"),
})
```

**Response:**<br />
```json
{
  "status": "added",
  "source": {
    "name": "my-skills",
    "url": "https://github.com/myorg/my-skills",
    "enabled": true,
    "trusted": true
  }
}
```

---

## Requirements

| ID | Keyword | Requirement |
|----|---------|-------------|
| MCP-REQ-0001 | MUST | MCP mode MUST be activated exclusively by the `--mcp` flag. No other combination of arguments starts an MCP server. |
| MCP-REQ-0002 | MUST | The MCP server MUST use `StdioServerTransport` from `@modelcontextprotocol/sdk`. |
| MCP-REQ-0003 | MUST NOT | MCP mode MUST NOT write anything to `stdout` except the JSON-RPC stream. All diagnostic output MUST go to `stderr`. |
| MCP-REQ-0004 | MUST | All tool parameters MUST be defined as `zod` schemas. Parameter descriptions MUST be sufficient for an agent to determine when and how to call the tool. |
| MCP-REQ-0005 | MUST | `install_artifact` MUST check whether the source is trusted before proceeding. If not trusted and `trust: false`, it MUST return `{ status: 'trust_required' }` â€” it MUST NOT install. |
| MCP-REQ-0006 | MUST | `install_artifact` with `trust: true` MUST call `trustSource()` and `saveConfig()` before proceeding, persisting the trust decision for future sessions. |
| MCP-REQ-0007 | MUST | All tool handlers MUST return structured JSON responses. They MUST NOT throw â€” all errors MUST be returned as MCP error responses with a descriptive message. |
| MCP-REQ-0008 | MUST | `createSession()` errors (`ConfigParseError`, `ManifestParseError`) MUST be caught at server startup. The server MUST log the error to `stderr` and exit with code 1 before accepting any tool calls. |
| MCP-REQ-0009 | MUST | All tool handlers MUST delegate to the same core modules ([SPEC-0001](SPEC-0001-config.md) through [SPEC-0006](SPEC-0006-installer.md)) used by TUI and CLI modes. No business logic is reimplemented in the MCP layer. |
| MCP-REQ-0010 | SHOULD | The server name and version registered with the MCP SDK SHOULD match the package name and version from `package.json`. |
| MCP-REQ-0011 | MUST | `list_artifacts` MUST apply `filter` and `type` parameters using `fetchCatalog()` with a `CatalogFilter` ([SPEC-0005](SPEC-0005-catalog.md)). |
| MCP-REQ-0012 | MUST | `get_artifact_status` MUST call `resolveInstallBase()` ([SPEC-0001](SPEC-0001-config.md)) and `getArtifactStatus()` ([SPEC-0002](SPEC-0002-manifest.md)) to compute the status. |
| MCP-REQ-0013 | MUST | The `--mcp` flag MUST be detected in `src/index.ts` before Commander initialises or processes any arguments, and before any output is written to `stdout`. |
| MCP-REQ-0014 | MUST NOT | Core modules ([SPEC-0001](SPEC-0001-config.md) through [SPEC-0006](SPEC-0006-installer.md)) MUST NOT write to `stdout` under any circumstances. Any diagnostic, debug, or informational output from core modules MUST use `stderr` (`console.error`) or be suppressed entirely. Core modules are shared across TUI, CLI, and MCP modes â€” any `console.log` in a core module will corrupt the MCP JSON-RPC stream. |
| MCP-REQ-0015 | MUST | Tool handler errors that are expected (network failure, artifact not found, trust required, etc.) MUST be returned as structured content responses with `isError: true` per the MCP SDK pattern â€” they MUST NOT throw. Unhandled exceptions may become protocol-level MCP errors via the SDK's default handling. |

---

## Error Cases

| Condition | Response |
|-----------|----------|
| `ConfigParseError` on startup | Log to stderr, exit 1 before accepting calls |
| Source not trusted, `trust: false` | `{ status: 'trust_required', ... }` |
| Artifact not found in catalog | MCP error response: `Artifact '{id}' not found in {url}` |
| Install skipped (exists/conflict) | `{ status: 'skipped', reason: '...', message: '...' }` |
| Network error | MCP error response with message from [SPEC-0003](SPEC-0003-provider.md) |
| Rate limit | MCP error response with rate limit message |
| Invalid repo URL | MCP error response: validation error from zod |

---

## Notes

- The `trust` parameter in `install_artifact` is the MCP equivalent of `--trust` in CLI mode. Since an agent is making the call, the expectation is that the agent has been configured by a human who trusts the source. Setting `trust: true` in the tool call is the explicit acknowledgement.
- MCP mode does not support interactive prompts. All decisions that would require user confirmation in the TUI (overwrite, trust) are handled via explicit boolean parameters.
- The `.agents/manifest.yaml` registration snippet in this spec is the basis for the PR that will be proposed to `anthropics/skills` and `github/awesome-copilot` to enable agent-driven installation from those repos.
