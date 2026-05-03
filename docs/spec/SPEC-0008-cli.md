# SPEC-0008 â€” CLI Mode

**Product:** cerebro CLI<br />
**Status:** Draft<br />
**Date:** 2026-03-29<br />
**Area:** cli<br />
**Depends on:** [SPEC-0001](SPEC-0001-config.md) (Config), [SPEC-0002](SPEC-0002-manifest.md) (Manifest), [SPEC-0004](SPEC-0004-session.md) (Session), [SPEC-0005](SPEC-0005-catalog.md) (Catalog), [SPEC-0006](SPEC-0006-installer.md) (Installer)<br />
**Consumed by:** `src/index.ts` (entry point when arguments are present)<br />

---

## Overview

The CLI mode provides a non-interactive, fully parameterised interface to Cerebro's core capabilities. It is activated when the CLI is launched with a command and arguments. Designed for users who know exactly what they want to install, for scripting and automation, and as a foundation for the MCP mode's tool implementations. Output is structured, minimal, and machine-readable where possible.

---

## Scope

**In scope:**<br />
- Command definitions and argument schemas
- Non-interactive install, list, and source management operations
- `--trust`, `--persist`, `--overwrite`, `--filter` flags
- Structured exit codes
- Plain-text and JSON output modes

**Out of scope:**<br />
- Interactive prompts or arrow-key navigation ([SPEC-0007](SPEC-0007-tui.md))
- MCP protocol framing ([SPEC-0009](SPEC-0009-mcp.md))
- Business logic (all operations delegate to core modules)

---

## Command Structure

```
cerebro <command> [options]

Commands:
  install     Install an artifact from a source repository
  list        List available artifacts in a source repository
  sources     Manage configured sources
  status      Show install status for an artifact
```

---

## Commands

### `cerebro install`

Install a single artifact.

```
cerebro install
  --source  <url>        GitHub repository URL (required)
  --id      <id>         Artifact ID to install (required)
  --target  <tool>       Target tool: agents | claude-code | copilot (required unless persisted default)
  --scope   <scope>      Install scope: workspace | user  (default: workspace)
  --trust                Bypass the trust warning for this source
  --persist              Save --target and --scope as config defaults
  --overwrite            Overwrite if artifact already exists at destination

Examples:
  cerebro install --source https://github.com/anthropics/skills --id git-commit-assistant --target claude-code
  cerebro install --source https://github.com/anthropics/skills --id git-commit-assistant --target claude-code --trust --persist
```

**Behaviour:**<br />
1. `createSession()` â€” exit code 1 on `ConfigParseError` / `ManifestParseError`
2. If `--trust`: call `trustSource()` and `saveConfig()` before any fetch
3. If source is not trusted and `--trust` not provided: print trust warning and exit code 3 (requires explicit trust)
4. If `--persist`: call `setTarget(persist: true)` and `setScope(persist: true)`
5. Fetch catalog via `fetchCatalog()` ([SPEC-0005](SPEC-0005-catalog.md))
6. Find artifact by `id` in results; if not found: exit code 1 with message
7. Call `installArtifact()` ([SPEC-0006](SPEC-0006-installer.md))
8. Print outcome and exit with appropriate code

**Output (success):**<br />
```
âœ“ Installed git-commit-assistant â†’ .claude/commands/git-commit-assistant/
```

**Output (skipped â€” exists):**<br />
```
âš  Skipped: git-commit-assistant already exists at .claude/commands/git-commit-assistant/
  Use --overwrite to replace it.
```

**Output (skipped â€” conflict):**<br />
```
âš  Skipped: git-commit-assistant exists but was installed from a different source.
  Source on disk: https://github.com/other/repo
  Use --overwrite to replace it.
```

---

### `cerebro list`

List available artifacts in a source repository.

```
cerebro list
  --source  <url>        GitHub repository URL (required)
  --type    <type>       Filter by artifact type: skill | instruction | ...
  --filter  <keyword>    Filter by keyword (name match, case-insensitive)
  --target  <tool>       Show install status relative to this target (optional)
  --scope   <scope>      Scope for status check (default: workspace)
  --json                 Output as JSON array instead of plain text

Examples:
  cerebro list --source https://github.com/anthropics/skills
  cerebro list --source https://github.com/anthropics/skills --type skill --filter git
  cerebro list --source https://github.com/anthropics/skills --json
```

**Output (plain text):**<br />
```
Source: https://github.com/anthropics/skills  (heuristic)

  skill   git-commit-assistant     Git Commit Assistant
  skill   git-branch-manager       Git Branch Manager
  skill   python-debugger          Python Debugger          (Installed)
  skill   code-reviewer            Code Reviewer            (Exists)

4 artifacts  Â·  1 installed  Â·  1 exists
```

**Output (--json):**<br />
```json
[
  {
    "id": "git-commit-assistant",
    "name": "Git Commit Assistant",
    "type": "skill",
    "source": "skills/git-commit-assistant/",
    "status": "available"
  },
  ...
]
```

---

### `cerebro sources`

List configured sources.

```
cerebro sources
  --json    Output as JSON
```

**Output:**<br />
```
Configured sources:

  âœ“ anthropics/skills       https://github.com/anthropics/skills        trusted
  âœ“ awesome-copilot         https://github.com/github/awesome-copilot   not trusted
```

---

### `cerebro sources add`

Add a custom source.

```
cerebro sources add <url>
  --trust      Also mark the source as trusted
  --no-save    Validate and use for this session only; do not persist

Examples:
  cerebro sources add https://github.com/myorg/my-skills --trust
```

---

### `cerebro sources trust`

Mark an existing source as trusted.

```
cerebro sources trust <url>
```

---

### `cerebro status`

Show the install status of a specific artifact.

```
cerebro status
  --source  <url>     GitHub repository URL (required)
  --id      <id>      Artifact ID (required)
  --target  <tool>    Target tool (required)
  --scope   <scope>   Scope (default: workspace)
  --json              Output as JSON

Output:
  git-commit-assistant  â†’  .claude/commands/git-commit-assistant/  (Installed)
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (config corrupt, network failure, artifact not found, write failure) |
| `2` | Skipped â€” artifact already exists at destination; use `--overwrite` to replace |
| `3` | Trust required â€” source is not trusted; use `--trust` to bypass warning |

---

## Requirements

| ID | Keyword | Requirement |
|----|---------|-------------|
| CLI-REQ-0001 | MUST | All commands MUST call `createSession()` as their first step and handle `ConfigParseError` / `ManifestParseError` with a plain-text message and exit code 1. |
| CLI-REQ-0002 | MUST | If a required argument is missing, the CLI MUST print usage help for that command and exit code 1. |
| CLI-REQ-0003 | MUST | If a source is not trusted and `--trust` is not provided, `install` MUST print a trust warning and exit with code 3. It MUST NOT proceed with the install. |
| CLI-REQ-0004 | MUST | `--trust` MUST call `trustSource()` and `saveConfig()` before any catalog fetch or install operation. |
| CLI-REQ-0005 | MUST | `--persist` MUST call `setTarget(persist: true)` and `setScope(persist: true)` after the install completes successfully. |
| CLI-REQ-0006 | MUST | If `--target` is not provided and no `config.defaults.target` exists, the CLI MUST print an error and exit code 1. |
| CLI-REQ-0007 | MUST | `--scope` MUST default to `workspace` when not provided. |
| CLI-REQ-0008 | MUST | `install` with a skipped outcome (`exists` or `conflict`) MUST exit with code 2 and print a message explaining how to override. |
| CLI-REQ-0009 | MUST | `--json` output MUST be valid JSON written to stdout. All other output (errors, warnings) MUST be written to stderr in JSON mode. |
| CLI-REQ-0010 | MUST | `--filter` MUST apply case-insensitive name matching, consistent with TUI-REQ-0010. |
| CLI-REQ-0011 | MUST | All commands MUST be implemented using Commander v13. |
| CLI-REQ-0012 | SHOULD | Successful install output SHOULD include the resolved destination path so the user knows exactly where the artifact landed. |
| CLI-REQ-0013 | MUST | All error, warning, and diagnostic output MUST be written to `stderr`. `stdout` is reserved for command results (plain text output or JSON). This applies in all output modes, not only `--json`. |
| CLI-REQ-0014 | MUST | Commander's default help and argument-error output (which goes to `stdout`) is acceptable in CLI mode. It MUST only be reachable after mode detection has confirmed this is not an MCP invocation (see [SPEC-0009](SPEC-0009-mcp.md) MCP-REQ-0013). |

---

## Error Cases

| Condition | Exit code | Message |
|-----------|-----------|---------|
| `ConfigParseError` | 1 | `Config file is invalid YAML. Fix or delete ~/.config/cerebro/config.yaml.` |
| `ManifestParseError` | 1 | `Manifest file is invalid YAML. Fix or delete ~/.config/cerebro/installed.yaml.` |
| Source not trusted, no `--trust` | 3 | `Source is not trusted. Run with --trust to acknowledge and proceed.` |
| Artifact ID not found | 1 | `Artifact '{id}' not found in {url}. Run 'cerebro list --source {url}' to see available artifacts.` |
| Artifact skipped (exists) | 2 | `Artifact '{id}' already exists at {path}. Use --overwrite to replace it.` |
| Artifact skipped (unsupported target) | 2 | `Artifact '{id}' does not support target '{target}'. Check artifact's supports list.` |
| Network error | 1 | Network error message from [SPEC-0003](SPEC-0003-provider.md) |
| Rate limit | 1 | Rate limit message from [SPEC-0003](SPEC-0003-provider.md) |
