# Contributing to Cerebro

Welcome. Cerebro is a suite of tools that makes AI artifact discovery and installation consistent across IDE ecosystems. Before contributing to any repo in the suite, read this document — it covers the full development workflow, repository relationships, and the decisions that govern all products.

> **Suite documentation home:** This repository (`cerebro`) is the authoritative source for suite-level design documents and architecture decisions. All other repos link back here.

---

## Repository map

| Repo | Role | Status |
|------|------|--------|
| [`cerebro`](https://github.com/CowboyLogic/cerebro) | CLI — primary user-facing product; suite docs home | Active |
| [`cerebro-schema`](https://github.com/CowboyLogic/cerebro-schema) | `@cowboylogic/cerebro-schema` — shared types, JSON Schema, validator | Active |
| [`cerebro-vscode-ext`](https://github.com/CowboyLogic/cerebro-vscode-ext) | VS Code extension | Active |
| [`cerebro-vs-ext`](https://github.com/CowboyLogic/cerebro-vs-ext) | Visual Studio extension | Placeholder |
| [`cerebro-intellij-ext`](https://github.com/CowboyLogic/cerebro-intellij-ext) | IntelliJ IDEA extension | Placeholder |
| [`cerebro-eclipse-ext`](https://github.com/CowboyLogic/cerebro-eclipse-ext) | Eclipse extension | Placeholder |

The repos are **separate git repositories** that form a coherent ecosystem. They are not a monorepo. Changes to one can ripple to others — read [Cross-repo changes](#cross-repo-changes) before starting work.

---

## Prerequisites

- **Node.js 20+** — required by all active packages
- **git**
- **GitHub CLI (`gh`)** — recommended for authentication and PR management

---

## Workspace setup

Clone and wire all repos with the bootstrap script from the CLI repo:

```bash
curl -fsSL https://raw.githubusercontent.com/CowboyLogic/cerebro/main/bootstrap.js -o bootstrap.js
node bootstrap.js [target-directory]
```

This clones all six repos into `./cerebro/` (or your chosen directory), installs `cerebro-schema` first (other packages depend on it via a `file:` link), then installs the remaining packages.

The resulting layout:

```
cerebro/
├── cerebro/               ← CLI (this repo)
├── cerebro-schema/        ← schema package
├── cerebro-vscode-ext/    ← VS Code extension
├── cerebro-vs-ext/
├── cerebro-intellij-ext/
└── cerebro-eclipse-ext/
```

---

## Development process

All work follows **Design → Specification → Tests → Code** as defined in [S-0006](docs/adr/S-0006-design-first-development-process.md). Code is always last.

| Phase | What happens | Artifact |
|-------|-------------|----------|
| **Design** | Problem understood; ADRs written for significant decisions | `docs/adr/` |
| **Specification** | Interface/contract and requirements defined | `docs/spec/` |
| **Tests** | Tests written from spec requirement IDs — all fail initially | Test files |
| **Code** | Code written to make failing tests pass | Source files |

No PR introducing a new `feat` is complete without an accepted specification.

---

## Branching

Trunk-based development. All branches are cut from `main` and merged back via pull request.

```
feat/<short-description>      new capability
fix/<short-description>       bug fix
docs/<short-description>      documentation only
chore/<short-description>     maintenance, deps, tooling
```

Branches are short-lived — days, not weeks. `main` is always in a releasable state.

---

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) are required. The type determines the version bump:

```
feat(scope): add catalog-first discovery       → minor bump
fix(scope): resolve path traversal in target   → patch bump
docs(adr): add S-0007 schema versioning        → no bump
chore(deps): bump ajv to 8.17.1                → no bump
feat!: rename ToolId values                    → major bump
```

`scope` is optional but helps in multi-component repos (e.g., `registry`, `installer`, `ui`).

A `BREAKING CHANGE:` footer on any commit type also triggers a major bump.

---

## Issues

Every code or documentation change should have a corresponding GitHub issue in the **affected repository**. Use the issue templates:

- **Feature** — new capability; includes the D→S→T→C phase checklist
- **Bug** — something broken; references the violated requirement if applicable
- **ADR** — architectural decision to be made; identifies affected repos

Issues are tracked on the [Cerebro project board](https://github.com/orgs/CowboyLogic/projects/6).

**Which repo do I open the issue in?**
Open it in the repo where the work will happen. If a change spans multiple repos, open a primary issue in the most affected repo and link to it from issues in the others.

---

## Pull requests

Every merge to `main` goes through a pull request. Fill in the PR template completely.

**CI must pass** before a PR can be merged. CI runs `npm run build` and `npm test` on every push and PR. A failure blocks merge.

---

## Cross-repo changes

**`cerebro-schema` is the contract between all products.** A change to its public types or the catalog format affects every consuming repo. Before changing anything in `cerebro-schema`:

1. Check whether a suite-level ADR (`S-XXXX` in [`docs/adr/`](docs/adr/README.md)) covers the change — if not, write one first
2. Open issues in all repos that will need corresponding updates
3. Note the impact in your PR's cross-repo section

**Schema versioning:** The `cerebro` field in `cerebro-catalog.yaml` (e.g., `cerebro: "1"`) is the catalog format version. The schema package retains validators for the current and previous major version — see [S-0007](docs/adr/S-0007-schema-versioning-strategy.md).

**Version coordination:**
- Minor and patch versions are managed independently per repo
- When `cerebro-schema` bumps major, all consuming repos must update their dependency and cut their own major release before shipping new features

---

## Release process

> Releases are managed by the project maintainer.

1. Bump version in `package.json` following the commit type → semver mapping above
2. Commit: `chore(release): bump version to X.Y.Z`
3. Merge to `main` via PR (CI must pass)
4. Trigger the **Release** workflow manually from the GitHub Actions tab with release notes
5. The workflow creates the git tag and GitHub release
6. Publish steps (npm, VS Code Marketplace) are separate manually-triggered workflow steps

---

## Architecture decisions

Suite-level decisions are recorded as `S-XXXX` ADRs in [`docs/adr/`](docs/adr/README.md). Product-specific decisions live in `docs/adr/` in the relevant repo.

Before making a significant structural decision, check whether an ADR already covers it. If you think an existing decision should change, open an issue — a superseding ADR must be accepted before the change is implemented.

Template: [`docs/adr/_template.md`](docs/adr/_template.md)

---

## Questions

Open a [GitHub Discussion](https://github.com/CowboyLogic/cerebro/discussions) or file an issue with the `status: needs-discussion` label.
