# Cerebro

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/CowboyLogic/cerebro/releases)
[![Build](https://github.com/CowboyLogic/cerebro/actions/workflows/ci.yml/badge.svg)](https://github.com/CowboyLogic/cerebro/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/CowboyLogic/cerebro)](LICENSE)

![Cerebro](docs/img/cerebro-logo-dark.png)

**Expand your code assist agent**

Cerebro is a command-line tool for discovering and installing AI components — skills, agents, prompts, instructions, and more — from GitHub repositories into your AI coding tools.

**Requirements:** Node.js 20+

```bash
# Run directly (no install needed)
npx cerebro

# Or install globally
npm install -g .
cerebro
```

Set `GITHUB_TOKEN` (or `GH_TOKEN`) to raise the GitHub API rate limit:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

Full documentation: [docs/](./docs/index.md)

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

## License

Apache 2.0
