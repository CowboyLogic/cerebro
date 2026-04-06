# S-0001: Schema Package as Single Source of Truth

**Level:** Suite<br />
**Status:** Accepted<br />
**Date:** 2026-03-28<br />

## Context

Each Cerebro tool initially defined its own catalog types and validation logic independently. The `cerebro` CLI used `ComponentType`, `TargetIDE`, and a flat `components[]` format. The `cerebro-vscode-ext` used a different set of types with a structured `artifacts[]` and `compatibility[]` model. Both maintained local copies of the schema file. This resulted in meaningful drift — the two implementations described the same catalog format in incompatible ways, and a `cerebro-catalog.yaml` valid for one tool would not necessarily be valid for the other.

As the suite grows to include additional IDE extensions and potentially other product surfaces, maintaining type consistency across an increasing number of independent implementations becomes untenable.

## Decision

All catalog type definitions, the canonical JSON Schema file, and the runtime ajv-based validator live exclusively in the `@cowboylogic/cerebro-schema` npm package. No other package in the suite defines, re-declares, or shadows these types independently.

## Rationale

A `cerebro-catalog.yaml` published by a repository maintainer must work correctly with every Cerebro tool. This guarantee cannot be maintained if each tool interprets the catalog through its own local type system. Centralizing the schema in a shared package makes the contract explicit, machine-verifiable, and impossible to silently drift.

Alternatives considered:
- **Each tool maintains its own copy, synced manually** — rejected; manual sync is a process that fails over time.
- **A shared Git submodule** — rejected; submodules add friction to every consumer's toolchain and don't provide npm-level dependency resolution.
- **One tool is designated authoritative and others copy from it** — rejected; this was the de facto situation before, and it failed.

## Consequences

- Adding a new catalog field, type value, or validation rule requires a change to `cerebro-schema` first, followed by consuming package updates.
- All tools get a guaranteed-consistent view of the catalog at compile time and runtime.
- `cerebro-schema` must maintain strong backward compatibility; breaking changes require a version bump and coordinated updates across all consumers.
- New Cerebro products have a clear, zero-ambiguity starting point for catalog types.

## Compliance

Every product repo must import catalog types from `@cowboylogic/cerebro-schema`. Local re-export aliases for backward compatibility (e.g., `export type ToolTarget = ToolId`) are permitted provided they re-export from the schema package and do not shadow or redefine the underlying type. Any type definition that duplicates a type in `cerebro-schema` is a violation.

---

*Supersedes: (none)*
*Related: [S-0002](S-0002-catalog-format-standard.md)*
