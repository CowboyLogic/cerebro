# CLI-0002: TUI Centralized State Machine

**Level:** CLI
**Status:** Accepted
**Date:** 2026-04-05

## Context

The TUI (SPEC-0007) was initially implemented with each screen component owning its own
cursor state (`useState`) and keyboard handling (`useInput`). This produced working code
that ran correctly in the terminal but was nearly impossible to test meaningfully.

The specific problems that emerged:

1. **Distributed `useInput` calls.** Eight screen components each registered their own
   `useInput` handler. Ink dispatches key events asynchronously via `setImmediate` for
   some keys (notably Escape) and requires React re-render cycles for state to be
   observable after arrow key presses. Neither works synchronously in tests.

2. **Local cursor state lost on navigation.** Each component held `const [cursor, setCursor] = useState(0)`.
   Cursor position was reset every time the user navigated away and back. This also made
   it impossible to assert cursor state in tests without going through the Ink event
   system.

3. **Sub-states inside screen components.** `ScopeSelect` held a `pickedScope` local
   state to manage an internal two-stage flow (scope picker → persist prompt). `AddSource`
   held both `url` state and a `urlRef` workaround to compensate for stale closure
   captures caused by `useInput` closing over rendered state. Both patterns hide
   application logic inside components where it cannot be tested independently.

4. **Tests written to match the constraint, not verify behavior.** When navigation
   behavior could not be tested through the framework, agents wrote passing tests that
   verified only that callback props were functions (`expect(typeof onExit).toBe('function')`).
   Approximately 40% of TUI tests were of this form — they confirmed the code compiled
   but proved nothing about correctness. This is the failure mode AD-8 is designed to
   prevent: tests that pass without requiring the code to be correct.

The root cause is that mixing state ownership, keyboard dispatch, and rendering inside
the same component makes each concern untestable in isolation.

## Decision

All TUI keyboard handling and navigation state is managed in a single centralized state
machine. Screen components are pure render functions — they receive state as props and
emit callbacks; they own no state and register no `useInput` handlers.

**Structure:**

```
src/tui/
├── types.ts         — TuiState type; all navigation and cursor state lives here
├── transitions.ts   — handleKey(state, key): TuiState — pure function, no Ink dependency
├── screens.tsx      — pure render components; useState/useInput are banned
└── app.tsx          — single useInput; calls handleKey; passes state down to screens
```

**`TuiState`** holds all cursor positions, sub-screen stages, filter text, and active
screen identifier — everything that was previously distributed across component-local
`useState` calls.

**`transitions.ts`** exports a single `handleKey(state: TuiState, key: KeyEvent): TuiState`
pure function. It contains all navigation logic derived from SPEC-0007 requirements.
It has no Ink dependency and no side effects. All sub-screen stages (e.g. ScopeSelect
persist prompt, AddSource save prompt) are explicit states in `TuiState`, not local
component state.

**`screens.tsx`** components accept `TuiState` fields as props and return JSX. They must
not call `useState` for navigation or cursor purposes, and must not call `useInput`.

**`app.tsx`** registers exactly one `useInput` handler, calls `handleKey`, and updates
state via `setState`. Async effects (catalog fetch, install) dispatch back into state
via `setState` with event-shaped objects, the same pattern used by `handleKey`.

## Rationale

**Why a pure transition function rather than a reducer or state machine library?**

A plain pure function is the simplest form that satisfies the requirement. It needs no
library, no schema, and no new concepts — it is a function that takes state and an event
and returns new state. XState and similar libraries add expressive power for complex
hierarchical machines but introduce learning curve and configuration overhead that is not
justified by the complexity of this TUI.

**Why centralize state rather than lift it component by component?**

Lifting state partially would still leave navigation behavior distributed across
`app.tsx` handler functions and component callback props. The dispatch + transition
model puts all navigation logic in one auditable location (`transitions.ts`) that maps
directly to SPEC-0007 requirements — each `if` branch in `handleKey` corresponds to a
numbered requirement. Partial lifting would not achieve this traceability.

**Why not use `useReducer` instead of `useState + handleKey`?**

`useReducer` would work equally well. The `handleKey` function is structurally a reducer.
The distinction is cosmetic: `useReducer(handleKey, initialState)` vs
`setState(s => handleKey(s, event))`. Either is compliant with this decision. The
function signature `handleKey(state, key)` is used in the spec because it matches how
tests call it — tests do not need to know whether the app uses `useState` or `useReducer`
internally.

**Alternatives rejected:**

- *Keep distributed `useInput` with better test utilities* — Ink's testing library is
  thin and the async timing issues are fundamental to how Ink dispatches input, not gaps
  in the library. Better tooling would not eliminate the `setImmediate` constraint.
- *Replace Ink with a different TUI framework* — The rendering output is correct and
  visually complete. The problem is testability of logic, not rendering capability.
  Replacing the framework would not change the architectural problem.

## Consequences

**Better:**
- Navigation logic is unit-testable as plain TypeScript functions — no Ink, no React,
  no async, no `act()`. A test for "Escape clears filter then navigates back" is two
  synchronous calls to `handleKey` with state assertions.
- All SPEC-0007 requirements have a traceable, testable implementation path.
- Cursor state is centralized and explicit — navigation history can be preserved or
  reset intentionally, not accidentally via component unmount.
- The `urlRef` stale-closure workaround in `AddSource` is eliminated.
- Sub-screen stages (`ScopeSelect` persist prompt, `AddSource` save prompt) become
  explicit named states, not hidden local flags.

**Harder / constrained:**
- Screen components must not call `useInput` or `useState` for navigation state. This
  is an enforced constraint, not a suggestion. See Compliance below.
- Async effects (catalog fetch, install) must feed results back through `setState` rather
  than updating local async state. This is already the pattern in `app.tsx` and does
  not require new infrastructure.

**Follow-on work triggered:**
- `TuiState` in `types.ts` must be extended with cursor fields and explicit sub-screen
  stage identifiers before implementation begins.
- All `useInput` calls in `screens.tsx` must be removed.
- All `useState` calls used for cursor or stage tracking must be removed from `screens.tsx`.
- Tests in `tests/unit/tui/screens.test.tsx` that are currently prop-wiring no-ops must
  be replaced with meaningful assertions against `handleKey` in a new
  `tests/unit/tui/transitions.test.ts`.

## Compliance

**Compliant:** `screens.tsx` components have no `useInput` calls and no `useState` calls
for cursor or navigation state. `transitions.ts` has no Ink import. `app.tsx` has exactly
one `useInput` call.

**Non-compliant:** Any `useInput` appearing in a screen component. Any `useState(0)` for
a cursor index in a screen component. Any navigation logic (screen transitions, cursor
movement, filter clearing) appearing inside a component rather than in `transitions.ts`.

Violations are detectable by grep:
```bash
# Should return only one result (app.tsx)
grep -r "useInput" src/tui/

# Should return zero results in screens.tsx
grep "useState" src/tui/screens.tsx
```

---

## Amendment: Alternate screen buffer (2026-04-05)

**Ink v6 removed the `altScreen` render option.** It was present in Ink v3–v4 as
`render(<App />, { altScreen: true })` and switched the terminal to the alternate screen
buffer automatically. In Ink v6 (installed: 6.8.0) `RenderOptions` no longer includes
this property; passing it produces a TypeScript compile error (`TS2353`).

**Decision:** Write the ANSI escape sequences directly to `process.stdout` in `runTui()`:

```typescript
const ENTER_ALT = '\x1b[?1049h';
const EXIT_ALT  = '\x1b[?1049l';
process.stdout.write(ENTER_ALT);
try {
  const { waitUntilExit } = render(<App ... />);
  await waitUntilExit();
} finally {
  process.stdout.write(EXIT_ALT);
}
```

This achieves identical behaviour — the TUI occupies the alternate screen buffer and the
terminal is fully restored on exit (including on unhandled exceptions via `finally`).
The sequences are part of the ANSI/xterm standard and are supported by all terminals
that support Ink itself. Do not attempt to restore the `altScreen` option when upgrading
Ink; use this pattern instead.

---

*Supersedes: (none)*
*Related: S-0006 (Design-first development process), SPEC-0007 (TUI Mode)*
