# Requirement: Group view — date-rail alignment fix + standings table + team highlight

Three group-view items, independently implementable.

---

## 1. Bug: date-rail markers don't vertically align with their row's cards

**Symptom:** the left date labels (e.g. "13 JUN") sit higher than the match cards on the same day-row — they
don't line up with the card's vertical center.

**Cause:** in `build-graph.ts`, `dayMarkerNode` is placed at `y = HEADER_H + index * DAY_ROW_PITCH` (top-left),
the **same** top-left `y` as the match cards (`rowY` in `group-layout.ts`). But a match card is `NODE_H = 108`
tall and the date pill is ~28px. React Flow anchors by top-left, so the marker's center lands ~40px **above** the
card's center.

**Fix:** put each `day-marker` on the **card row's centerline** — e.g. add `(NODE_H − markerHeight)/2` to the
marker `y`, or render `DayMarkerNode` with a `translateY(-50%)` wrapper centered on `rowY + NODE_H/2`. Apply the
**same** centering to knockout-row markers. (Inferred from a screenshot — verify live and tune the exact offset.)

**Files:** `src/features/roadmap/build-graph.ts` (`dayMarkerNode`), `layout-constants.ts`, `DayMarkerNode.tsx`.

**Acceptance:** every `day-marker`'s vertical center matches the vertical center of the match cards on its
day-row (±a few px), for both group and knockout rows.

---

## 2. Standings table under each group header (Google-style)

**Want:** under each group name (top of each column), always show that group's standings table — like Google's
"Table" view: a row per team ordered by standing, columns **# · team(flag+name) · MP · W · D · L · GF · GA · GD ·
Pts** (emphasize **Pts**), optionally a Last-5 form chip. Today the table only appears in the on-demand
`StandingsOverlay`.

**Data already exists:** `Group.table: StandingRow[]` (`computeGroups`) has `position, team, played, won, draw,
lost, goalsFor, goalsAgainst, goalDifference, points, form, qualified`. `GroupTableNode` already renders a
standings table — **reuse it inline**, don't rebuild.

**Layout:** add a `group-standings` node per group anchored **directly under its `group-header`** in the top
band. Grow `HEADER_H` so `[header + table]` fit above day-row 0 (push all day-rows down by the table height) so
it never overlaps row 0. Keep the column width (`GROUP_COL_PITCH` already fits 2 cards). Keep the overlay as an
optional zoom/expand, or retire it in favor of the always-on table.

**Files:** `build-graph.ts` (emit `group-standings` nodes + bump `HEADER_H`/first-row offset), a
`GroupStandingsNode` wrapping/compacting `GroupTableNode`, `graph-model.ts` (new node type + data), `layout-constants.ts`.

**Acceptance:** under each A..L header a standings table shows every team's row with **Pts** (+ MP/W/D/L/GF/GA/GD),
ordered by `position`; it doesn't overlap the first day-row; it reflects live data; `qualified` rows are accented.

---

## 3. Click a team flag → highlight that team's matches + connecting lines

**Want:** clicking a team's **flag** (in a match card and/or the standings table) highlights the **dashed
connector lines** and **every match that team plays in**, dimming the rest.

**Behavior:**

- Set a **focused team** (by team id/code). Compute the set of:
  - **match nodes** the team participates in — group matches where it's home/away, plus knockout matches whose
    resolved `home`/`away` is that team;
  - **edges** on its path — feeder + advance edges touching those matches (the "dash-line").
- Highlighted nodes/edges stay bright; everything else **dims**. Re-click the same flag, click empty canvas, or
  press **Esc** clears it. Optionally persist as `?team=CODE`.
- Drive purely by **data-attribute / class toggles** (opacity / filter) — **no relayout** (React Flow positions
  must not change). Cap dim so non-text contrast stays ≥3:1. Keyboard-accessible (flags are focusable; Enter/Space
  toggles); announce "Showing matches for {team}" via `aria-live`. Reduced-motion: snap, no fade.

**Files:** a `useFocusedTeam` hook/state, `Flag`/`TeamRow`/`MatchNode` (flag → set focus + highlight class),
`GroupTableNode` rows (clickable flag), `AdvanceEdge` (highlight/dim class via the edge `data`/class channel), a
selector that maps a team → its match-node + edge id set, and the canvas wiring.

**Acceptance:** clicking a team flag highlights every match that team participates in (group + knockout) and the
dashed connector lines on its path, and dims the rest; re-click / empty-canvas / Esc clears it; no layout shift;
works by keyboard.

---

## Verification

`npm run test` (layout + build-graph + component tests) → run the app: date labels line up with their row's
cards; each group shows its points table under the header; clicking a flag lights that team's matches + lines and
dims the rest. Playwright: assert a `day-marker` and its row's card share a center line; a group-standings table
renders per group; clicking a flag adds the focus state to the expected nodes/edges.
