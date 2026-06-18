# Plan: Timeline-grid layout (shared day rail + group columns + center-converging knockout funnel)

> Revision #2 — addresses every item in `plan-review.md` (H1–H3, M1–M4, L1–L3). Change markers
> `[Rev2:Hn/Mn/Ln]` flag where each finding is resolved.

## Scope

### In scope
- Re-layout the existing continuous canvas onto **one shared vertical day axis** for the whole tournament (group + knockout), chronological top→bottom. `y = HEADER_H + dayIndex(day) * DAY_ROW_PITCH` for **every** node.
- **Group zone:** groups A..L become fixed columns across the top; each group match sits at `(group column × its kickoff-day row)`. **Any `(group, day)` cell holding 2 matches** renders them side-by-side at `x ± SLOT/2`, ordered by `kickoff` then `matchId`. In the mock this is **every** matchday (MD1=Jun11, MD2=Jun15, MD3=Jun19 each pair both matches on one day), not just MD3. `[Rev2:H1]`
- **Knockout zone:** center-converging funnel on the same day rail; parent `x` = midpoint of its two winner-children's `x`; `y` = the match's real day-row; Final at center-bottom (`x ≈ CX`, max y); THIRD_PLACE x-adjacent to the Final at its own real day-row.
- New guide nodes: one `day-marker` per distinct match-day (left rail) and one `group-header` per group A..L (top headers).
- Edges: feeder (group-header → seeded R32) + downward advance edges, all via `b`→`t` handles.
- Rewrite the three Phase-3 layout/build-graph specs (`group-layout.test.ts`, `bracket-layout.test.ts`, `build-graph.test.ts`) to the timeline-grid spec; add `day-axis.test.ts`; add jsdom specs for the two new node components; add a Playwright smoke `e2e/timeline-grid.spec.ts`.
- Move standings tables OUT of the positioned grid: `GroupTableNode` is no longer a graph node; standings become an on-demand `StandingsOverlay` opened from a `group-header`.
- Canvas wiring: keep this composite as the default; rewrite `useFocusCamera` so the "Groups"/"Knockout" tabs still frame a non-empty subset; `fitView` / keyboard / minimap span the taller canvas.

### Out of scope
- `MatchNode.tsx` markup/handles — verified it **already** renders top (`t`, target) + bottom (`b`, source) handles and `data-final`/"Group A · MD1" label (`MatchNode.tsx:67,103,27-31`); reused unchanged. `MatchNode.test.tsx` stays green.
- The future `fifa-regulation-accurate-bracket` feeder map — not a file; the existing `buildBracket` winner-tree (`winnerOf` `[home, away]` slot order, `build-bracket.ts:91-92`) remains the source of parent→child `x` midpoints.
- Domain layer (`build-bracket`, `derive-matchdays`, `standings`, schema, **`lib/datetime.ts`** `[Rev2:H3]`, providers), `MatchDetailPanel`, query/LOD/server logic — untouched; their tests stay green.
- New live-data fetching, scoring, or score visualization changes.

## Approach

Compute a shared **day index** (`computeDayIndex`) from the calendar day of every match's kickoff (`dayKey(iso) → 'yyyy-MM-dd'`, lexically sortable → ascending row index), mapped to `y = HEADER_H + dayIndex * DAY_ROW_PITCH`. Group X is a fixed column (`x = RAIL_W + colIndex * GROUP_COL_PITCH`); knockout X is a centered fan-in around the single exported `CX = RAIL_W + 6 * GROUP_COL_PITCH` where each parent's x is the midpoint of its two `winnerOf` children (reuse `buildBracket` topology via `d3-hierarchy` for the midpoint pass, exactly as the current `computeBracketLayout` already does — but Y now comes from the real day-row, not stage depth). `build-graph.ts` composes both zones plus `day-marker`/`group-header` guide nodes into one immutable graph. Because a KO parent is always played after both feeders, `parent.y > child.y` holds, so all edges flow down.

Both layout functions take the **full `Tournament`** (not just `Bracket`), because the day-row of every node — including knockout nodes — must come from each match's real kickoff in `tournament.matches`, and `BracketNode` carries no kickoff. A single shared `dayIndex: ReadonlyMap<string, number>` is computed once in `build-graph.ts` and passed into both layout passes (keeps them O(n) and pure).

**Rejected alternative:** keep the d3-hierarchy `d3.tree` Y output (stage-depth rows) and only re-map X. Rejected because the requirement mandates Y = the match's *real* day-row shared across group and knockout (round smear is explicitly accepted, requirement "Risks/notes"); using tree depth for Y would put knockout rounds on synthetic rows disconnected from the group day axis and break the single continuous timeline. We keep `d3-hierarchy` strictly for the X midpoint fan-in (binary-tree midpoint) and drive Y from `dayIndex`.

## Files

| path | action | responsibility |
|------|--------|----------------|
| `src/features/roadmap/layout/layout-constants.ts` | modify | Add `DAY_ROW_PITCH`, `GROUP_COL_PITCH`, `SLOT`, `LEAF_X_PITCH`, `RAIL_W`, `HEADER_H`. Add **one** centerline contract `[Rev2:M1]`: `export const CX = RAIL_W + 6 * GROUP_COL_PITCH;` (literal column 6 of a 12-col grid) plus `export function centerline(groupCount = 12): number` returning `RAIL_W + (groupCount / 2) * GROUP_COL_PITCH` — `centerline(12) === CX` is asserted in the constants/knockout spec so there is a single source of truth, not two sketches. Keep `NODE_W`/`NODE_H`. Remove now-dead lane/stage constants (`TABLE_W`, `GROUP_GAP`, `GROUP_MATCH_STEP_X`, `LANE_PITCH_Y`, `STAGE_PITCH_Y`, `LEAF_PITCH_X`, `SECTION_GAP`, `groupBandHeight`, `GROUP_W`, `GROUP_H`) once no consumer references them (consumers are all in this table). |
| `src/features/roadmap/layout/day-axis.ts` | create | `dayKey(iso: string): string` → UTC `'yyyy-MM-dd'` (lexically sortable; uses `date-fns-tz`/`date-fns` against `'UTC'`, matching `lib/datetime.ts`'s zone, **not** `formatDate` whose `'dd MMM'` is not sortable) `[Rev2:H3]`; `computeDayIndex(matches): ReadonlyMap<string, number>` (distinct `dayKey`s sorted ascending → 0-based row); `orderedDays(matches): readonly string[]` (ascending `dayKey`s for the rail). Pure, O(n) + one sort. **In `coverage.include` via `layout/**`.** |
| `src/features/roadmap/layout/group-layout.ts` | rewrite | Replace `computeGroupMatchLanes` with `computeGroupGridLayout(tournament, dayIndex): GroupGridLayout`. Group→column index by A..L order; base `x = RAIL_W + col*GROUP_COL_PITCH`, `y = HEADER_H + dayIndex(dayKey(kickoff))*DAY_ROW_PITCH`. Generic pairing rule `[Rev2:H1]`: bucket that group's matches by `dayKey`; for **any** cell with 2 matches, sort the pair by `kickoff` then `matchId` and offset to `x - SLOT/2` (first) / `x + SLOT/2` (second); a singleton cell keeps base `x`. Returns `{ matches: Map<id, XY>, headers: Map<groupName, XY> }` (`headers` at `y < HEADER_H`). Pure, O(n). |
| `src/features/roadmap/layout/bracket-layout.ts` | rewrite | Replace `computeBracketLayout` with `computeKnockoutFunnelLayout(tournament, dayIndex, cx): ReadonlyMap<string, XY>`. Keep d3-hierarchy fan-in for X (root = Final, children = `winnerOf` feeders in `[home, away]` slot order; parent.x = child midpoint) **centered on `cx`** with `LEAF_X_PITCH` leaf spacing (subtract the leaf-mean and add `cx` so the fan is symmetric about `cx`). Set every node's `y = HEADER_H + dayIndex(dayKey(match.kickoff))*DAY_ROW_PITCH` by looking the real `Match` up by `matchId` in `tournament.matches`. THIRD_PLACE x = Final.x + `LEAF_X_PITCH` at its **own** real day-row. Pure, O(n). |
| `src/features/roadmap/build-graph.ts` | rewrite | Build `dayIndex` once from `tournament.matches`; emit one `match` node for **every** match (group + KO) at its computed `{x,y}`; emit one `day-marker` node per distinct day (`x = RAIL_W - DAY_MARKER_INSET`, aligned to its row, `dayLabel = formatDate(isoForDay)`) and one `group-header` node per group (from `headers`, `y < HEADER_H`); feeder edges (`source: group-header-<name>` → seeded R32) + downward advance edges; all edges `sourceHandle:'b'`/`targetHandle:'t'`. No `group` table nodes. Immutable transform. `[Rev2:H3]` `formatDate` is the **only** datetime reuse, for the human rail label. |
| `src/features/roadmap/graph-model.ts` | modify | Add node types `'day-marker'` / `'group-header'` with data `DayMarkerNodeData = { dayKey: string; dayLabel: string; dayIndex: number }` and `GroupHeaderNodeData = { group: string }`; union into `RoadmapNode`. **Do NOT add `dayLabel` to `MatchNodeData`** `[Rev2:L1]` (MatchNode is reused unchanged and never reads it). Remove `GroupNodeData`/`GroupFlowNode` from the positioned-graph union (table moves to overlay); keep `GroupNodeData` only if `GroupTableNode`/overlay still imports it (renamed to a plain props type). |
| `src/components/nodes/DayMarkerNode.tsx` | create | Presentational rail label for a single day (e.g. "11 Jun"). Semantic `<span>`/`<time dateTime>`, design tokens, **no React Flow handles**, `[contain:layout_paint]`, no animation churn. |
| `src/components/nodes/GroupHeaderNode.tsx` | create | Presentational column header (badge "A".."L" + "Group A"). One **bottom source handle** (`id="b"`) so feeder edges originate here; `<button>`-based, clickable to open the standings overlay (calls an `onOpenStandings(group)` passed via node `data` or a React-Flow store callback). |
| `src/components/nodes/node-types.ts` | modify | Register `'day-marker': DayMarkerNode`, `'group-header': GroupHeaderNode`; **drop** `'group': GroupTableNode` from the canvas registry. |
| `src/components/nodes/MatchNode.tsx` | none (reuse) | Verified unchanged — already top/bottom handles + label + `data-final`. |
| `src/components/nodes/GroupTableNode.tsx` | modify | Keep the table markup; remove the React Flow `Handle`/`NodeProps` shell so it renders as a plain panel component (props `{ group: Group }`); consumed by `StandingsOverlay`, not the graph. |
| `src/components/roadmap/StandingsOverlay.tsx` | create | On-demand overlay rendering `GroupTableNode` content for the selected group. `role="dialog"`, `aria-label="Group X standings"`, focus moved to the dialog on open. **Esc handling** `[Rev2:L2]`: the overlay owns Esc via a `keydown` listener registered **only while open**, and calls `stopPropagation()` so `useBracketKeyboard`'s window-level Esc (which clears match selection) does not also fire; on close (Esc or click-out) it **restores focus to the originating `group-header` button**. |
| `src/components/roadmap/RoadmapCanvas.tsx` | modify | Hold `openGroup` state; pass an `onOpenStandings` to `group-header` nodes (via node `data`); render `<StandingsOverlay group={openGroup} onClose={…}/>`; `nodeColor` returns a neutral color for `day-marker`/`group-header`; keep `fitView`/minimap; default composite view. |
| `src/features/roadmap/hooks/useFocusCamera.ts` | modify | `[Rev2:H2]` Rename `isGroupBandNode` → `isGroupZoneNode`: returns true for `node.type === 'group-header'` **or** (`node.type === 'match'` and `node.data.stage === 'GROUP_STAGE'`) → a guaranteed non-empty subset so the "Groups" tab frames the headers + group cards. Knockout subset = `match` nodes with non-`GROUP_STAGE` stage. `boundsOf` footprints sized per node type (match = `NODE_W×NODE_H`; header/marker = their own small footprints). |
| `src/features/roadmap/hooks/useFitOnChange.ts` | none | `[Rev2:M3]` Already keys on `nodes.length` (changes: −12 table, +~N day-markers, +12 headers); confirm the first `fitView` frame is usable on the taller canvas (FIT_PADDING tuning is non-contract). No code change. |
| `src/features/roadmap/hooks/useBracketKeyboard.ts` | none | `[Rev2:L2]` F/0/Esc still valid; the overlay's Esc `stopPropagation()` prevents double-handling. No code change. |
| `src/features/roadmap/hooks/useRoadmapGraph.ts` | none | Memoized passthrough; unaffected by signature internals. |
| `src/features/roadmap/layout/day-axis.test.ts` | create | Unit spec for `dayKey`/`computeDayIndex`/`orderedDays`. |
| `src/features/roadmap/layout/group-layout.test.ts` | rewrite | Spec the group grid (see Test Strategy 5–10), incl. `[Rev2:H1]` pairing across **all** matchdays + adjacent-column no-overlap on every row. |
| `src/features/roadmap/layout/bracket-layout.test.ts` | rewrite | Spec the funnel (see 11–16), incl. `[Rev2:M1]` Final x ≈ exported `CX` and `[Rev2:M2]` monotone narrowing per round. Loads the **full tournament** (real KO kickoffs), not `buildBracket([])`. |
| `src/features/roadmap/build-graph.test.ts` | rewrite | Spec the graph (see 17–23), incl. `[Rev2:M4]` no-duplicate-edge-id and `[Rev2:H2]`/`[Rev2:H3]` source-id `group-header-*`, day-marker/header counts. |
| `src/components/nodes/DayMarkerNode.test.tsx` | create | `[Rev2:H3]` jsdom spec: renders the day label, no handle. |
| `src/components/nodes/GroupHeaderNode.test.tsx` | create | `[Rev2:H3]` jsdom spec: renders group letter + name, one bottom source handle, no top handle, click invokes `onOpenStandings`. |
| `src/features/roadmap/__test-support__/roadmap-fixtures.ts` | modify | Add `distinctMatchDays(t)`, `groupDayCells(t)` (cells with 2 matches, per group/day), `koMatchById(t)`; keep `expectedFeederCount`/`expectedAdvanceEdgeCount`. Remove `loadBracket()` callers' reliance on synthetic kickoffs in the rewritten bracket spec (use `loadTournament().bracket` + `tournament.matches`). |
| `e2e/timeline-grid.spec.ts` | create | `[Rev2:L3]` Smoke: load `/` → a Jun-11 group match node (locator on "Group A" / "11 Jun") AND the Final (`[data-final="true"]`) both reachable. Document browser-unavailability caveat. |
| `e2e/per-match-orientation.spec.ts` | none | `[Rev2:L3]` Leave as-is: its `/Group [A-L].*MD\d/` + `[data-final="true"]` locators still match (label + final attr unchanged); avoids churn on a passing test. |
| `e2e/roadmap.spec.ts` | none (re-verify) | `[Rev2:H2]` Stays green: API/hero/`data-final` assertions unaffected; the Groups/Knockout/All tab clicks still frame a non-empty subset after the `useFocusCamera` rewrite. In the "verified-green" list. |
| `e2e/wheel-zoom.spec.ts` | none (re-verify) | `[Rev2:M3]` Stays green: zoom clamps independent of node count; re-verify the first frame on the taller canvas. |
| `src/styles/global.css` | modify (optional) | Add `--rail-w`/`--header-h`/`--day-row-pitch` tokens mirroring the constants if the rail/header components need them in CSS; otherwise Tailwind arbitrary values from the constants. |

## Data Model / Types

```ts
// layout-constants.ts (tuning, not contract; specs assert relations not absolutes)
export const DAY_ROW_PITCH: number;   // vertical px between adjacent day rows
export const GROUP_COL_PITCH: number; // >= 2*NODE_W + gap, so 2 sub-slots fit without column overlap
export const SLOT: number;            // sub-slot offset inside a column: x ± SLOT/2 (SLOT >= NODE_W + gap)
export const LEAF_X_PITCH: number;    // R32 leaf spacing for the centered fan-in
export const RAIL_W: number;          // left date-rail width; group col 0 starts at x = RAIL_W
export const HEADER_H: number;        // top group-header band height; row 0 starts at y = HEADER_H

// [Rev2:M1] single centerline contract — CX and centerline(12) are the SAME value, asserted in a spec.
export const CX = RAIL_W + 6 * GROUP_COL_PITCH;       // column 6 of the 12-col grid
export function centerline(groupCount = 12): number;  // RAIL_W + (groupCount/2)*GROUP_COL_PITCH; centerline(12) === CX

export interface XY { readonly x: number; readonly y: number }

// day-axis.ts  [Rev2:H3] sortable key lives HERE (under coverage.include via layout/**), datetime.ts untouched
export function dayKey(iso: string): string;                              // UTC 'yyyy-MM-dd' (lexical == chronological)
export function computeDayIndex(matches: readonly Match[]): ReadonlyMap<string, number>; // dayKey -> 0-based row
export function orderedDays(matches: readonly Match[]): readonly string[];               // ascending dayKeys

// group-layout.ts
export interface GroupGridLayout {
  readonly matches: ReadonlyMap<string, XY>;  // group-match id -> position (± SLOT/2 when its (group,day) cell has 2)
  readonly headers: ReadonlyMap<string, XY>;  // group name "A".."L" -> header position (y < HEADER_H)
}
export function computeGroupGridLayout(
  tournament: Tournament,
  dayIndex: ReadonlyMap<string, number>,
): GroupGridLayout;

// bracket-layout.ts
export function computeKnockoutFunnelLayout(
  tournament: Tournament,
  dayIndex: ReadonlyMap<string, number>,
  cx: number,                              // pass the exported CX from build-graph
): ReadonlyMap<string, XY>;                // every bracket node id -> position (y = real day-row, x = centered fan-in)

// graph-model.ts  [Rev2:L1] MatchNodeData unchanged (no dayLabel added)
export type DayMarkerNodeData = { dayKey: string; dayLabel: string; dayIndex: number };
export type GroupHeaderNodeData = { group: string };
export type DayMarkerFlowNode = Node<DayMarkerNodeData, 'day-marker'>;
export type GroupHeaderFlowNode = Node<GroupHeaderNodeData, 'group-header'>;
export type RoadmapNode = MatchFlowNode | DayMarkerFlowNode | GroupHeaderFlowNode;
```

Notes:
- **Day key derivation** `[Rev2:H3]`: `dayKey` formats with `date-fns-tz` `formatInTimeZone(parseISO(iso), 'UTC', 'yyyy-MM-dd')` — the same lib family and zone as `lib/datetime.ts`, but defined locally in `day-axis.ts` so (a) the key is lexically sortable and (b) `lib/datetime.ts` (coverage-included + do-not-touch) gains no new export. `formatDate` (`'dd MMM'`) is reused **only** for the human `dayLabel` on `DayMarkerNode`.
- **KO node Y** reads the match's real kickoff: look it up in `tournament.matches` by `matchId` inside `computeKnockoutFunnelLayout`. `BracketNode.matchId === Match.id` for real matches (confirmed in `build-bracket.ts:80` — `matchId = match.id`); in the mock all 32 KO matches are real, so all resolve. Synthetic ids (live data missing later rounds) → fall back to a stage-ordered day or skip; documented (Q3), not exercised by the fixture.
- **IDs:** `day-marker-<dayKey>`, `group-header-<name>`; feeder edge ids `feed-<name>-<r32MatchId>` with `source: group-header-<name>` `[Rev2:M4]`; advance edge ids `adv-<source>-<target>`. The id schemes are collision-free (distinct prefixes; unique group/match ids) and the build-graph spec asserts no duplicate node id **and** no duplicate edge id.

## Test Strategy

### Behaviors to test (unit)
**`day-axis` (new, `day-axis.test.ts`):**
1. `dayKey` returns `'yyyy-MM-dd'` UTC and is lexically sortable (a later instant on the same day collapses to the same key; an earlier calendar day sorts before a later one).
2. `computeDayIndex`: distinct calendar days only; identical-day matches collapse to one index; indices 0-based, contiguous, ascending by date.
3. Group and knockout days share one axis: a Jun-11 group day and the Jul/Jun-19 final day both appear; the Final's day has the max index.
4. Pure: same input → equal map; deeply-frozen input does not throw.

**`computeGroupGridLayout`:**
5. Exactly one position per GROUP_STAGE match (72, fixture-derived).
6. A group's base `x` = its fixed column `RAIL_W + colIndex*GROUP_COL_PITCH` (column constant across all that group's days, modulo the ±SLOT/2 offset).
7. `y = HEADER_H + dayIndex(dayKey)*DAY_ROW_PITCH`; rows strictly chronological (later kickoff day → strictly greater y).
8. `[Rev2:H1]` **Pairing across all matchdays:** for **every** `(group, day)` cell — and in the mock that is all of MD1/MD2/MD3 — the 2 matches are placed at `column ± SLOT/2`, ordered by `kickoff` then `matchId` (lower kickoff → left/`-SLOT/2`). Assert via `groupDayCells(t)` that every group has 3 two-match cells, and each pair's xs are `{base-SLOT/2, base+SLOT/2}`.
9. `[Rev2:H1]` **No adjacent-column overlap on any row:** for every day-row, the max x of column `c`'s right sub-slot (`base_c + SLOT/2 + NODE_W`) < the min x of column `c+1`'s left sub-slot (`base_{c+1} - SLOT/2`). Asserted from the constants (`GROUP_COL_PITCH`, `SLOT`, `NODE_W`) and verified to hold for every populated row.
10. One header position per group (12), each `y < HEADER_H`, distinct ascending x by column index. Pure + frozen-input safe.

**`computeKnockoutFunnelLayout`:**
11. Every bracket node positioned (32 incl. THIRD_PLACE), loaded from the **full tournament** (real KO kickoffs).
12. Each internal parent x = midpoint of its two winner-children x (15 winner-tree parents, fixture-derived via `winnerChildren`).
13. R32 leaves symmetric about `cx` with `LEAF_X_PITCH` spacing (distinct, monotone); `[Rev2:M1]` the Final's x ≈ the **exported `CX`** (`toBeCloseTo(CX)`), and a separate assertion `centerline(12) === CX` pins the single contract.
14. `y` = each match's real day-row; KO y increases with date; the Final has the max y among KO nodes; `parent.y > child.y` for every advance pair.
15. `[Rev2:M2]` **Monotone narrowing per round:** for each internal parent, the x-spread of its two children (`|x_a − x_b|`) ≥ the parent's own contribution to its grandparent — operationally: define per-round leaf-span = max(x)−min(x) over the round's nodes; assert span(R32) > span(R16) > span(QF) > span(SF) ≥ span(FINAL). This makes "the funnel reads" a test, not prose.
16. `[Q1]` THIRD_PLACE sits x-adjacent to the Final (`x = Final.x + LEAF_X_PITCH`) at its own real day-row (Jun 18, one row above the Jun-19 Final) — assert x-adjacency, **not** same-y. Pure + frozen-input safe.

**`buildRoadmapGraph`:**
17. One `match` node per match (104 = 72 group + 32 bracket, fixture-derived); **no** `group` table nodes (`nodes.filter(type==='group')` is empty).
18. Exactly one `day-marker` per distinct match-day (= `distinctMatchDays(t).length`); exactly one `group-header` per group (12).
19. `[Rev2:H3]` Feeder edges = `expectedFeederCount(t)`; each `source` matches `/^group-header-/`, each `target` an R32 match id; all endpoints resolvable.
20. Advance edges = `expectedAdvanceEdgeCount(t)`; all endpoints resolvable.
21. Every edge `sourceHandle:'b'`, `targetHandle:'t'`; no `sl/sr/tl/tr`.
22. `[Rev2:M4]` **No duplicate node id AND no duplicate edge id** (`new Set(ids).size === ids.length` for both) — guards the `group-` → `group-header-` feeder source rename.
23. Group cards carry group/matchday/stage from the domain match; KO cards null group/matchday. Pure (equal across calls) + frozen-input safe.

### Behaviors to test (component, jsdom) `[Rev2:H3]`
24. `DayMarkerNode` renders its `dayLabel`; exposes **no** React Flow handle.
25. `GroupHeaderNode` renders the group letter + "Group X", exposes **exactly one** bottom source handle and **no** top handle, and a click invokes its `onOpenStandings` callback with the group.
26. `MatchNode.test.tsx` stays green unchanged (reuse contract).

### E2E (Playwright smoke)
27. `[Rev2:L3]` `e2e/timeline-grid.spec.ts`: load `/` → a Jun-11 group match node (locator on "Group A"/"11 Jun") AND the Final (`[data-final="true"]`) both attached. (Document browser-unavailability if it cannot execute in-sandbox.)
28. `[Rev2:H2]` `e2e/roadmap.spec.ts` re-verified green: Groups tab → `?focus=groups` + frames a non-empty subset; Knockout tab visible; All tab → `[data-final="true"]` click opens the detail panel.
29. `[Rev2:L3]` `e2e/per-match-orientation.spec.ts` left as-is, re-verified green (regex + final attr still match).
30. `[Rev2:M3]` `e2e/wheel-zoom.spec.ts` re-verified green on the taller canvas (zoom clamps unchanged; first frame usable).

### Coverage target `[Rev2:H3]`
- **Primary, ≥80% line/branch** on the modules already in `coverage.include`: `src/features/roadmap/layout/**` (incl. new `day-axis.ts`, rewritten `group-layout.ts`/`bracket-layout.ts`, `layout-constants.ts`) and `src/features/roadmap/build-graph.ts`. These are fully unit-covered by the rewritten + new specs above.
- **Supplemental:** `DayMarkerNode.tsx`/`GroupHeaderNode.tsx`/`StandingsOverlay.tsx` live under `src/components/**`, which `vitest.config.ts` `coverage.include` does **not** measure. Decision: do **not** widen `coverage.include` (keeps the coverage gate scoped to pure geometry/transform per the existing config); instead state explicitly that component coverage is supplemental via the jsdom specs (24–26) + E2E, and the 80% target applies to the layout/build-graph/day-axis modules. (Alternative — adding the three component paths to `coverage.include` and counting them — is recorded as the fallback if the reviewer requires component coverage to count.)

## Risks & Open Questions

- **Q1 — THIRD_PLACE row.** Real kickoff Jun 18 vs Final Jun 19 → different day-rows. Plan: own real day-row, x-adjacent to the Final's column; spec asserts x-adjacency, not same-y. Confirm acceptable vs. forcing it onto the Final's row.
- **Q2 — `CX` overlap.** `CX = RAIL_W + 6*GROUP_COL_PITCH` sits at column 6, so the funnel's upper leaves overlap the group columns' x-range — but only on later (lower) rows, so no visual collision. Confirmed acceptable per the requirement's "centered on the grid centerline."
- **Q3 — Synthetic KO ids.** If a provider omits later-round matches, `buildBracket` emits synthetic ids (`build-bracket.ts:19,80`) with no kickoff → no day-row. The mock has all KO matches real, so untested here; for live data, fall back to a stage-ordered day or skip the node. Low risk; documented.
- **Risk — round smear.** A KO round spans several day-rows (truthful). Accepted; x still narrows so the funnel reads (`[Rev2:M2]` makes this a test).
- **Risk — column width vs. sub-slots** `[Rev2:H1]`. `GROUP_COL_PITCH` must exceed `2*NODE_W + gap` and `SLOT >= NODE_W + gap` so two 260px cards fit and never overlap the neighbor column on any row. Encoded as a constant relation and asserted in behavior 9 for every populated row (which in the mock is every group day-row).
- **Risk — standings removed from graph** `[Rev2:H2]`. Removing `group` nodes changes `useFocusCamera`'s zone detection and the minimap `nodeColor`; both updated together so "Groups" focus frames a non-empty subset (`group-header` + group `match` nodes) and the minimap colors the new node types.
- **Risk — taller canvas / fitView** `[Rev2:M3]`. ~30–35 day-rows × pitch is tall; the node-count change (−12 +N+12) does not regress `useFitOnChange` (keys on `nodes.length`) or `wheel-zoom.spec.ts` (clamps independent of count). Tune `FIT_PADDING` only if the first frame is unreadable (tuning, not contract).
- **Risk — overlay Esc conflict** `[Rev2:L2]`. `useBracketKeyboard` owns window-level Esc (clears match selection). `StandingsOverlay` registers its own Esc listener only while open and `stopPropagation()`s, then restores focus to the originating `group-header` button — so Esc closes the overlay without also clearing a match selection.
- **Open — overlay vs. panel for standings.** Overlay chosen to keep the matrix match-centric; an inline expandable header is a smaller change but loses that property.

## Acceptance Criteria

1. Every match in `tournament.matches` yields exactly one `match` node (104 in the mock: 72 group + 32 bracket); no positioned `group` table node remains in the graph.
2. A group match's base `x` equals its group's fixed column (`RAIL_W + colIndex*GROUP_COL_PITCH`), constant per group except the `±SLOT/2` cell offset; columns are in A..L order (distinct, ascending x).
3. Every node's `y` equals `HEADER_H + dayIndex(dayKey(kickoff))*DAY_ROW_PITCH`; rows are strictly chronological by calendar day, shared by group and knockout nodes.
4. `[Rev2:H1]` For **any** `(group, day)` cell holding 2 matches (in the mock, every matchday MD1/MD2/MD3), the two render side-by-side at `x ± SLOT/2`, ordered by `kickoff` then `matchId`; adjacent columns' sub-slots never overlap in x on any row.
5. Exactly one `day-marker` node exists per distinct match-day, positioned at `x < RAIL_W`, aligned to its row, in ascending order; its `dayLabel` is the human-readable date (`formatDate`).
6. Exactly one `group-header` node exists per group A..L, positioned at `y < HEADER_H`, aligned to its column.
7. `[Rev2:M1]/[Rev2:M2]` Every knockout match's `y` equals its real day-row and increases with date; each KO parent's `x` equals the midpoint of its two winner-children's `x`; per-round x-span narrows monotonically (R32 > R16 > QF > SF ≥ FINAL); the Final has the max y among KO nodes and `x ≈ CX` (the single exported centerline, `centerline(12) === CX`); THIRD_PLACE is x-adjacent to the Final.
8. For every advance pair, `parent.y > child.y` (edges flow strictly downward).
9. `[Rev2:H3]` Feeder edges connect each `group-header` (`source` matches `/^group-header-/`) to exactly the R32 matches it seeds; advance edges connect each non-group bracket slot to its parent; counts match the fixture-derived expectations.
10. Every edge uses `sourceHandle:'b'` / `targetHandle:'t'`; no `sl/sr/tl/tr` handles remain.
11. `[Rev2:M4]` The graph has no duplicate node id and no duplicate edge id.
12. `computeDayIndex`, `computeGroupGridLayout`, `computeKnockoutFunnelLayout` are pure and O(n); `buildRoadmapGraph` is an immutable transform (equal across calls; frozen input does not throw).
13. Standings tables are available on demand from a `group-header` (overlay), not as positioned grid nodes; the overlay closes on Esc/click-out without clearing match selection and restores focus to the originating header `[Rev2:L2]`.
14. `[Rev2:H2]` The canvas defaults to this composite view; the Groups/Knockout/All focus tabs each frame a non-empty subset; `fitView`, keyboard nav, and minimap span the taller canvas without error.
15. `npm run test` is all green (rewritten + new specs pass; domain/data/lod/query/server/datetime/derive-matchdays/MatchDetailPanel/MatchNode specs unchanged and green); the four E2E specs (`timeline-grid`, `roadmap`, `per-match-orientation`, `wheel-zoom`) pass `[Rev2:H2/M3/L3]`; `npm run typecheck` and `npm run build` (vite) succeed.
16. Playwright smoke: after loading `/`, a Jun-11 group match node and the Final node are both reachable in the DOM (documented if browsers are unavailable in-sandbox).
