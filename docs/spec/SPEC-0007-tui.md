# SPEC-0007 â€” TUI Mode

**Product:** cerebro CLI<br />
**Status:** Draft<br />
**Date:** 2026-03-29<br />
**Area:** tui<br />
**Depends on:** [SPEC-0001](SPEC-0001-config.md) (Config), [SPEC-0002](SPEC-0002-manifest.md) (Manifest), [SPEC-0004](SPEC-0004-session.md) (Session), [SPEC-0005](SPEC-0005-catalog.md) (Catalog), [SPEC-0006](SPEC-0006-installer.md) (Installer)<br />
**Consumed by:** `src/index.ts` (entry point when no args are provided)<br />

---

## Overview

The TUI (Terminal User Interface) is the primary human-facing interface for Cerebro. It is activated when the CLI is launched with no arguments. Built with Ink (React for terminals), it presents a navigable screen stack â€” from source repo selection through artifact browsing to installation â€” driven entirely by keyboard input.

---

## Scope

**In scope:**<br />
- All interactive screens and their keyboard behaviour
- Navigation stack (screen transitions, Escape/back logic)
- Live filter input on the item list
- Status badge rendering (Installed / Conflict / Exists)
- Trust warning flow
- Target and scope selection (once per session)
- Add custom source flow
- Presenting install outcomes to the user

**Out of scope:**<br />
- Business logic (all operations delegate to core modules [SPEC-0001](SPEC-0001-config.md) through [SPEC-0006](SPEC-0006-installer.md))
- Persistence decisions (TUI calls core modules with appropriate `persist` flags)
- CLI argument parsing ([SPEC-0008](SPEC-0008-cli.md))
- MCP protocol ([SPEC-0009](SPEC-0009-mcp.md))

---

## Screen Stack & Navigation

```
[Banner + Repo List]         â† Escape = exit
      â†“ select repo
[Trust Warning]              â† Escape = back to Repo List
      â†“ acknowledged
[Target Select]              â† first repo in session only; Escape = back
      â†“
[Scope Select]               â† first repo in session only; Escape = back
      â†“  (subsequent repos skip Target/Scope â€” jump directly here â†“)
[Type Menu]                  â† skip if only one type exists; Escape = back to Repo List
      â†“ select type
[Item List + Filter]         â† Escape clears filter first, then back to Type Menu (or Repo List if skipped)
      â†“ Enter on item
[Install â†’ return to Item List; item updates status badge]
```

**Global key bindings (active on all screens):**<br />
| Key | Action |
|-----|--------|
| `Ctrl-C` | Exit immediately |
| `Escape` | Back one level (or exit from Repo List) |
| `â†‘` / `â†“` | Navigate list items |
| `Enter` | Select / confirm |

---

## Screens

### 1. Banner + Repo List

Displayed on launch. Shows the `<Banner>` component followed by the list of enabled sources and an "Add custom sourceâ€¦" option at the bottom.

```
  [C][E][R][E][B][R][O]  â”‚  Install AI skills & agents into your IDE
  [  glyph row 2       ]  â”‚
  [  glyph row 3       ]  â”‚  Version: 0.1.0
  [  glyph row 4       ]  â”‚  Auth:    GITHUB_TOKEN
  [  glyph row 5       ]  â”‚  Sources: 2 enabled
  [  glyph row 6       ]  â”‚  Default: claude-code Â· workspace
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• (violet border)

Select a source repository:

  â–¶  anthropics/skills
     github/awesome-copilot
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     + Add custom sourceâ€¦

  â†‘â†“ navigate Â· Enter select Â· Escape exit
```

#### Banner Component

The `<Banner>` React (Ink) component renders in a fixed two-pane layout. It replaces the former raw-ANSI `banner()` string function.

**Left pane (~65 columns):** Six rows of coloured ASCII art spelling CEREBRO. Each row is rendered as a `<Box flexDirection="row">` containing seven `<Text color={palette[i]} bold>` children â€” one per glyph column. The colour palette (`ART_COLORS`) progresses from deep violet (`#7C3AED`) at C to cyan at the final O. The `ART` glyph data is unchanged.<br />

**Right pane (remaining columns):** Six lines of contextual information, vertically aligned with the six art rows:<br />

| Row | Content |
|-----|---------|
| 1 | Tagline: `Install AI skills & agents into your IDE` |
| 2 | *(blank)* |
| 3 | `Version: {VERSION}` |
| 4 | `Auth:    {resolveGitHubTokenSource()}` |
| 5 | `Sources: {N} enabled` â€” count of enabled sources from the session |
| 6 | `Default: {target} Â· {scope}` or `Default: not set` |

Labels are left-padded so all values line up at the same column (tab-stop after `Sources: `, the longest label at 9 characters).

**Outer wrapper:** `<Box flexDirection="row" borderBottom borderBottomColor="#7C3AED">`. The bottom border uses deep violet (`#7C3AED`), matching the leftmost glyph colour. There are no blank padding rows above or below the art. Total component height: **six rows** (plus the border line).<br />

**Props:**<br />
```typescript
interface BannerProps {
  session: Session;                                       // for sources + defaults
  authSource: 'GITHUB_TOKEN' | 'GH_TOKEN' | 'gh CLI' | 'none';
}
```

**Behaviour:**<br />
- Only `enabled: true` sources are shown.
- Selecting a source proceeds to the Trust Warning screen.
- Selecting "Add custom sourceâ€¦" proceeds to the Add Source flow.

---

### 2. Trust Warning

Shown when the user selects a repo that is not yet trusted (`trusted: false` in config). Skipped if `trusted: true`.

```
  âš   Trust Warning

  You are about to browse artifacts from:
  https://github.com/anthropics/skills

  Only install artifacts from sources you trust.
  Malicious artifacts could modify your AI tool
  configuration in harmful ways.

  [ Trust this source and continue ]   [ Cancel ]
```

**Behaviour:**<br />
- "Trust this source and continue": sets `trusted: true` via `trustSource()`, saves config, proceeds.
- "Cancel" / Escape: returns to Repo List.
- A repo trusted in this session is not re-prompted within the same session.

---

### 3. Target Select

Shown once per session, after the first trust acknowledgement. Pre-selects the value from `config.defaults.target` if set.

```
  Install artifacts for:

  â–¶  agents          (.agents standard)
     claude-code     (Claude Code CLI)
     copilot         (GitHub Copilot)

  â†‘â†“ navigate Â· Enter select Â· Escape back
```

**Behaviour:**<br />
- Shows only MVP-supported targets: `agents`, `claude-code`, `copilot`.
- Pre-selection (cursor positioned) on `config.defaults.target` if set.
- On select: prompts Scope Select screen.
- Escape: back to Trust Warning (or Repo List if trust was already set).

---

### 4. Scope Select

Shown immediately after Target Select, same session-once behaviour. Pre-selects `config.defaults.scope`; defaults to `workspace` if not set.

```
  Install scope:

  â–¶  workspace    (current project only)
     user         (all projects, your home directory)

  â†‘â†“ navigate Â· Enter select Â· Escape back
```

**Behaviour:**<br />
- On select: if the `--persist` equivalent is desired, the user is asked "Save as default? [y/N]". If yes, `setTarget(persist: true)` and `setScope(persist: true)` are called.
- Proceeds to Type Menu.

---

### 5. Type Menu

Lists artifact types available in the selected repo. Skipped automatically if only one type is present (proceeds directly to Item List for that type).

```
  anthropics/skills  Â·  claude-code  Â·  workspace

  Browse by type:

  â–¶  skill           (24 available)
     instruction     (3 available)

  â†‘â†“ navigate Â· Enter select Â· Escape back
```

**Behaviour:**<br />
- Type counts are derived from the `CatalogResult` artifacts array.
- Escape: back to Repo List.

---

### 6. Item List + Filter

The main browsing screen. Shows artifacts of the selected type, 50 per page.

```
  anthropics/skills  Â·  skill  Â·  claude-code  Â·  workspace

  Filter: [git________________]

  â–¶  git-commit-assistant          (Installed) âœ“
     git-branch-manager
     git-rebase-helper             (Exists) âš 

  Page 1 of 1  Â·  3 of 24 items  Â·  Space: next page  Â·  Enter: install  Â·  Escape: back
```

**Status badges:**<br />
| Badge | Colour | Meaning |
|-------|--------|---------|
| `(Installed) âœ“` | Green | Cerebro installed this, from this repo, path verified |
| `(Conflict) âœ—` | Red | Cerebro installed this from a different repo |
| `(Exists) âš ` | Yellow | Something is at the install path; Cerebro did not install it |
| *(none)* | â€” | Available to install |

**Behaviour:**<br />
- Filter input is always visible. Typing updates the list in real time (case-insensitive name match).
- Escape with active filter: clears filter, restores full list. Escape with empty filter: back to Type Menu (or Repo List if Type Menu was skipped).
- Spacebar: advance to next page (wraps to page 1 after last page).
- Filter resets to empty when paginating.
- Status is computed via `getArtifactStatus()` ([SPEC-0002](SPEC-0002-manifest.md)) for each visible item on render.
- Selecting an item with status `Installed`, `Conflict`, or `Exists` proceeds to the Overwrite Confirmation screen before installing.
- Selecting an available item installs immediately (no confirmation).

---

### 7. Overwrite Confirmation

Shown when the user selects an item that already has a non-available status.

```
  âš   Already exists

  git-commit-assistant is already present at:
  .claude/commands/git-commit-assistant/

  Status: (Exists) â€” not installed by Cerebro

  Overwrite?  [ Yes ]   [ No ]
```

**Behaviour:**<br />
- "Yes": calls `installArtifact()` with `overwrite: true`. Returns to Item List; badge updates.
- "No" / Escape: returns to Item List without installing.

---

### 8. Add Source Flow

Activated from "Add custom sourceâ€¦" in the Repo List.

```
  Add custom source

  Enter a GitHub repository URL:
  > https://github.com/________________________

  Enter to validate Â· Escape to cancel
```

**Behaviour:**<br />
- On Enter: validates that the URL is a well-formed GitHub repo URL. Makes a lightweight API call (`listDirectory` on root) to confirm the repo exists and is accessible.
- If valid: prompts "Save this source for future sessions? [Y/n]". If yes, calls `addSource()` and `saveConfig()`. Then proceeds directly to Trust Warning for the new repo.
- If invalid or repo not found: shows inline error and re-prompts.
- Escape at any point: back to Repo List.

---

## Requirements

| ID | Keyword | Requirement |
|----|---------|-------------|
| TUI-REQ-0001 | MUST | The TUI MUST render the `<Banner>` component on launch before any list content. The banner MUST NOT be implemented as a raw-ANSI string; it MUST be a React (Ink) component. |
| TUI-REQ-0002 | MUST | `Ctrl-C` MUST exit the process immediately from any screen. |
| TUI-REQ-0003 | MUST | `Escape` MUST navigate back one level from any screen. At the Repo List screen, Escape MUST exit. |
| TUI-REQ-0004 | MUST | The Trust Warning MUST be shown the first time a repo is selected in a session if `trusted: false`. It MUST NOT be shown again for the same repo in the same session. |
| TUI-REQ-0005 | MUST | Target and Scope selection MUST be shown exactly once per session, after the first trust acknowledgement, and MUST NOT be repeated for subsequent repos in the same session. |
| TUI-REQ-0006 | MUST | The Type Menu MUST be skipped automatically when the selected repo contains only one artifact type, proceeding directly to the Item List for that type. |
| TUI-REQ-0007 | MUST | The Item List MUST display a maximum of `pageSize` items per page. `pageSize` MUST default to `10` and MUST be configurable via `config.defaults.ui.pageSize`. |
| TUI-REQ-0008 | MUST | `Spacebar` on the Item List MUST advance to the next page. On the last page, it MUST wrap to page 1. |
| TUI-REQ-0009 | MUST | The filter input MUST update the visible item list in real time as the user types. |
| TUI-REQ-0010 | MUST | Filter matching MUST be case-insensitive and MUST match against the artifact `name` field only. |
| TUI-REQ-0011 | MUST | `Escape` with an active filter MUST clear the filter and restore the full list. A second `Escape` with an empty filter MUST navigate back. |
| TUI-REQ-0012 | MUST | Status badges MUST be computed via `getArtifactStatus()` ([SPEC-0002](SPEC-0002-manifest.md)) at render time. |
| TUI-REQ-0013 | MUST | `(Installed)` MUST render in green, `(Conflict)` in red, `(Exists)` in yellow. |
| TUI-REQ-0014 | MUST | After a successful install, the item's status badge in the Item List MUST update to `(Installed)` without navigating away. |
| TUI-REQ-0015 | MUST | Selecting an item with a non-available status MUST show the Overwrite Confirmation screen before calling `installArtifact()`. |
| TUI-REQ-0016 | MUST | The Add Source flow MUST validate the URL format before making any network call. |
| TUI-REQ-0017 | MUST | The Add Source flow MUST verify repo accessibility via a lightweight API call before accepting the URL. |
| TUI-REQ-0018 | MUST | `createSession()` errors (`ConfigParseError`, `ManifestParseError`) MUST be caught at TUI startup, displayed as a plain-text error message, and exit with code 1. |
| TUI-REQ-0019 | SHOULD | Navigation breadcrumbs (repo Â· type Â· target Â· scope) SHOULD be displayed on the Type Menu and Item List screens for orientation. |
| TUI-REQ-0020 | MUST | The `<Banner>` component MUST render in a two-pane `<Box flexDirection="row">` layout: ASCII art on the left, info panel on the right. |
| TUI-REQ-0021 | MUST | The left pane MUST render exactly six rows of coloured ASCII art. Each row MUST be a `<Box flexDirection="row">` containing seven `<Text bold>` children with colours from `ART_COLORS`. |
| TUI-REQ-0022 | MUST | The right pane MUST display, in order: tagline, blank line, version, auth source, enabled-source count, and default targetÂ·scope (or "not set"). |
| TUI-REQ-0023 | MUST | The auth label in the right pane MUST be obtained from `resolveGitHubTokenSource()` ([SPEC-0003](SPEC-0003-provider.md) PRV-REQ-0018). It MUST display the source name only â€” never the token value. |
| TUI-REQ-0024 | MUST | The outer `<Banner>` wrapper MUST apply a single-line border on all four sides in colour `#7C3AED` (`borderStyle="single" borderColor="#7C3AED"`). No blank padding rows above or below the art are permitted; total height MUST be six rows. |
| TUI-REQ-0025 | MUST | `runTui()` MUST call `resolveGitHubTokenSource()` once at startup and pass the result to `<Banner>` as `authSource`. |

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
