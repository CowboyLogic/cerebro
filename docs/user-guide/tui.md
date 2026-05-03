# Interactive TUI

Running `cerebro` with no arguments opens the interactive terminal UI — a keyboard-driven browser for exploring source repositories and installing artifacts without memorising any flags.

## Launching

```bash
cerebro
```

The TUI starts at the source list. Press `Ctrl+C` or `Escape` at the top screen to exit.

---

## Screen flow

```
repo-list
  └─ (untrusted source) → trust-warning
  └─ (no target set)    → target-select → scope-select → scope-persist
  └─ type-menu
       └─ item-list
            └─ (already exists) → overwrite-confirm

  └─ (Add custom source) → add-source → add-source-save
```

---

## Keyboard controls

| Key | Action |
|---|---|
| `↑` / `↓` | Move cursor |
| `Enter` | Confirm selection / install |
| `Escape` | Go back one screen |
| `Ctrl+C` | Exit from any screen |
| Type characters | Filter items (on item-list screen) |
| `Backspace` | Delete last filter character |
| `←` / `→` | Page through results |

---

## Screen descriptions

### Repo list

The opening screen lists all configured source repositories. A built-in selection includes [Anthropic Skills](https://github.com/anthropics/skills) and [Awesome Copilot](https://github.com/github/awesome-copilot). Custom sources you have added appear below them.

The last item is always **Add custom source**, which opens the URL entry screen.

### Trust warning

If you select a source that is not marked as trusted, Cerebro shows a one-time warning before fetching its catalog. Select **Trust** to proceed and mark the source as trusted for future runs, or **Cancel** to go back.

### Target select

Appears the first time you enter a repo in a session if no default target is configured. Choose your AI tool:

- `agents` — GitHub Copilot Agents
- `claude-code` — Anthropic Claude Code
- `copilot` — GitHub Copilot

### Scope select

Appears after target select. Choose where artifacts will be installed:

- **workspace** — current working directory (e.g. `.github/instructions/`)
- **user** — your home directory (e.g. `~/.copilot/instructions/`)

See [Configuration](configuration.md) for the exact paths per target.

### Scope persist

After choosing scope, Cerebro asks whether to save the target and scope as your defaults so you are not prompted again on future runs. Selecting **Yes** writes them to `~/.config/cerebro/config.yaml`.

### Type menu

Lists the artifact types available in the selected repository (e.g. **skill**, **instruction**). Select a type to browse its artifacts.

### Item list

Shows all artifacts of the chosen type with their install status:

| Status | Meaning |
|---|---|
| *(no label)* | Available to install |
| `Installed` | Installed by Cerebro in this session or a previous one |
| `Exists` | File already exists at the install path (not installed via Cerebro) |
| `Conflict` | Installed at a different path |

Start typing to filter the list by name. Press `←` / `→` to page through results if there are more than `pageSize` items (default: 10, configurable — see [Configuration](configuration.md)).

Press `Enter` to install the selected artifact.

### Overwrite confirm

If the artifact already exists at its destination (status `Exists` or `Conflict`), Cerebro shows a confirmation prompt before overwriting. Select **Yes** to proceed or **No** to cancel.

### Add custom source

Enter a GitHub repository URL and press `Enter`. Cerebro validates the URL format. If validation passes you are asked whether to save it for future sessions.

### Add source save

After adding a custom source, choose whether to persist it in `~/.config/cerebro/config.yaml`. Selecting **No** uses the source for this session only.

---

## Banner

The top of every screen shows the Cerebro banner with:

- Current version
- Auth status (`GITHUB_TOKEN`, `GH_TOKEN`, `gh CLI`, or `unauthenticated`)
- Number of configured sources
- Default target (if set)
