# Contributing

Welcome. Read this document before making changes to any Cerebro repo — it covers conventions, workflow, and how the suite fits together.

## Repository map

| Repo | Role | Status |
|------|------|--------|
| [`cerebro`](https://github.com/CowboyLogic/cerebro) | CLI + TUI + MCP server; suite docs home | Active |
| [`cerebro-schema`](https://github.com/CowboyLogic/cerebro-schema) | Shared types, JSON Schema, AJV validator | Active |
| [`cerebro-vscode-ext`](https://github.com/CowboyLogic/cerebro-vscode-ext) | VS Code extension | Active |
| [`cerebro-vs-ext`](https://github.com/CowboyLogic/cerebro-vs-ext) | Visual Studio extension | Placeholder |
| [`cerebro-intellij-ext`](https://github.com/CowboyLogic/cerebro-intellij-ext) | IntelliJ IDEA extension | Placeholder |
| [`cerebro-eclipse-ext`](https://github.com/CowboyLogic/cerebro-eclipse-ext) | Eclipse extension | Placeholder |

These are **separate git repositories**, not a monorepo. See [Cross-repo changes](#cross-repo-changes).

---

## Prerequisites

- **Node.js 20+**
- **git**
- **GitHub CLI (`gh`)** — recommended for token auth and PR management

---

## Workspace setup

```bash
curl -fsSL https://raw.githubusercontent.com/CowboyLogic/cerebro/main/bootstrap.js -o bootstrap.js
node bootstrap.js [target-directory]
```

The bootstrap script clones all six repos into a single workspace folder, installs `cerebro-schema` first (other packages depend on it via a `file:` link), then installs remaining packages.

Resulting layout:

```
cerebro/
├── cerebro/               ← CLI (this repo)
├── cerebro-schema/        ← schema package
├── cerebro-vscode-ext/    ← VS Code extension
├── cerebro-vs-ext/
├── cerebro-intellij-ext/
└── cerebro-eclipse-ext/
```

After setup, all `npm` commands should be run inside the individual package directory.

---

## Development workflow

All contributions follow **Design → Specification → Tests → Code** order ([ADR S-0006](../adr/S-0006-design-first-development-process.md)):

| Phase | Description | Artifact |
|---|---|---|
| **Design** | Understand the problem; write ADRs for significant decisions | `docs/adr/` |
| **Specification** | Define the interface and acceptance requirements | `docs/spec/` |
| **Tests** | Write failing tests from the spec's requirement IDs | `tests/` |
| **Code** | Write code to make tests pass | `src/` |

A `feat` PR is not complete without an accepted spec.

### Running tests

```bash
# Run all tests once
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Test suites separately
npm run test:unit
npm run test:integration
npm run test:cli
```

Tests use [Vitest](https://vitest.dev/) with `memfs` for filesystem isolation.

### Building

```bash
npm run build
```

Compiles TypeScript to `bin/`. The `postbuild` script marks `bin/cerebro.js` as executable.

### Development run

```bash
npm run dev
```

Runs via `tsx` with file watching. Changes take effect immediately without rebuilding.

---

## Branching

Trunk-based. Short-lived branches from `main`, merged via pull request.

```
feat/<short-description>      new capability
fix/<short-description>       bug fix
docs/<short-description>      documentation only
chore/<short-description>     maintenance, deps, tooling
```

`main` is always releasable.

---

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) are required:

```
feat(scope): add catalog-first discovery           → minor bump
fix(scope): resolve path traversal in targets      → patch bump
docs(adr): add S-0007 schema versioning            → no bump
chore(deps): bump ajv to 8.17.1                    → no bump
feat!: rename ToolId values                        → major bump
```

A `BREAKING CHANGE:` footer on any commit type triggers a major bump.

---

## Pull requests

Every merge to `main` goes through a PR. CI must pass: the pipeline runs `npm run build` and `npm test`.

Fill in the PR template completely, including the cross-repo impact section if relevant.

---

## Cross-repo changes

**`cerebro-schema` is the contract between all products.** A change to its public types or the catalog format affects every consuming repo.

Before changing anything in `cerebro-schema`:

1. Check for an existing suite ADR (`S-XXXX` in [`docs/adr/`](../adr/README.md)). Write one if none exists.
2. Open issues in all repos that need corresponding updates.
3. Call out the impact in the PR's cross-repo section.

**Schema versioning:** The `cerebro` field in `cerebro-catalog.yaml` (e.g. `cerebro: "1"`) is the catalog format version. The schema package retains validators for the current and previous major version — see [ADR S-0007](../adr/S-0007-schema-versioning-strategy.md).

---

## Issues

Open issues in the **repo where the work will happen**. For changes spanning multiple repos, open a primary issue in the most affected repo and link from issues in the others.

Issue types:
- **Feature** — new capability; includes the D→S→T→C phase checklist
- **Bug** — broken behaviour; reference the violated requirement if applicable
- **ADR** — architectural decision to be recorded

Issues are tracked on the [Cerebro project board](https://github.com/orgs/CowboyLogic/projects/6).

---

## Architecture decisions

Suite decisions are `S-XXXX` ADRs in [`docs/adr/`](../adr/README.md). Product-specific decisions live in `docs/adr/` in the relevant repo.

Check for an existing ADR before making significant structural decisions. If you think an existing decision should change, open an issue — a superseding ADR must be accepted before the change is implemented.

Template: [`docs/adr/_template.md`](../adr/_template.md)

---

## Questions

Open a [GitHub Discussion](https://github.com/CowboyLogic/cerebro/discussions) or file an issue with the `status: needs-discussion` label.
