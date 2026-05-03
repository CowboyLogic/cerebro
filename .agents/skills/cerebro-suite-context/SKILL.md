---
name: cerebro-suite-context
description: Use this skill when working in any Cerebro repository. Provides workspace layout, inter-repo relationships, bootstrap process, and dependency wiring. Trigger when asked about workspace setup, sibling repos, how repos relate, or why a file:// dependency is used.
---

# Cerebro Suite Context

## What the Suite Is

Cerebro is a multi-repo suite of tools for discovering and installing AI artifacts (skills, agents, prompts, instructions, hooks, MCP servers) from GitHub repositories into IDEs.

| Repo | Role | Status |
|------|------|--------|
| `cerebro` | CLI installer + canonical suite docs | Active |
| `cerebro-schema` | Shared JSON Schema, TypeScript types, AJV validator | Active |
| `cerebro-vscode-ext` | VS Code extension | Active |
| `cerebro-vs-ext` | Visual Studio extension | Planned |
| `cerebro-intellij-ext` | IntelliJ IDEA plugin | Planned |
| `cerebro-eclipse-ext` | Eclipse plugin | Planned |

Suite documentation home: `CowboyLogic/cerebro` (this or the sibling repo).
Architecture Decision Records: `cerebro/docs/adr/`.

## Workspace Layout

All repos are cloned as siblings under a common parent directory:

```
workspace/
├── cerebro/           ← CLI + suite docs
├── cerebro-schema/    ← shared schema package
├── cerebro-vscode-ext/
├── cerebro-vs-ext/
├── cerebro-intellij-ext/
└── cerebro-eclipse-ext/
```

`cerebro` and `cerebro-vscode-ext` both depend on `cerebro-schema` via a `file:../cerebro-schema` entry in `package.json`. This means **all three repos must be siblings for local development and CI to work**.

## Bootstrap

Use the workspace bootstrap script — do not clone repos manually:

```bash
git clone https://github.com/CowboyLogic/cerebro
node cerebro/bootstrap.js
```

`bootstrap.js` clones all sibling repos, installs `cerebro-schema` first (so the `file:` link resolves), then installs the dependent repos.

## CI Dependency Pattern

CI workflows for `cerebro` and `cerebro-vscode-ext` check out `cerebro-schema` as a sibling using a fine-grained PAT stored as `CEREBRO_SCHEMA_READ_TOKEN` (org-level Actions secret and org-level Dependabot secret). The schema package is installed before the dependent package's `npm ci` runs, because the `prepare` script (`tsc`) runs during install.

```yaml
- name: Checkout cerebro-schema
  uses: actions/checkout@v6
  with:
    repository: CowboyLogic/cerebro-schema
    path: cerebro-schema
    token: ${{ secrets.CEREBRO_SCHEMA_READ_TOKEN }}

- name: Install cerebro-schema dependencies
  working-directory: cerebro-schema
  run: npm ci

- name: Install dependencies
  working-directory: cerebro   # or cerebro-vscode-ext
  run: npm ci
```

## Catalog Format

Artifact repositories publish a `cerebro-catalog.yaml` file validated against `@cowboylogic/cerebro-schema`. The schema package is the single source of truth for types, validation, and the JSON Schema file.
