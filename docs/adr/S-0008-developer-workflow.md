# S-0008: Developer Workflow

**Level:** Suite
**Status:** Accepted
**Date:** 2026-03-28

## Context

With six repositories forming a coherent ecosystem, and the expectation of external contributors over time, the suite needs an explicit, documented developer workflow. Without one, branching strategies, commit styles, and release mechanics will diverge across repos — making the project harder to navigate for contributors and harder to automate for maintainers.

## Decision

### Branching — Trunk-Based Development

All repos use trunk-based development. Work happens in short-lived branches cut directly from `main` and merged back via pull request. There are no long-running branches (`develop`, `release/*`, `hotfix/*`).

Branch naming convention:
```
feat/<short-description>      new capability
fix/<short-description>       bug fix
docs/<short-description>      documentation only
chore/<short-description>     maintenance, deps, tooling
```

### Commit Messages — Conventional Commits

All commits follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<optional scope>): <short summary>

feat(registry): add catalog-first discovery with yaml validation
fix(installer): resolve path traversal in target resolution
docs(adr): add S-0007 schema versioning strategy
chore(deps): bump ajv to 8.17.1
feat!: rename TargetIDE to ToolId — breaking API change
```

Type-to-version mapping:
- `feat:` → minor version bump
- `fix:` → patch version bump
- `feat!:` or `BREAKING CHANGE:` footer → major version bump
- `docs:`, `chore:` → no version bump

### CI — Automated Verification

Every pull request must pass automated CI before it can be merged. CI runs `npm run build` and `npm test` on every push and PR. A failure blocks merge. There are no exceptions.

Branch protection on `main` is configured to require the CI status check to pass. Admin bypass is enabled for the sole maintainer during the solo development phase — this will be removed when external contributors join.

### Pull Requests

Every change to `main` goes through a pull request. The PR template enforces:
- A linked GitHub issue
- The correct conventional commit type
- Process compliance (spec exists, tests written, build passes)
- Cross-repo impact acknowledgment

**Reviewer requirement:** During solo development, self-merge is permitted. When the first external contributor joins, a required reviewer will be added to branch protection.

### Release Process

Releases are **always manually triggered** — there is no automatic release on merge to `main`. The process:

1. Developer bumps the version in `package.json` following semver rules, following the type-to-version mapping above
2. Commit the version bump: `chore(release): bump version to X.Y.Z`
3. Merge to `main` via PR (CI must pass)
4. Manually trigger the **Release** GitHub Actions workflow, providing release notes
5. The workflow reads the version from `package.json`, creates a git tag (`vX.Y.Z`), creates a GitHub release, and (for applicable packages) triggers the publish step
6. Publish is always a separate, manually triggered workflow step — never automatic

**Version coordination for major releases:** When `cerebro-schema` bumps major, all consuming repos must update their dependency and release their own major version before shipping new features. The schema repo's major version gates the suite's major version.

## Rationale

**Trunk-based over GitFlow:** GitFlow's branch overhead (develop, release, hotfix) is appropriate for teams with strict release schedules and parallel version maintenance. This suite has one maintainer, short cycle times, and no parallel supported versions — trunk-based is far simpler and produces an always-releasable `main`.

**Conventional Commits:** Provides a machine-readable signal for version bumps, enables automated changelog generation when the process matures, and gives contributors a clear, unambiguous commit format to follow.

**Manual releases:** Automated releases on merge require high confidence that every merge is release-worthy. During early development, some merges are interim steps. Manual triggering keeps the maintainer in control of what constitutes a release. The process can be automated once it has been proven stable and predictable.

## Consequences

- Contributors must learn Conventional Commits — addressed by CONTRIBUTING.md documentation.
- A CI failure on a feature branch is immediately visible and blocks merge — this is the intended behavior.
- Version bumps require a deliberate commit and manual trigger — this is the intended behavior during the solo phase.
- When the release process is mature, automating steps 4–6 via a commit convention parser (e.g., semantic-release) is a natural evolution — no architectural change required.

## Compliance

All repos in the suite must have:
- A CI workflow (`.github/workflows/ci.yml`) that runs on every PR and push
- Branch protection on `main` requiring the CI status check to pass
- A PR template (`.github/PULL_REQUEST_TEMPLATE.md`) following the suite standard
- A Release workflow (`.github/workflows/release.yml`) triggered by `workflow_dispatch`

Branch protection must **not** require external reviewer approval during the solo development phase. This setting is reviewed and updated when the first external contributor joins.

---

*Supersedes: (none)*
*Related: [S-0005](S-0005-cli-as-documentation-home.md), [S-0006](S-0006-design-first-development-process.md), [S-0007](S-0007-schema-versioning-strategy.md)*
