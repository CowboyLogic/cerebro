# S-0002: Catalog Format Standard

**Level:** Suite
**Status:** Accepted
**Date:** 2026-03-28

## Context

For Cerebro to serve as a universal artifact installer, repository maintainers need a standard file they can publish alongside their artifacts to make them discoverable and installable. Without a standard format, every tool must implement its own heuristics for every possible repository layout, and catalog authors have no target to aim at.

The format must be human-readable (catalog files are authored and maintained by humans), expressive enough to describe artifacts for multiple AI tools in a single file, and version-aware enough to support future evolution.

## Decision

The standard catalog file is `cerebro-catalog.yaml` (YAML format, fallback filename: `cerebro-catalog.yml`). Its structure:

- **Top-level:** `cerebro: "1"` (format version), optional `name`, optional `description`, required `artifacts[]`, optional `sets[]`
- **Artifact:** `id` (lowercase slug matching `^[a-z0-9][a-z0-9-]*[a-z0-9]$`), `name`, optional `description`, `type`, optional `tags[]`, required `compatibility[]`
- **Compatibility entry:** `tool` (ToolId), `scope[]` (Scope values), `files[]`
- **File entry:** `source` (repo-relative path), `target` (install-relative path)

Valid `type` values: `skill | agent | prompt | instruction | snippet | workflow | mcp-server | hook | other`
Valid `tool` values: `claude-code | copilot | opencode | visual-studio | intellij`
Valid `scope` values: `workspace | global`

The canonical schema is maintained in `@cowboylogic/cerebro-schema`.

## Rationale

**YAML over JSON:** Catalog files are human-authored. YAML's reduced punctuation and support for comments makes it more maintainable than JSON for this use case.

**Explicit `source → target` file mapping:** Giving catalog authors direct control over install paths decouples the installer from IDE-specific path conventions. It also allows a single artifact to install to different locations for different tools without requiring tool-specific installer logic.

**Structured `compatibility[]` over flat `targets[]`:** A flat list of target IDE names cannot express per-tool file mappings or per-tool scope restrictions. The structured model is more verbose but unambiguous.

**Format version field (`cerebro: "1"`):** Makes breaking format changes possible in future without requiring tool version detection.

## Consequences

- Catalog authors must understand the `compatibility[]` structure, which has more moving parts than a flat format.
- All tools must parse YAML (not JSON), requiring a YAML parsing dependency.
- The heuristic discovery fallback must synthesize the full `compatibility[]` structure even when no catalog is present.
- Future breaking changes to the format require incrementing the version string and handling migration.

## Compliance

All Cerebro tools must accept `cerebro-catalog.yaml` as their primary catalog input. Tools must validate catalog content against the schema from `@cowboylogic/cerebro-schema` before using it. A catalog that fails validation must be treated the same as a missing catalog (fall back to heuristic discovery) with an appropriate warning surfaced to the user.

---

*Supersedes: (none)*
*Related: [S-0001](S-0001-schema-package-single-source-of-truth.md), [S-0003](S-0003-installer-follows-catalog-targets.md), [S-0004](S-0004-catalog-first-heuristic-fallback-discovery.md)*
