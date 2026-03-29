# Cerebro

A suite of tools for discovering and installing AI artifacts — skills, agents, prompts, instructions, hooks, and MCP servers — from GitHub repositories directly into your IDE.

Supports **Claude Code**, **VS Code** (Copilot), **OpenCode**, and **Copilot CLI** across Windows, macOS, and Linux.

---

## Cerebro suite

| Repo | Description | Status |
|------|-------------|--------|
| **cerebro** (this repo) | CLI installer + suite documentation home | Active |
| [cerebro-schema](https://github.com/CowboyLogic/cerebro-schema) | Shared JSON Schema, TypeScript types, and AJV validator | Active |
| [cerebro-vscode-ext](https://github.com/CowboyLogic/cerebro-vscode-ext) | VS Code extension | Active |
| [cerebro-vs-ext](https://github.com/CowboyLogic/cerebro-vs-ext) | Visual Studio extension | Planned |
| [cerebro-intellij-ext](https://github.com/CowboyLogic/cerebro-intellij-ext) | IntelliJ IDEA plugin | Planned |
| [cerebro-eclipse-ext](https://github.com/CowboyLogic/cerebro-eclipse-ext) | Eclipse plugin | Planned |

---

## Quick start

**Requirements:** Node.js 20+

```bash
# Run directly (no install needed)
npx cerebro

# Or install globally
npm install -g .
cerebro
```

Set `GITHUB_TOKEN` to raise the GitHub API rate limit when browsing large repositories:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

---

## CLI reference

### Interactive mode (default)

```bash
cerebro
```

Walks you through selecting a repository, browsing artifacts by type, choosing your target IDE, and picking a scope — all in a guided terminal UI.

### Browse & install

```bash
# Browse default repositories
cerebro browse

# Browse a specific repo
cerebro browse my-org/my-ai-components

# Install by name
cerebro install my-skill

# Specify repo, target, and scope
cerebro install pdf --repo anthropics/skills --target claude-code --scope user

# Preview without writing files
cerebro install frontend-design --dry-run
```

### Supported targets

| IDE | Flag | Scope: user | Scope: workspace |
|-----|------|-------------|-----------------|
| Claude Code | `claude-code` | `~/.claude/` | `.claude/` |
| VS Code | `vscode` | OS config dir¹ | `.vscode/` |
| OpenCode | `opencode` | OS config dir¹ | `.opencode/` |
| Copilot CLI | `copilot` | `~/.copilot/` | `.github/` |

¹ Windows: `%APPDATA%`, macOS: `~/Library/Application Support`, Linux: `~/.config`

---

## Catalog format

Artifact repositories publish a `cerebro-catalog.yaml` file at their root. See the [catalog format reference](https://github.com/CowboyLogic/cerebro-schema/blob/main/docs/catalog-format.md).

---

## Workspace setup (contributing)

```bash
git clone https://github.com/CowboyLogic/cerebro
node cerebro/bootstrap.js   # clones all sibling repos and installs deps
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for architecture, conventions, and the development workflow.

---

## Documentation

Suite-level docs live here in `docs/`:

- [Architecture Decision Records](docs/adr/) — technical and product decisions that govern all products
- [Roadmap](memories/roadmap.md) — current work status and backlog

---

## License

MIT
