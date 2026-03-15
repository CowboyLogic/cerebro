# AI Artifact Installer

> Install AI components — skills, agents, prompts, and instructions — from GitHub repositories directly into your IDE.

Supports **Claude Code**, **VS Code** (Copilot), **OpenCode**, and **Copilot CLI** across Windows, macOS, and Linux. Run it interactively with a polished terminal UI, or wire it into scripts with the CLI.

---

## Features

- **Browse & install** from any public GitHub repository
- **Interactive TUI** with grouped, alphabetized component selection
- **4 IDE targets**: Claude Code, VS Code, OpenCode, Copilot CLI
- **2 scopes**: User (global) or Workspace (project-local)
- **Dry-run mode** to preview installs before committing
- **Cross-platform**: Windows, macOS, Linux
- **Lightweight**: 14 dependencies, no native binaries

### Default Repositories

| Repository | Contents |
|---|---|
| [`github/awesome-copilot`](https://github.com/github/awesome-copilot) | Curated Copilot extensions, agents, and prompts |
| [`anthropics/skills`](https://github.com/anthropics/skills) | Official Claude Code skills |

---

## Installation

**Requirements**: Node.js 18+

```bash
# Run directly with npx (no install needed)
npx tsx src/index.ts

# Or install globally
npm install -g .
ai-install
```

Set `GITHUB_TOKEN` to avoid rate limits when browsing large repositories:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

---

## Usage

### Interactive Mode (default)

```bash
npm start
# or
ai-install
```

Walks you through selecting a repository, browsing components by type, choosing your target IDE, and picking a scope — all in a guided terminal UI.

```
  ╔══════════════════════════════════════════════╗
  ║    AI Artifact Installer                    ║
  ║    Install skills, agents & prompts          ║
  ║    into your favorite IDE                    ║
  ╚══════════════════════════════════════════════╝

◆  Where would you like to browse components?
│  ● ★ github/awesome-copilot  Curated Copilot extensions & prompts
│  ○ ✨ anthropics/skills      Official Claude Code skills
│  ○ 🌐 Custom repository      Enter a GitHub URL or owner/repo
└
```

### Browse Components

```bash
# Browse default repositories
ai-install browse

# Browse a specific repo
ai-install browse anthropics/skills

# Filter by component type
ai-install browse github/awesome-copilot --type agent

# Browse any public GitHub repo
ai-install browse owner/repo
ai-install browse https://github.com/owner/repo
```

### Direct Install

```bash
# Install by name (searches default repos)
ai-install install brand-guidelines

# Specify repo, target IDE, and scope
ai-install install pdf --repo anthropics/skills --target claude-code --scope user

# Preview without writing any files
ai-install install frontend-design --dry-run

# Install into current workspace
ai-install install a11y --repo github/awesome-copilot --target vscode --scope workspace
```

### List Supported Targets

```bash
ai-install targets
```

---

## Component Types

| Type | Icon | Description |
|---|---|---|
| `skill` | 🎯 | Claude Code skills (SKILL.md + supporting files) |
| `agent` | 🤖 | Custom AI agents with defined personas and tools |
| `prompt` | 💬 | Reusable prompt templates |
| `instruction` | 📋 | IDE-level behavior instructions (CLAUDE.md, copilot-instructions.md) |
| `snippet` | ✂️ | Code snippets for editors |
| `workflow` | 🔄 | Multi-step automated workflows |

---

## Target IDEs

| IDE | Flag | Scope: User | Scope: Workspace |
|---|---|---|---|
| Claude Code | `claude-code` | `~/.claude/` | `.claude/` |
| VS Code | `vscode` | OS config dir¹ | `.vscode/` |
| OpenCode | `opencode` | OS config dir¹ | `.opencode/` |
| Copilot CLI | `copilot` | `~/.github/` | `.github/` |

¹ Windows: `%APPDATA%`, macOS: `~/Library/Application Support`, Linux: `~/.config`

### What gets installed where

**Claude Code — Skill**
```
~/.claude/skills/<name>/SKILL.md
~/.claude/skills/<name>/<supporting-files>
```

**Claude Code — Instruction**
```
~/.claude/CLAUDE.md          # user scope
.claude/CLAUDE.md            # workspace scope
```

**VS Code / Copilot — Instruction or Prompt**
```
.github/copilot-instructions.md   # appended, not overwritten
```

**Copilot CLI — Agent**
```
~/.github/agents/<name>.md
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | Personal access token for higher GitHub API rate limits (5000 req/hr vs 60) |

---

## CLI Reference

```
Usage: ai-install [options] [command]

Commands:
  interactive          Launch interactive installer UI (default)
  browse [repo]        List components in a repository
  install <component>  Install a component by name
  targets              Show supported IDE targets
  help [command]       Show help for a command

Options for browse:
  -t, --type <type>    Filter by type: skill | agent | prompt | instruction | snippet | workflow

Options for install:
  -r, --repo <repo>    GitHub repo (owner/repo or URL)
  -t, --target <ide>   Target IDE: claude-code | opencode | vscode | copilot  [default: claude-code]
  -s, --scope <scope>  Scope: user | workspace  [default: workspace]
  --dry-run            Preview install paths without writing files
```

---

## Architecture

```
src/
├── index.ts              CLI entry point (commander)
├── ui/
│   └── interactive.ts    Interactive TUI (@clack/prompts)
├── core/
│   ├── types.ts          Shared types and constants
│   ├── github.ts         GitHub API — tree, contents, raw file fetching
│   ├── registry.ts       Component discovery from repo file tree
│   └── installer.ts      Install orchestrator
├── targets/
│   ├── base.ts           Abstract BaseInstaller
│   ├── claude-code.ts    Claude Code installer
│   ├── opencode.ts       OpenCode installer
│   ├── vscode.ts         VS Code installer
│   ├── copilot.ts        Copilot CLI installer
│   └── index.ts          Installer registry
└── utils/
    ├── platform.ts       OS detection and config paths
    ├── paths.ts          IDE path resolution, workspace root finder
    └── theme.ts          Terminal colors, icons, and layout helpers
```

---

## Adding a Custom Repository

Any public GitHub repository works. Components are auto-detected based on file patterns:

| File/Pattern | Detected as |
|---|---|
| `SKILL.md` | Claude Code Skill |
| `CLAUDE.md` / `claude.md` | Claude Code Instruction |
| `copilot-instructions.md` | Copilot Instruction |
| `agent.md` / `agent.yaml` | Agent |
| `prompt.md` | Prompt |
| Files under `skills/`, `agents/`, `prompts/`, `instructions/` | Respective type |

```bash
# Use any GitHub repo
ai-install browse my-org/my-ai-components
ai-install install my-skill --repo my-org/my-ai-components --target claude-code
```

---

## License

MIT
