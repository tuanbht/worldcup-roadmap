# Requirement: "Go to current match" → bottom-right icon bubble on small screens

## Context

`FocusMatchButton` (`src/components/roadmap/FocusMatchButton.tsx`) is the "go to current/live match" control —
today a `<Panel position="top-center">` pill (LocateFixed icon + label, live pulse, `disabled` when
`targetMatchId === null`). The **`wc-ui-engineer` agent doc already describes a small-screen variant that does
NOT exist in the code** (no `max-md:` override anywhere). This requirement makes that real, and the agent-doc
description becomes accurate once implemented.

## Want (the spec the agent doc already states)

Below `md` (**< 768px**), the control floats to a **bottom-right ~48px circular icon bubble**:

- icon only — the **text label is hidden** (`sr-only`, kept for assistive tech);
- the **live pulse rides the icon's corner** (not an inline dot);
- still **disabled** when `targetMatchId === null`;
- anchored bottom-right with **safe-area inset** so it clears the home indicator and doesn't collide with the
  match-detail bottom sheet.

At **≥ md** keep the current **top-center pill** with its label — no desktop change.

## Decision

- In `FocusMatchButton.tsx`, add `max-md:` (or `md:`) responsive overrides: reposition the `<Panel>` /
  wrapper to bottom-right under 768px, make the button a ~48px (`h-12 w-12`) `rounded-full` icon button,
  `sr-only` the label below `md`, and place the live pulse at the icon corner. Keep one `<button>` with a
  stable `aria-label` across both layouts.
- Respect `prefers-reduced-motion` for the pulse; compositor-only.

## Acceptance criteria (testable)

- At **< 768px**: the control is a ~48px bottom-right circular icon bubble, **no visible text label**, live
  pulse on the icon corner, `disabled` when there's no target, clear of the safe-area + the detail sheet.
- At **≥ 768px**: unchanged top-center pill with label.
- The `aria-label` ("go to live/current match") is present in both layouts; keyboard-focusable; reduced-motion
  honored.
- `npm run typecheck` + `build` + tests green; mobile + desktop visual snapshots updated.

## Files

- `src/components/roadmap/FocusMatchButton.tsx` (responsive overrides), `src/styles/global.css` if needed →
  **wc-ui-engineer**; snapshots/e2e → **wc-test-engineer**.

> Note to the implementer: the `wc-ui-engineer` agent doc currently states this behavior as already-built — it
> is **not**. Implement it for real; the doc is accurate only after this lands.
