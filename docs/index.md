# Cerebro

![Cerebro](img/cerebro-logo-dark.png)

**Expand your code assist agent**

**Cerebro** is a command-line tool for discovering and installing AI components from GitHub into your AI coding tools. Browse public catalog repositories, pick what you want, and Cerebro handles the copy — picking the right path for your tool and scope.

## What Cerebro installs

| Artifact type | Examples |
|---|---|
| **skill** | Reusable slash-commands, agent skill folders |
| **instruction** | System prompts, `.github/copilot-instructions.md` files |
| **agent** | Pre-configured agent definitions |
| **prompt** | Reusable prompt templates |

## Supported tools

| Tool | Flag |
|---|---|
| GitHub Copilot | `copilot` |
| Claude Code | `claude-code` |
| GitHub Copilot Agents | `agents` |

## Quick start

```bash
# Run without installing
npx cerebro

# Launch the interactive TUI
cerebro

# Install a specific artifact
cerebro install --source https://github.com/anthropics/skills \
                --id frontend-design \
                --target copilot

# List what's available in a repo
cerebro list --source https://github.com/anthropics/skills
```

## Documentation

- [Getting started](getting-started.md) — install, first run, authentication, configuration
- [Interactive TUI](user-guide/tui.md) — guided browser for non-CLI users
- [CLI reference](user-guide/cli-reference.md) — all commands and flags
- [Configuration](user-guide/configuration.md) — `config.yaml` fields and defaults
- [Catalog format](catalog-format.md) — how to publish a `cerebro-catalog.yaml` for your repo
- [Contributing](developer/contributing.md) — dev setup, conventions, tests
- [Architecture](developer/architecture.md) — module map and data flow
