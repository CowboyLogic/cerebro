# S-0004: Catalog-First Discovery with Heuristic Fallback

**Level:** Suite
**Status:** Accepted
**Date:** 2026-03-28

## Context

Cerebro's value proposition includes the ability to browse and install AI artifacts from any public GitHub repository — not just repositories that have explicitly adopted the Cerebro catalog format. The vast majority of existing AI artifact repositories do not have a `cerebro-catalog.yaml`. Requiring one as a prerequisite would make Cerebro useful only for a small set of early-adopter repos at launch, severely limiting its practical utility.

At the same time, heuristic discovery over an arbitrary repo tree produces lower-fidelity results than a catalog — synthesized install paths may not be exactly what the artifact author intended, and artifact descriptions may be absent or incomplete.

## Decision

All Cerebro tools implement a two-stage discovery strategy:

1. **Catalog stage:** Attempt to fetch and validate `cerebro-catalog.yaml` (fallback: `cerebro-catalog.yml`) from the repository root. If found and valid, use it exclusively — do not run heuristics.
2. **Heuristic stage:** If no valid catalog is found, walk the repository file tree and synthesize `Artifact` objects using known directory-structure patterns (directory markers like `SKILL.md`, `agent.yaml`; flat collection directories like `skills/`, `agents/`, `prompts/`).

Both stages must produce results that conform to the same `Artifact` shape with a populated `compatibility[]`. Downstream code (installer, UI) must not contain separate code paths for catalog-discovered vs heuristic-discovered artifacts.

## Rationale

**Maximizes day-one utility.** Cerebro works against the existing ecosystem of AI artifact repos without requiring any action from repo maintainers.

**Creates a natural adoption path.** Teams that want precise install control add a `cerebro-catalog.yaml`. Teams that don't still get reasonable results. There is no cliff.

**Single downstream shape.** Requiring both discovery strategies to produce the same `Artifact` type prevents the UI and installer layers from needing to handle two different data shapes — simplifying all code downstream of discovery.

Alternatives considered:
- **Catalog-only, require adoption** — rejected; too high a barrier at launch, insufficient initial catalog coverage.
- **Heuristic-only** — rejected; provides no path for catalog authors to express intent, and forces all path decisions into the heuristic layer.
- **Two separate shapes for catalog vs heuristic results** — rejected; causes complexity to leak throughout the entire codebase.

## Consequences

- Heuristic patterns (`DIR_MARKER_PATTERNS`, `FLAT_COLLECTION_DIRS`, `defaultTargetPath()` in `registry.ts`) must be kept current with evolving AI tool conventions. These are maintenance obligations.
- Users installing heuristic-discovered artifacts should understand results are best-effort. Tools should surface this distinction visually (future work — not yet implemented).
- A repo that has an invalid `cerebro-catalog.yaml` falls back to heuristic, which may silently produce unexpected results. The validation failure should be surfaced as a warning.

## Compliance

All discovery implementations must attempt catalog loading before running heuristics. The result type of both paths must be `Artifact[]` with a valid `compatibility[]` array — never a simplified or stripped shape. Discovery implementations that skip the catalog stage or return a different shape for heuristic results are in violation.

---

*Supersedes: (none)*
*Related: [S-0002](S-0002-catalog-format-standard.md), [S-0003](S-0003-installer-follows-catalog-targets.md)*
