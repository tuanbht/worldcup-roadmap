# Requirement: Show each match's kickoff date + time (browser timezone) in circle (radial) mode

## Goal
In CIRCLE / radial mode, display the kickoff **date and time** for every match, rendered in the **viewer's
browser timezone**. Today the radial match dots show only a winner-flag roundel (+ an inline score on the outer
rings) and NO kickoff — so a user in circle mode can't see when each match is. The grid view already shows
"05 Jul, 04:00" per card; circle mode should surface the same, per match.

## Scope
Circle-mode nodes only:
- **Match dots** (`match-dot`, R32→SF — `src/components/nodes/MatchDotNode.tsx`) — the primary target.
- **Final center** (`final-center` — `src/components/nodes/FinalCenterNode.tsx`) — include the Final's kickoff too.
The grid view and its `MatchNode` already show kickoff — do NOT change them.

## Design decisions (baked in; implementer/designer own exact pixel placement, verified live)
- **Format + timezone:** reuse the existing single date façade `src/lib/datetime.ts` — `formatDateTime(kickoff)`
  → `"dd MMM, HH:mm"` (e.g. `"05 Jul, 04:00"`) in the viewer's LOCAL browser zone BY DEFAULT (its `localTimeZone()`).
  Do NOT hand-roll `Intl`/`new Date()` (library-first policy). Null/TBD kickoff → the util's `"Date TBD"` fallback.
- **Always-on, per match:** a compact caption is shown for EVERY match dot (and the Final center), not only on
  hover/focus. The radial geometry has room — R32 dots are ~250px of arc apart (r=640, 2π/16), R16 ~375px
  (r=480), QF/SF sparser — so a small label per dot fits without clutter.
- **Placement:** position the caption so it does NOT overlap the roundel, the inline score, the outer badge ring
  (r=720), or neighbouring dots' captions. A small caption anchored to the dot (e.g. just inside/under the
  roundel along the radius) styled via `src/styles/global.css` (a new `.radial-dot__when` class or similar),
  legible against the dark canvas ("highlight" = clearly readable; a subtle pill/background is fine). Keep it
  compositor-friendly and unobtrusive; it must not break the existing dot centering or the radial connectors
  (handles stay pinned to the dot center).
- **Semantics/a11y:** render the kickoff in a `<time dateTime={kickoff}>` element; include the date/time in the
  node's existing `aria-label` (e.g. append " — 05 Jul, 04:00") so screen-reader users get it too. Keep the
  existing matchup/score aria content.

## Data flow (thread kickoff into the radial node data)
- `src/features/roadmap/graph-model.ts`: add `kickoff: string | null` to `MatchDotNodeData` (line ~147) and to
  `FinalCenterNodeData` (line ~171) — mirroring `MatchNodeData.kickoff` (line ~46) which already exists.
- `src/features/roadmap/build-radial-graph.ts`: in `matchDotNode` (and `finalCenterNode`) set
  `kickoff: match?.kickoff ?? null` (the `match` object is already in scope). Stay pure/immutable.
- `MatchDotNode.tsx` / `FinalCenterNode.tsx`: read `kickoff` from data, format via `formatDateTime`, render the
  `<time>` caption, and fold the value into the aria-label.

## Acceptance criteria (testable)
- Every circle-mode match dot (and the Final center) renders its kickoff as `dd MMM, HH:mm` in the browser's
  local timezone; a null/empty kickoff renders the `"Date TBD"` fallback (no crash, no `Invalid Date`).
- `build-radial-graph` populates `kickoff` on every `match-dot` and the `final-center` from the source match
  (`match.kickoff`), null when the match/fixture is absent. Unit test asserts this.
- `MatchDotNode`/`FinalCenterNode` render the formatted date/time; component tests PIN an explicit `tz`
  (`formatDateTime(iso, tz)` supports it) for determinism — do NOT let the test depend on the CI machine's zone.
  Assert the caption text AND that it is inside a `<time dateTime>` element, AND that the aria-label includes it.
- The label does not overlap/clip against the roundel, score, badges, or neighbours (verified live); the dot
  stays centered and the radial connectors still attach at the dot center.
- No regression: grid-mode `MatchNode`, the layout math, and existing radial suites stay green.
- `npm run typecheck` + `npm test` + `npm run build` + `npm run format:check` green; existing visual snapshots
  updated intentionally if the radial dot markup changes (regen + eyeball, don't blindly accept).
- **Live-verify (circle mode):** switch to Circle layout; each match shows its date+time in the local zone; it is
  legible and uncluttered; a scheduled (future) match shows its date/time, a TBD one shows "Date TBD".

## Out of scope
- Grid view (already shows kickoff); any timezone PICKER/setting (this uses the browser's zone, per the existing
  policy); relative/"in 3 days" formatting; changing the radial LAYOUT geometry (only add a label to existing dots).

## Files (indicative)
- `src/features/roadmap/graph-model.ts` (+ `build-radial-graph.ts` + its test) — kickoff data → **wc-graph-engineer**
- `src/components/nodes/MatchDotNode.tsx` + `FinalCenterNode.tsx` (+ their tests), `src/styles/global.css`
  (caption style) → **wc-ui-engineer**
- reuse `src/lib/datetime.ts` (no change) — the browser-tz formatter

## Notes
Entirely within the radial/presentational view the build team has been developing (1104 → 1416 → ee3c16e). Runs
in an isolated worktree; since every file is in that shared area, keep the change tight and rebase cleanly if the
team claims concurrent work. Owner: **wc-ui-engineer** (the caption + styling) + **wc-graph-engineer** (threading
`kickoff` into the radial node data).
