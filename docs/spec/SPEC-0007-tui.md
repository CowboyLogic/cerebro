# SPEC-0007 — TUI Mode

**Product:** cerebro CLI
**Status:** Draft
**Date:** 2026-03-29
**Area:** tui
**Depends on:** SPEC-0001 (Config), SPEC-0002 (Manifest), SPEC-0004 (Session), SPEC-0005 (Catalog), SPEC-0006 (Installer)
**Consumed by:** `src/index.ts` (entry point when no args are provided)

---

## Overview

The TUI (Terminal User Interface) is the primary human-facing interface for Cerebro. It is activated when the CLI is launched with no arguments. Built with Ink (React for terminals), it presents a navigable screen stack — from source repo selection through artifact browsing to installation — driven entirely by keyboard input.

---

## Scope

**In scope:**
- All interactive screens and their keyboard behaviour
- Navigation stack (screen transitions, Escape/back logic)
- Live filter input on the item list
- Status badge rendering (Installed / Conflict / Exists)
- Trust warning flow
- Target and scope selection (once per session)
- Add custom source flow
- Presenting install outcomes to the user

**Out of scope:**
- Business logic (all operations delegate to core modules SPEC-0001 through SPEC-0006)
- Persistence decisions (TUI calls core modules with appropriate `persist` flags)
- CLI argument parsing (SPEC-0008)
- MCP protocol (SPEC-0009)

---

## Screen Stack & Navigation

```
[Banner + Repo List]         ← Escape = exit
      ↓ select repo
[Trust Warning]              ← Escape = back to Repo List
      ↓ acknowledged
[Target Select]              ← first repo in session only; Escape = back
      ↓
[Scope Select]               ← first repo in session only; Escape = back
      ↓  (subsequent repos skip Target/Scope — jump directly here ↓)
[Type Menu]                  ← skip if only one type exists; Escape = back to Repo List
      ↓ select type
[Item List + Filter]         ← Escape clears filter first, then back to Type Menu (or Repo List if skipped)
      ↓ Enter on item
[Install → return to Item List; item updates status badge]
```

**Global key bindings (active on all screens):**
| Key | Action |
|-----|--------|
| `Ctrl-C` | Exit immediately |
| `Escape` | Back one level (or exit from Repo List) |
| `↑` / `↓` | Navigate list items |
| `Enter` | Select / confirm |

---

## Screens

### 1. Banner + Repo List

Displayed on launch. Shows the Cerebro ASCII banner followed by the list of enabled sources and an "Add custom source…" option at the bottom.

```
[ASCII BANNER]

Select a source repository:

  ▶  anthropics/skills
     github/awesome-copilot
     ──────────────────────
     + Add custom source…

  ↑↓ navigate · Enter select · Escape exit
```

**Behaviour:**
- Only `enabled: true` sources are shown.
- Selecting a source proceeds to the Trust Warning screen.
- Selecting "Add custom source…" proceeds to the Add Source flow.

---

### 2. Trust Warning

Shown when the user selects a repo that is not yet trusted (`trusted: false` in config). Skipped if `trusted: true`.

```
  ⚠  Trust Warning

  You are about to browse artifacts from:
  https://github.com/anthropics/skills

  Only install artifacts from sources you trust.
  Malicious artifacts could modify your AI tool
  configuration in harmful ways.

  [ Trust this source and continue ]   [ Cancel ]
```

**Behaviour:**
- "Trust this source and continue": sets `trusted: true` via `trustSource()`, saves config, proceeds.
- "Cancel" / Escape: returns to Repo List.
- A repo trusted in this session is not re-prompted within the same session.

---

### 3. Target Select

Shown once per session, after the first trust acknowledgement. Pre-selects the value from `config.defaults.target` if set.

```
  Install artifacts for:

  ▶  agents          (.agents standard)
     claude-code     (Claude Code CLI)
     copilot         (GitHub Copilot)

  ↑↓ navigate · Enter select · Escape back
```

**Behaviour:**
- Shows only MVP-supported targets: `agents`, `claude-code`, `copilot`.
- Pre-selection (cursor positioned) on `config.defaults.target` if set.
- On select: prompts Scope Select screen.
- Escape: back to Trust Warning (or Repo List if trust was already set).

---

### 4. Scope Select

Shown immediately after Target Select, same session-once behaviour. Pre-selects `config.defaults.scope`; defaults to `workspace` if not set.

```
  Install scope:

  ▶  workspace    (current project only)
     user         (all projects, your home directory)

  ↑↓ navigate · Enter select · Escape back
```

**Behaviour:**
- On select: if the `--persist` equivalent is desired, the user is asked "Save as default? [y/N]". If yes, `setTarget(persist: true)` and `setScope(persist: true)` are called.
- Proceeds to Type Menu.

---

### 5. Type Menu

Lists artifact types available in the selected repo. Skipped automatically if only one type is present (proceeds directly to Item List for that type).

```
  anthropics/skills  ·  claude-code  ·  workspace

  Browse by type:

  ▶  skill           (24 available)
     instruction     (3 available)

  ↑↓ navigate · Enter select · Escape back
```

**Behaviour:**
- Type counts are derived from the `CatalogResult` artifacts array.
- Escape: back to Repo List.

---

### 6. Item List + Filter

The main browsing screen. Shows artifacts of the selected type, 50 per page.

```
  anthropics/skills  ·  skill  ·  claude-code  ·  workspace

  Filter: [git________________]

  ▶  git-commit-assistant          (Installed) ✓
     git-branch-manager
     git-rebase-helper             (Exists) ⚠

  Page 1 of 1  ·  3 of 24 items  ·  Space: next page  ·  Enter: install  ·  Escape: back
```

**Status badges:**
| Badge | Colour | Meaning |
|-------|--------|---------|
| `(Installed) ✓` | Green | Cerebro installed this, from this repo, path verified |
| `(Conflict) ✗` | Red | Cerebro installed this from a different repo |
| `(Exists) ⚠` | Yellow | Something is at the install path; Cerebro did not install it |
| *(none)* | — | Available to install |

**Behaviour:**
- Filter input is always visible. Typing updates the list in real time (case-insensitive name match).
- Escape with active filter: clears filter, restores full list. Escape with empty filter: back to Type Menu (or Repo List if Type Menu was skipped).
- Spacebar: advance to next page (wraps to page 1 after last page).
- Filter resets to empty when paginating.
- Status is computed via `getArtifactStatus()` (SPEC-0002) for each visible item on render.
- Selecting an item with status `Installed`, `Conflict`, or `Exists` proceeds to the Overwrite Confirmation screen before installing.
- Selecting an available item installs immediately (no confirmation).

---

### 7. Overwrite Confirmation

Shown when the user selects an item that already has a non-available status.

```
  ⚠  Already exists

  git-commit-assistant is already present at:
  .claude/commands/git-commit-assistant/

  Status: (Exists) — not installed by Cerebro

  Overwrite?  [ Yes ]   [ No ]
```

**Behaviour:**
- "Yes": calls `installArtifact()` with `overwrite: true`. Returns to Item List; badge updates.
- "No" / Escape: returns to Item List without installing.

---

### 8. Add Source Flow

Activated from "Add custom source…" in the Repo List.

```
  Add custom source

  Enter a public GitHub repository URL:
  > https://github.com/________________________

  Enter to validate · Escape to cancel
```

**Behaviour:**
- On Enter: validates that the URL is a well-formed public GitHub repo URL. Makes a lightweight API call (`listDirectory` on root) to confirm the repo exists and is accessible.
- If valid: prompts "Save this source for future sessions? [Y/n]". If yes, calls `addSource()` and `saveConfig()`. Then proceeds directly to Trust Warning for the new repo.
- If invalid or repo not found: shows inline error and re-prompts.
- Escape at any point: back to Repo List.

---

## Requirements

| ID | Keyword | Requirement |
|----|---------|-------------|
| TUI-REQ-0001 | MUST | The TUI MUST display the ASCII banner on launch before any other content. |
| TUI-REQ-0002 | MUST | `Ctrl-C` MUST exit the process immediately from any screen. |
| TUI-REQ-0003 | MUST | `Escape` MUST navigate back one level from any screen. At the Repo List screen, Escape MUST exit. |
| TUI-REQ-0004 | MUST | The Trust Warning MUST be shown the first time a repo is selected in a session if `trusted: false`. It MUST NOT be shown again for the same repo in the same session. |
| TUI-REQ-0005 | MUST | Target and Scope selection MUST be shown exactly once per session, after the first trust acknowledgement, and MUST NOT be repeated for subsequent repos in the same session. |
| TUI-REQ-0006 | MUST | The Type Menu MUST be skipped automatically when the selected repo contains only one artifact type, proceeding directly to the Item List for that type. |
| TUI-REQ-0007 | MUST | The Item List MUST display a maximum of 50 items per page. |
| TUI-REQ-0008 | MUST | `Spacebar` on the Item List MUST advance to the next page. On the last page, it MUST wrap to page 1. |
| TUI-REQ-0009 | MUST | The filter input MUST update the visible item list in real time as the user types. |
| TUI-REQ-0010 | MUST | Filter matching MUST be case-insensitive and MUST match against the artifact `name` field only. |
| TUI-REQ-0011 | MUST | `Escape` with an active filter MUST clear the filter and restore the full list. A second `Escape` with an empty filter MUST navigate back. |
| TUI-REQ-0012 | MUST | Status badges MUST be computed via `getArtifactStatus()` (SPEC-0002) at render time. |
| TUI-REQ-0013 | MUST | `(Installed)` MUST render in green, `(Conflict)` in red, `(Exists)` in yellow. |
| TUI-REQ-0014 | MUST | After a successful install, the item's status badge in the Item List MUST update to `(Installed)` without navigating away. |
| TUI-REQ-0015 | MUST | Selecting an item with a non-available status MUST show the Overwrite Confirmation screen before calling `installArtifact()`. |
| TUI-REQ-0016 | MUST | The Add Source flow MUST validate the URL format before making any network call. |
| TUI-REQ-0017 | MUST | The Add Source flow MUST verify repo accessibility via a lightweight API call before accepting the URL. |
| TUI-REQ-0018 | MUST | `createSession()` errors (`ConfigParseError`, `ManifestParseError`) MUST be caught at TUI startup, displayed as a plain-text error message, and exit with code 1. |
| TUI-REQ-0019 | SHOULD | Navigation breadcrumbs (repo · type · target · scope) SHOULD be displayed on the Type Menu and Item List screens for orientation. |

---

## Error Cases

| Condition | Behaviour |
|-----------|-----------|
| `ConfigParseError` on startup | Display actionable message (fix or delete file), exit code 1 |
| `ManifestParseError` on startup | Display actionable message (fix or delete file), exit code 1 |
| Network error fetching catalog | Show inline error on Type Menu screen; offer retry or back |
| Install fails (`status: 'error'`) | Show inline error on Item List; item does not update badge; user can retry |
| Add source: repo not found / private | Show inline error in Add Source flow; re-prompt URL |
| Rate limit hit | Show `RateLimitError` message inline; suggest waiting and retrying |
