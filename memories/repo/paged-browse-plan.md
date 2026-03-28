# Mission: Paginated Browse + Type Filter
_Saved: 2026-03-27 — feature/testing branch_

## Status
- [ ] GitHub issue posted (BLOCKED: unset $env:GITHUB_TOKEN = $null first, then retry)
- [ ] Phase 1+2: Type filter + paged browse (src/index.ts)
- [ ] Phase 3: Wizard type filter integration (src/ui/interactive.ts)
- [ ] Sentinel security review
- [ ] Ranger: full test suite

## GitHub Issue Unblock
The GITHUB_TOKEN env var overrides the keyring token (gho_****) which has correct repo scope.
Fix before creating issue:
  $env:GITHUB_TOKEN = $null
Then run:
  gh issue create --repo CowboyLogic/cerebro --title "feat: paginated browse with type filter menu and search"

## Phase 1 — Type Filter Menu (src/index.ts + src/ui/interactive.ts)
- When repo has >1 component type, show select menu before item list
- Choices: "All Types (N)" + one entry per type with emoji + count
- Single type present → skip menu entirely
- Shared buildTypeChoices() utility used by both browse command and interactive wizard
- browse --type <x> flag continues to work as direct bypass

## Phase 2 — Paged Browse Command (src/index.ts)
- Replace full-dump renderer with paginated display (50 items per page)
- SPACE → next page
- S → name-search filter, re-paginates filtered results
- Q / Ctrl+C → exit cleanly
- Uses stdin raw-mode keypress listener (same pattern as plainLineInput in wizard)
- Each page shows: type group headers with emoji, then per-item 3-line blocks (name / description / targets)
- Footer: "SPACE next page  /  S search  /  Q quit"

## Phase 3 — Wizard Type Filter Integration (src/ui/interactive.ts)
- Replace current "search to reduce to ≤50" pre-filter with two-step flow:
  - Step A (multiple types): type picker select → choose type or "All"
  - Step B (still >50 after type filter): text search prompt (same as today)
- Ctrl+C in type picker → BACK to repo step (consistent with state machine)
- RENDER_MAX = 50 constant stays in place

## Files to Modify
- src/index.ts — type filter menu + paginated renderer
- src/ui/interactive.ts — type-select step before search pre-filter
- tests/cli/browse-command.test.ts — pagination, type filter, search tests
- tests/unit/ui/interactive.test.ts — type-filter step, back-navigation tests

## Key Codebase Facts (from Scout recon)
- ComponentType values: 'skill' | 'agent' | 'prompt' | 'instruction' | 'snippet' | 'workflow' | 'unknown'
- Display order: agent → instruction → prompt → skill → snippet → workflow → unknown
- getTypeIcon() emoji map already exists in src/index.ts
- Interactive wizard uses @inquirer/prompts ^8.3.2
- RENDER_MAX = 50 constant already in src/ui/interactive.ts
- plainLineInput() in interactive.ts uses cooked-mode readline (must be preserved for Windows compat)
- withPromptLogging() wraps all @inquirer calls — new prompts must also be wrapped
- Current test count: 220 passing across 22 files

## Acceptance Criteria
- Type filter menu appears when >1 component type present
- Browse paginates at 50 items; SPACE advances pages
- S key opens search/filter from within paged browse
- Wizard shows type picker before search pre-filter
- All 220+ existing tests continue to pass
- New tests cover pagination, type filter, and search flows
