# S-0006: Design-First Development Process

**Level:** Suite
**Status:** Accepted
**Date:** 2026-03-28

## Context

The initial Cerebro codebase was written ahead of formal specifications. Tests were written to match existing code rather than to verify requirements, making it difficult to distinguish intended behavior from implementation accident. As the suite grows to multiple products targeting different ecosystems, the cost of unspecified behavior compounds — products diverge subtly, changes require archaeological effort to understand intent, and there is no objective definition of "done" for any given feature.

The goal of the suite is not feature novelty; it is to solve the same problem consistently across different IDE ecosystems. Consistency at that scale requires a shared contract that predates the code.

## Decision

All new features and significant changes across the Cerebro suite follow this order, without exception:

**Design → Specification → Tests → Code**

1. **Design** — The problem is understood. Significant decisions are captured as ADRs. The suite design brief is updated if scope or goals change. No specification work begins until the design is stable enough to write against.

2. **Specification** — A spec document is written and accepted before implementation begins. A spec consists of two parts:
   - **Interface / Contract** — the public shape of the component: TypeScript interfaces, command signatures, data contracts, event shapes, error types. This is what callers depend on.
   - **Requirements** — numbered, verifiable statements of what the implementation must satisfy to be considered complete. Requirements use RFC 2119 language: **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY**.

3. **Tests** — Written directly from the specification. Each requirement maps to one or more tests. A test description references its requirement ID so the traceability is explicit. Tests are written before the code that satisfies them.

4. **Code** — Written to make failing tests pass. A feature is complete when all requirement-derived tests pass and no requirement is untested.

## Rationale

**Specifications before tests, not after.** Tests written against existing code verify what the code does, not what it should do. The distinction matters: a bug baked in early becomes a test expectation, and the test suite becomes a specification of the wrong behavior.

**Interface/contract + requirements, not a rigid functional spec.** A full functional spec that prescribes every interaction leaves no room for implementation judgment and becomes outdated quickly. The contract defines what callers depend on; requirements define what must be true. Both are stable. How the code achieves them is not prescribed.

**Consistency across ecosystems is the goal.** Each Cerebro product (CLI, VSCode extension, future IDE extensions) solves the same problem in a different surface. Shared specifications ensure they solve it the same way — same requirements, same contracts, different implementations.

**Tests derive from specs, not the other way around.** Requirement traceability means any test failure points directly to a specific requirement. Any untested requirement is visibly incomplete. There is no ambiguity about what the test suite covers.

## Consequences

- No code is written for a new feature without an accepted specification in `docs/spec/`.
- Existing code written before this process was established (including the current CLI implementation) should be considered provisional until its specification is written and its tests are updated to derive from that specification.
- Specifications are living documents while in `Draft` status; once `Accepted`, they follow the same amendment-via-new-document rule as ADRs.
- The cost of a feature increases slightly upfront. The cost of changing it, debugging it, and porting it to a new product decreases significantly.

## Compliance

Any PR that introduces new user-facing behavior without a corresponding accepted specification in `docs/spec/` is incomplete. Code review must verify:
1. A spec exists and is in `Accepted` state
2. Tests reference requirement IDs from that spec
3. All `MUST` requirements have test coverage

---

*Supersedes: (none)*
*Related: [S-0005](S-0005-cli-as-documentation-home.md)*
