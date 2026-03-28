# S-0007: Schema Versioning Strategy

**Level:** Suite
**Status:** Accepted
**Date:** 2026-03-28

## Context

When `@cowboylogic/cerebro-schema` introduces a breaking change to the catalog format, all consuming tools (CLI, VSCode extension, future IDE extensions) would need to be updated simultaneously to avoid breaking against existing community-published catalogs. This creates a hard coupling: a schema major version bump triggers mandatory, immediate updates across every product in the suite — with no migration window for catalog authors or tool consumers.

The suite also needs to distinguish between two separate versioning concerns that are related but move independently:

1. **Catalog format version** — the structure of `cerebro-catalog.yaml` files published by repository maintainers in the community.
2. **Package API version** — the npm semver of `@cowboylogic/cerebro-schema` consumed by tool developers.

Treating these as the same thing forces catalog authors and tool developers to move in lockstep, which is impractical at any scale.

## Decision

**The catalog format version is declared by the `cerebro` field** in every `cerebro-catalog.yaml` file (e.g., `cerebro: "1"`). This field is the authoritative version indicator for the catalog format.

**The `@cowboylogic/cerebro-schema` package retains validators for the current major version and the immediately preceding major version** (N and N-1). The `validateCatalog()` function detects the `cerebro` field value and routes to the correct validator automatically. To a tool, it is a single call — versioning is handled inside the package.

**When a new major version ships:**

1. `cerebro-schema` introduces the new format under a new `cerebro: "N"` declaration and a new npm major version
2. The previous version's validator is retained in the package — tools do not immediately break against old catalogs
3. Consuming tools (CLI, VSCode ext, etc.) update their `cerebro-schema` dependency to the new major — they gain the ability to handle both the old and new catalog format
4. Catalog authors migrate to the new format (`cerebro: "N"`) at their own pace
5. When the *next* major version (N+2) ships, support for version N is removed — catalog authors have had one full major version cycle to migrate

**Package structure for multi-version support:**

```
cerebro-schema/src/
  v1/
    types.ts       ← v1 type definitions (frozen once v2 ships)
    validate.ts    ← v1 validator (frozen)
  v2/              ← added when v2 ships
    types.ts
    validate.ts
  types.ts         ← re-exports current (latest) version types
  validate.ts      ← detects cerebro field, routes to correct validator
  index.ts
```

## Rationale

**Catalog authors are not tool developers.** A repository maintainer who publishes a `cerebro-catalog.yaml` should not be forced to update their file on a schedule dictated by internal tool releases. Decoupling catalog format migration from tool update cycles respects the community's autonomy.

**N-1 support is the right window.** Retaining support for all previous versions indefinitely creates unbounded maintenance debt. Supporting only the current version forces immediate migration. One major version cycle provides a predictable, reasonable migration window without accumulating legacy validators.

**`validateCatalog()` as the abstraction boundary.** Tools call one function; the versioning complexity lives inside the schema package, not spread across every consumer.

Alternatives considered:
- **Separate npm packages per format version** (`cerebro-schema-v1`, `cerebro-schema-v2`) — rejected; breaks the single source of truth principle and complicates consumer dependency management.
- **Version-specific subpath exports** (`@cowboylogic/cerebro-schema/v1`, `.../v2`) — rejected as primary API; acceptable as an internal implementation detail but not as the consumer-facing interface.
- **No versioning — breaking changes require all consumers to update immediately** — rejected; impractical once the suite has external catalog authors and contributors.

## Consequences

- `validateCatalog()` must inspect the `cerebro` field before applying validation rules.
- When a major version is released, a corresponding migration guide must be published documenting what changed between versions.
- V1 validators are frozen once v2 ships — no new rules are backported to old versions.
- Tools that do not update to the latest `cerebro-schema` major cannot handle new-format catalogs, but continue working against old ones. This is the intended behavior.

## Compliance

`cerebro-schema` must include validators for `cerebro: "N"` and `cerebro: "N-1"` where N is the current major. Any release that drops support for more than one previous major is in violation. The `validateCatalog()` export must accept catalogs of any supported version without requiring the caller to specify the version.

---

*Supersedes: (none)*
*Related: [S-0001](S-0001-schema-package-single-source-of-truth.md), [S-0002](S-0002-catalog-format-standard.md)*
