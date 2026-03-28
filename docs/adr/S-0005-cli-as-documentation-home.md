# S-0005: CLI as Suite Documentation Home

**Level:** Suite
**Status:** Accepted
**Date:** 2026-03-28

## Context

The Cerebro suite spans multiple repositories. Suite-level decisions, the catalog format specification, architectural context, and getting-started content need a single authoritative home. Without a designated home, this content risks being duplicated across repos (creating drift), scattered (making it hard to find), or simply absent (making onboarding difficult).

Additionally, Architecture Decision Records that govern the entire suite must live somewhere with clear authority — a repo that all other products treat as upstream context.

## Decision

The `cerebro` CLI repository (`CowboyLogic/cerebro`) is the authoritative home for suite-level documentation. This includes:

- Suite design brief and product vision (`docs/design/suite-brief.md`)
- Suite-level ADRs (`docs/adr/S-XXXX-*.md`)
- Catalog format reference documentation
- User-facing getting-started guides

Each product repository maintains its own `docs/` directory for implementation-specific documentation (product ADRs, architecture notes, contributor guides) and links back to the CLI repo for suite-level context. Product documentation must not duplicate or contradict suite-level content.

## Rationale

**CLI is the most accessible entry point.** New users encounter Cerebro most often through the CLI (`npx cerebro` or `npm install -g cerebro`). Placing authoritative docs here means the most likely first contact also leads to the most complete picture.

**Single place for suite-wide governance.** ADRs that affect all products need a home with unambiguous authority. A neutral "docs repo" would require everyone to check a separate repo with no code; the CLI repo is already a working product that everyone on the project touches.

**Avoids a proliferation of cross-repo docs PRs.** Suite-level content in the CLI repo means a decision change requires one PR in one repo, not coordinated PRs across six.

Alternatives considered:
- **Dedicated `cerebro-docs` repository** — rejected; adds a seventh repo to maintain, separates docs from the most-used product, and creates a "no code lives here" orphan repo.
- **Distributed — each repo documents its own piece** — rejected; suite-level concerns don't belong to any one product, creating ambiguity about where global content lives.

## Consequences

- Suite-level doc changes require commits to the CLI repo even when the change originates from work on a different product.
- Product teams must check CLI docs before making decisions that could conflict with suite-level guidance.
- The CLI repo's `docs/` directory carries governance weight; it must be maintained with corresponding care.

## Compliance

Suite-level ADRs use the `S-XXXX` prefix and live in `cerebro/docs/adr/`. Product-specific ADRs live in their own repo under `docs/adr/` with no prefix. Suite design documents live in `cerebro/docs/design/`. Product repos must not maintain their own copies of the suite design brief, catalog format spec, or any other content designated as suite-level.

---

*Supersedes: (none)*
*Related: (none)*
