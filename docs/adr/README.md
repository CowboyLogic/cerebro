# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Cerebro suite and the `cerebro` CLI.

## Prefixes

| Prefix | Scope | Authority |
|--------|-------|-----------|
| `S-XXXX` | **Suite-level** — governs all Cerebro products | Authoritative; all products must comply |
| `CLI-XXXX` | **CLI-specific** — applies only to the `cerebro` CLI | Local to this repo |

Suite-level ADRs (`S-`) live here because the CLI repo is the authoritative documentation home for the suite (see S-0005). Product repos maintain their own unprefixed ADRs for decisions local to that implementation.

## Process

1. **Copy `_template.md`** — name the file `S-XXXX-short-title.md` or `CLI-XXXX-short-title.md`
2. **Set status to `Draft`** — open for discussion
3. **Get consensus** — decisions that affect other products require agreement before acceptance
4. **Set status to `Accepted`** and record the date
5. **Never edit an accepted ADR** — if a decision changes, create a new ADR that supersedes it

## Index

### Suite-level (S-series)

| ADR | Title | Status |
|-----|-------|--------|
| [S-0001](S-0001-schema-package-single-source-of-truth.md) | Schema package as single source of truth | Accepted |
| [S-0002](S-0002-catalog-format-standard.md) | Catalog format standard | Accepted |
| [S-0003](S-0003-installer-follows-catalog-targets.md) | Installer follows catalog-declared target paths | Accepted |
| [S-0004](S-0004-catalog-first-heuristic-fallback-discovery.md) | Catalog-first discovery with heuristic fallback | Accepted |
| [S-0005](S-0005-cli-as-documentation-home.md) | CLI as suite documentation home | Accepted |
| [S-0006](S-0006-design-first-development-process.md) | Design-first development process | Accepted |
| [S-0007](S-0007-schema-versioning-strategy.md) | Schema versioning strategy | Accepted |
| [S-0008](S-0008-developer-workflow.md) | Developer workflow | Accepted |

### CLI-specific (CLI-series)

| ADR | Title | Status |
|-----|-------|--------|
| [CLI-0001](CLI-0001-path-confinement-security.md) | Path confinement as non-negotiable security layer | Accepted |
