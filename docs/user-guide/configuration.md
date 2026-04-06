# Configuration

Cerebro stores its configuration in `~/.config/cerebro/config.yaml`. The file is created automatically on first run, populated with built-in defaults. You can edit it by hand at any time. Delete the file to reset everything to defaults.

## File structure

```yaml
defaults:
  target: copilot          # optional: agents | claude-code | copilot
  scope: workspace         # optional: workspace | user
  ui:
    pageSize: 10           # TUI list page size

sources:
  - name: anthropic-skills
    url: https://github.com/anthropics/skills
    enabled: true
    trusted: false

targets:                   # optional: override install paths
  copilot:
    skill:
      workspace: .github/skills
      user: ~/.copilot/skills
    instruction:
      workspace: .github/instructions
      user: ~/.copilot/instructions
```

---

## `defaults`

### `defaults.target`

The default target tool used when `--target` is not provided on the command line.

Valid values: `agents`, `claude-code`, `copilot`

Set this once with `--persist` on any install command:

```bash
cerebro install --source https://github.com/anthropics/skills \
                --id frontend-design \
                --target copilot \
                --persist
```

### `defaults.scope`

The default install scope when `--scope` is not provided.

Valid values: `workspace` (default), `user`

### `defaults.ui.pageSize`

Number of items per page in the interactive TUI. Default: `10`.

---

## `sources`

A list of source repositories Cerebro knows about.

Each entry has:

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name (used in the TUI and `cerebro sources` output) |
| `url` | string | GitHub repository URL |
| `enabled` | boolean | Whether the source appears in the TUI (default `true`) |
| `trusted` | boolean | Whether installs from this source skip the trust prompt |

### Built-in sources

Cerebro ships with two pre-configured sources:

| Name | URL |
|---|---|
| `anthropic-skills` | `https://github.com/anthropics/skills` |
| `awesome-copilot` | `https://github.com/github/awesome-copilot` |

These are merged with your own `sources` list on startup. Your entries take precedence.

### Adding sources

Via CLI (recommended):

```bash
cerebro sources add https://github.com/my-org/ai-components --trust
```

Or by editing `config.yaml` directly and adding an entry to the `sources` list.

---

## `targets`

Override the default install paths for any tool/type/scope combination.

The defaults are:

| Target | Type | Scope | Path |
|---|---|---|---|
| `agents` | skill | workspace | `.agents/skills` |
| `agents` | skill | user | `~/.agents/skills` |
| `agents` | instruction | workspace | `.agents/prompts` |
| `agents` | instruction | user | `~/.agents/prompts` |
| `claude-code` | skill | workspace | `.claude/commands` |
| `claude-code` | skill | user | `~/.claude/commands` |
| `claude-code` | instruction | workspace | `.claude/rules` |
| `claude-code` | instruction | user | `~/.claude/rules` |
| `copilot` | skill | workspace | `.github/skills` |
| `copilot` | skill | user | `~/.copilot/skills` |
| `copilot` | instruction | workspace | `.github/instructions` |
| `copilot` | instruction | user | `~/.copilot/instructions` |

To override a path, add a `targets` block. Only the entries you specify will be overridden; unspecified entries use their built-in defaults. Tilde (`~`) in paths is expanded to the user home directory.

Example — change where workspace-scoped Copilot skills are installed:

```yaml
targets:
  copilot:
    skill:
      workspace: .vscode/skills
```
