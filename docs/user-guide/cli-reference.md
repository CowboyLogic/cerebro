# CLI reference

All commands accept `--help` for a brief summary of their flags.

---

## `cerebro` (no arguments)

Launches the interactive TUI.

```bash
cerebro
```

---

## `cerebro install`

Installs an artifact from a source repository into a target tool.

```
cerebro install --source <url> --id <id> [options]
```

### Required flags

| Flag | Description |
|---|---|
| `--source <url>` | GitHub repository URL (e.g. `https://github.com/anthropics/skills`) |
| `--id <id>` | Artifact ID to install (see `cerebro list`) |

### Optional flags

| Flag | Default | Description |
|---|---|---|
| `--target <tool>` | config default | Target tool: `agents` \| `claude-code` \| `copilot` |
| `--scope <scope>` | `workspace` | Install scope: `workspace` \| `user` |
| `--trust` | — | Bypass the trust warning for this source |
| `--persist` | — | Save `--target` and `--scope` as your config defaults |
| `--overwrite` | — | Overwrite if the artifact already exists at the destination |

### Install paths

The destination directory depends on the target and scope:

| Target | Scope: workspace | Scope: user |
|---|---|---|
| `agents` (skills) | `.agents/skills/` | `~/.agents/skills/` |
| `agents` (instructions) | `.agents/prompts/` | `~/.agents/prompts/` |
| `claude-code` (skills) | `.claude/commands/` | `~/.claude/commands/` |
| `claude-code` (instructions) | `.claude/rules/` | `~/.claude/rules/` |
| `copilot` (skills) | `.github/skills/` | `~/.copilot/skills/` |
| `copilot` (instructions) | `.github/instructions/` | `~/.copilot/instructions/` |

Default paths can be overridden in `config.yaml`. See [Configuration](configuration.md).

### Examples

```bash
# Install a skill into the current workspace for Copilot
cerebro install --source https://github.com/anthropics/skills \
                --id frontend-design \
                --target copilot

# Install user-scoped, trust the source, and save target as default
cerebro install --source https://github.com/anthropics/skills \
                --id code-review \
                --target claude-code \
                --scope user \
                --trust \
                --persist

# Overwrite an existing install
cerebro install --source https://github.com/anthropics/skills \
                --id frontend-design \
                --target copilot \
                --overwrite
```

---

## `cerebro list`

Lists artifacts available in a source repository.

```
cerebro list --source <url> [options]
```

### Required flags

| Flag | Description |
|---|---|
| `--source <url>` | GitHub repository URL |

### Optional flags

| Flag | Description |
|---|---|
| `--type <type>` | Filter by artifact type (e.g. `skill`, `instruction`) |
| `--filter <keyword>` | Case-insensitive keyword filter on artifact name |
| `--target <tool>` | Show install status for each artifact (requires a target) |
| `--scope <scope>` | Scope for status check (default: `workspace`) |
| `--json` | Output as JSON to stdout |

### Examples

```bash
# List all artifacts in a repo
cerebro list --source https://github.com/anthropics/skills

# List only skills, with status for copilot
cerebro list --source https://github.com/anthropics/skills \
             --type skill \
             --target copilot

# Filter by keyword
cerebro list --source https://github.com/anthropics/skills --filter frontend

# JSON output for scripting
cerebro list --source https://github.com/anthropics/skills --json
```

---

## `cerebro status`

Shows the install status of a specific artifact.

```
cerebro status --source <url> --id <id> --target <tool> [options]
```

### Required flags

| Flag | Description |
|---|---|
| `--source <url>` | GitHub repository URL |
| `--id <id>` | Artifact ID |
| `--target <tool>` | Target tool |

### Optional flags

| Flag | Default | Description |
|---|---|---|
| `--scope <scope>` | `workspace` | Install scope |
| `--json` | — | Output as JSON |

### Status values

| Value | Meaning |
|---|---|
| `available` | Not installed |
| `installed` | Installed by Cerebro (tracked in manifest) |
| `exists` | File exists at the expected path but was not installed by Cerebro |
| `conflict` | Installed at a different path |

### Example

```bash
cerebro status --source https://github.com/anthropics/skills \
               --id frontend-design \
               --target copilot
```

---

## `cerebro sources`

Lists the configured source repositories.

```
cerebro sources [--json]
```

| Flag | Description |
|---|---|
| `--json` | Output as JSON |

---

## `cerebro sources add`

Adds a custom source repository to your config.

```
cerebro sources add <url> [options]
```

| Flag | Description |
|---|---|
| `--trust` | Also mark the source as trusted |
| `--no-save` | Validate and use for this session only; do not persist to config |

### Example

```bash
# Add and trust a source
cerebro sources add https://github.com/my-org/ai-components --trust

# Session-only (not saved to config)
cerebro sources add https://github.com/my-org/ai-components --no-save
```

---

## `cerebro sources trust`

Marks an existing source as trusted.

```
cerebro sources trust <url>
```

Trusted sources skip the interactive trust warning during `install`.

---

## `cerebro --mcp`

Starts Cerebro as a Model Context Protocol (MCP) server using stdio transport. This mode is intended for AI tool integration and is not for interactive human use.

```bash
cerebro --mcp
```

All diagnostic output goes to stderr; stdout is reserved for the JSON-RPC stream.

### MCP tools exposed

| Tool | Description |
|---|---|
| `list_sources` | Returns configured source repositories |
| `list_artifacts` | Lists available artifacts; supports `type` and `filter` parameters |
| `get_artifact_status` | Returns install status for a specific artifact |
| `install_artifact` | Installs an artifact |
| `add_source` | Adds a source repository |

To add Cerebro as an MCP server in your AI tool configuration, point it at `cerebro --mcp` as a stdio command. For example (Claude Code `~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "cerebro": {
      "command": "cerebro",
      "args": ["--mcp"]
    }
  }
}
```
