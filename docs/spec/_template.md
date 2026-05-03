# [Component / Feature] Specification

**Product:** cerebro CLI | cerebro-vscode-ext | cerebro-schema | Suite<br />
**Status:** Draft | Accepted | Superseded by [link]<br />
**Date:** YYYY-MM-DD<br />
**Related ADRs:** [S-XXXX](../adr/S-XXXX.md), [CLI-XXXX](../adr/CLI-XXXX.md)<br />

---

## Overview

What does this component or feature do, and why does it exist? One short paragraph.
Reference the suite design brief or relevant ADR if this is a direct implementation of a design decision.

## Scope

**In scope:** What this spec covers. Be explicit.<br />

**Out of scope:** What this spec deliberately does not address. This prevents scope creep<br />
and documents intentional gaps.

---

## Interface / Contract

The public surface that callers and consumers depend on. This section is the binding contract —
implementation details below this layer are free to change; this section is not.

Include TypeScript interfaces, function signatures, command signatures, event shapes, error types,
and any data structures that cross a module or product boundary.

```typescript
// Example: function signature
export function exampleFunction(input: InputType): Promise<OutputType>;

// Example: data contract
export interface OutputType {
  success: boolean;
  // ...
}
```

---

## Requirements

Requirements use RFC 2119 language:
- **MUST** / **MUST NOT** — absolute requirement; a test must verify it
- **SHOULD** / **SHOULD NOT** — strong preference; deviation requires justification
- **MAY** — optional capability

Requirement IDs take the form `[AREA]-REQ-XXXX` where AREA is a short uppercase code for this
spec's subject (e.g., `DISC` for discovery, `INST` for install, `VAL` for validation).

| ID | Requirement | Priority |
|----|-------------|----------|
| AREA-REQ-0001 | The system MUST ... | Critical |
| AREA-REQ-0002 | The system MUST NOT ... | Critical |
| AREA-REQ-0003 | The system SHOULD ... | High |
| AREA-REQ-0004 | The system MAY ... | Low |

---

## Error Cases

Define how failures are represented and surfaced. For each failure mode:
- What condition triggers it
- What error type / message is produced
- What the caller / user should expect

| Condition | Error | User-visible message |
|-----------|-------|----------------------|
| ... | ... | ... |

---

## Open Questions

Record unresolved questions that must be answered before this spec can be accepted.
Move items here as they arise during review; remove them (with a note) as they are resolved.

- [ ] **Q1:** ...
