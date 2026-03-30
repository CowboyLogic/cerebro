# SPEC-0005 — Catalog

**Product:** cerebro CLI
**Status:** Draft
**Date:** 2026-03-29
**Area:** core
**Depends on:** SPEC-0003 (GitHub Client), `@cowboylogic/cerebro-schema` (CerebroCatalog, Artifact, validateCatalog)
**Consumed by:** SPEC-0004 (Session — catalog cache), TUI TypeMenu + ItemList screens, CLI list command, MCP list_artifacts tool

---

## Overview

Given a GitHub repository, returns a list of `Artifact` objects representing the installable items in that repo. Attempts to read and validate a `cerebro-catalog.yaml` from the repo root first. If the file is absent or invalid, falls back to heuristic scanning of the repository tree to detect skills and instructions by their structural markers.

The catalog module is the sole entry point for artifact discovery — callers never interact with the GitHub client directly for this purpose.

---

## Scope

**In scope:**
- Fetching and validating `cerebro-catalog.yaml` from a repo root
- Heuristic scanning to detect skills (`SKILL.md` marker) and instructions (`*.instructions.md` files)
- Synthesising `Artifact` objects from heuristic results
- Filtering results by artifact type and keyword (name match)

**Out of scope:**
- Caching (handled by SPEC-0004 Session; the catalog module always fetches fresh unless the session supplies a cache hit)
- Resolving install paths (SPEC-0001)
- Performing installs (SPEC-0006)
- Deep content search (deferred to a future release)

---

## Public Interface

```typescript
import type { Artifact, ArtifactType } from '@cowboylogic/cerebro-schema';
import type { GitHubClient } from './github.js';

export type CatalogSource = 'catalog' | 'heuristic';

export interface CatalogResult {
  /** Whether results came from a cerebro-catalog.yaml or heuristic scan. */
  source: CatalogSource;
  /** All artifacts found in the repository. */
  artifacts: Artifact[];
}

export interface CatalogFilter {
  /** If set, only return artifacts of this type. */
  type?: ArtifactType;
  /**
   * If set, only return artifacts whose name contains this string
   * (case-insensitive). Name-only match for MVP.
   */
  keyword?: string;
}

/**
 * Fetch and return the artifact list for a GitHub repository.
 * Tries cerebro-catalog.yaml first; falls back to heuristic scan.
 *
 * @param github  - GitHub client instance from the active session
 * @param owner   - GitHub repository owner
 * @param repo    - GitHub repository name
 * @param filter  - Optional filter applied to results before returning
 */
export function fetchCatalog(
  github: GitHubClient,
  owner: string,
  repo: string,
  filter?: CatalogFilter
): Promise<CatalogResult>;
```

---

## Heuristic Detection Rules

When `cerebro-catalog.yaml` is absent or invalid, the heuristic scanner walks the repository tree and synthesises `Artifact` objects using the following rules:

### Skill detection
A directory is recognised as a **skill** if it contains a file named `SKILL.md` at its root level.

**Scan locations (in order):**
1. The repository root
2. Any directory named `skills/` at the root
3. Any directory named `agents/` at the root (skills may also live here per agentskills.io conventions)

**Synthesised Artifact:**
- `type`: `'skill'`
- `source`: relative path to the skill directory (e.g., `skills/git-commit-assistant/`)
- `id`: directory name, lowercased, non-slug characters replaced with `-`, leading/trailing `-` stripped
- `name`: directory name with hyphens/underscores replaced by spaces, title-cased
- `description`: first non-empty line of `SKILL.md` after the frontmatter, if readable; omitted otherwise
- `supports`: not set (assumed compatible with all targets)

### Instruction detection
A file is recognised as an **instruction** if its name matches `*.instructions.md`.

**Scan locations (in order):**
1. The repository root
2. Any directory named `instructions/` at the root
3. `.github/instructions/` at the root (VS Code Copilot convention)

**Synthesised Artifact:**
- `type`: `'instruction'`
- `source`: relative path to the file (e.g., `instructions/python.instructions.md`)
- `id`: filename without `.instructions.md` extension, lowercased, slugified
- `name`: filename stem with hyphens/underscores replaced by spaces, title-cased
- `description`: content of the `description` frontmatter field if present; omitted otherwise
- `supports`: not set

---

## Requirements

| ID | Keyword | Requirement |
|----|---------|-------------|
| CAT-REQ-0001 | MUST | `fetchCatalog()` MUST first attempt to fetch `cerebro-catalog.yaml` from the repository root via `github.fetchFileContent()`. |
| CAT-REQ-0002 | MUST | If `cerebro-catalog.yaml` is found, it MUST be parsed as YAML and validated using `validateCatalog()` from `@cowboylogic/cerebro-schema`. |
| CAT-REQ-0003 | MUST | If the catalog file is valid, `fetchCatalog()` MUST return `{ source: 'catalog', artifacts: [...] }` and MUST NOT perform a heuristic scan. |
| CAT-REQ-0004 | MUST | If the catalog file is absent (404) or fails validation, `fetchCatalog()` MUST fall back to the heuristic scanner and return `{ source: 'heuristic', artifacts: [...] }`. |
| CAT-REQ-0005 | SHOULD | If the catalog file is present but fails validation, the error details SHOULD be logged (not shown to the user by default) to aid catalog authors debugging their file. |
| CAT-REQ-0006 | MUST | The heuristic scanner MUST detect skills by the presence of `SKILL.md` in a directory. |
| CAT-REQ-0007 | MUST | The heuristic scanner MUST detect instructions by the `*.instructions.md` filename pattern. |
| CAT-REQ-0008 | MUST | The heuristic scanner MUST scan the locations defined in the Heuristic Detection Rules above, in the specified order. |
| CAT-REQ-0009 | MUST | Synthesised `id` values MUST be valid slugs: lowercase, alphanumeric and hyphens only, not starting or ending with a hyphen. |
| CAT-REQ-0010 | MUST | If two artifacts would synthesise the same `id`, the second MUST have a numeric suffix appended (e.g., `python-2`). |
| CAT-REQ-0011 | MUST | If `filter.type` is set, `fetchCatalog()` MUST return only artifacts whose `type` matches. |
| CAT-REQ-0012 | MUST | If `filter.keyword` is set, `fetchCatalog()` MUST return only artifacts whose `name` contains the keyword (case-insensitive). |
| CAT-REQ-0013 | MUST NOT | The catalog module MUST NOT filter by `supports` — that is the Installer's responsibility (SPEC-0006). The full list is returned so the UI can show all available artifacts regardless of the user's selected target. |
| CAT-REQ-0014 | SHOULD | The heuristic scanner SHOULD read `SKILL.md` content only to extract the description; it SHOULD NOT fail if the file is unreadable — omit the description field instead. |

---

## Error Cases

| Condition | Error type | Behaviour |
|-----------|-----------|-----------|
| Network failure fetching catalog file | `NetworkError` (from SPEC-0003) | Propagated to caller |
| Heuristic scan finds no recognisable artifacts | — | Returns `{ source: 'heuristic', artifacts: [] }` — not an error |
| Catalog YAML is present but unparseable | — | Falls back to heuristic; logs parse error details at debug level |
| Catalog is valid YAML but fails schema validation | — | Falls back to heuristic; logs validation errors at debug level |

---

## Notes

- The heuristic scanner intentionally only scans one level deep within collection directories (e.g., `skills/`) to avoid excessive API calls. Individual skill subdirectories may contain nested files, but the scanner only needs to detect the presence of `SKILL.md` at the skill root.
- Future deep-search capability (searching file contents for keyword matches) is explicitly deferred. `filter.keyword` matches names only in this version.
- Catalog results should be stored in `session.catalogCache` by the caller (TUI/CLI/MCP) after a successful fetch, so navigating back to the same repo within a session does not repeat the API calls.
