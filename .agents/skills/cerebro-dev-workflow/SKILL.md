---
name: cerebro-dev-workflow
description: Use this skill for any development workflow question in a Cerebro repository — branch strategy, commit format, PR process, CI gate, release process, or versioning. Trigger when asked how to make changes, create a branch, write a commit message, open a PR, or cut a release.
---

# Cerebro Development Workflow

## Branch Strategy

```
main        ← stable, released code only
  └── develop  ← integration branch; PRs target this
        └── feat/my-feature   ← short-lived feature branch
        └── fix/my-bug
        └── docs/my-docs
        └── chore/my-chore
```

- **Never commit or push directly to `main` or `develop`**
- Branch from `develop`; PR back to `develop`
- `develop` → `main` is a deliberate release step, not routine work
- Branch names: `feat/`, `fix/`, `docs/`, `chore/` prefix, lowercase, hyphens

## Commit Format — Conventional Commits

```
<type>(<optional scope>): <short description>

[optional body]
```

| Type | When | Semver impact |
|------|------|---------------|
| `feat` | New capability | Minor bump |
| `fix` | Bug fix | Patch bump |
| `feat!` / `fix!` | Breaking change | Major bump |
| `docs` | Docs only | No bump |
| `chore` | Tooling, deps, CI | No bump |
| `refactor` | No behaviour change | No bump |
| `test` | Tests only | No bump |

Examples:
```
feat(cli): add --dry-run flag to install command
fix(schema): reject catalog entries with empty files array
chore(deps): bump actions/checkout from 4 to 6
```

## CI Gate

Branch protection on `main` (and optionally `develop`) requires `CI / Build & Test` to pass before merge. This is an aggregate job — it passes only when all matrix legs (ubuntu-latest, windows-latest) succeed.

The required check name is exactly: **`CI / Build & Test`**

Do not rename the aggregate job without updating branch protection rules.

## Pull Request Process

1. Branch from `develop`
2. Make changes; keep commits atomic and conventionally formatted
3. Push branch; open PR targeting `develop`
4. CI must pass before merge
5. Squash or rebase — no merge commits on `develop`

## Release Process

Releases are manual. When `develop` is stable and ready:

1. PR `develop` → `main`
2. After merge, trigger the `Release` workflow via **Actions → Release → Run workflow** (workflow_dispatch)
3. The workflow reads the version from `package.json`, creates a git tag, and publishes a GitHub Release

Do not create tags manually. Do not push directly to `main`.

## Versioning

- `cerebro`, `cerebro-schema`, `cerebro-vscode-ext` version independently for minor/patch changes
- Major versions are coordinated across the suite (breaking catalog format changes require a suite-wide major bump)
- Version lives in `package.json`; bump it manually before triggering a release

## TypeScript Notes

- `cerebro-schema` pins TypeScript to `~5.8.3` — do not widen this range until the TypeScript 6 migration is planned (see `docs/adr/` for context)
- `cerebro` uses `moduleResolution: "bundler"` with ESM — do not change without checking all import paths
- `cerebro-schema` outputs CommonJS (required by VS Code extension host) — do not change `module: "CommonJS"` without coordinating with `cerebro-vscode-ext`
