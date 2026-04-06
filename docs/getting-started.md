# Getting started

## Requirements

- **Node.js 20 or later**
- A GitHub account (optional, but recommended — see [Authentication](#authentication))

## Installation

Run Cerebro without installing it permanently:

```bash
npx cerebro
```

Or install globally:

```bash
npm install -g .
```

After a global install, `cerebro` is available anywhere in your terminal.

## First run

Running `cerebro` with no arguments opens the interactive TUI:

```
cerebro
```

The TUI guides you through choosing a source repository, browsing its artifacts by type, selecting your target tool, and confirming the install. See [Interactive TUI](user-guide/tui.md) for a full walkthrough.

To use the CLI directly without the TUI, see [CLI reference](user-guide/cli-reference.md).

## Authentication

Cerebro reads your GitHub token from these sources in priority order:

1. `GITHUB_TOKEN` environment variable
2. `GH_TOKEN` environment variable
3. Output of `gh auth token` (the GitHub CLI)
4. Unauthenticated (lower rate limits apply)

Without a token the GitHub API allows roughly 60 requests per hour. With a token it allows 5,000.

To set a token for your session:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

For a persistent token, add the export to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.) or use the GitHub CLI once:

```bash
gh auth login
```

Cerebro will pick up `gh auth token` automatically on each run.

## Configuration file

Cerebro creates `~/.config/cerebro/config.yaml` on first run. It holds your default tool target, configured sources, and install path overrides.

You can edit this file by hand. Delete it to reset all settings to built-in defaults.

See [Configuration](user-guide/configuration.md) for a complete field reference.

## Next steps

- [Interactive TUI](user-guide/tui.md) — visual walk-through of the browse/install flow
- [CLI reference](user-guide/cli-reference.md) — all commands, flags, and examples
- [Catalog format](catalog-format.md) — publish your own artifact catalog
