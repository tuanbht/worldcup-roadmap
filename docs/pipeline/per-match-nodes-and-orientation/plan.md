# Plan: Per-match nodes + phase-specific orientation (layout overhaul, post-Vite)

Convert the roadmap from "group tables + mirrored horizontal bracket" into **one continuous
zoomable canvas** where **every match is one node**: group matches in **horizontal lanes (one per
group A–L, ordered by kickoff)** flowing down into a **vertical top→bottom knockout tree** (R32 at
top → Final at bottom, computed with `d3-hierarchy`), standings tables preserved at each lane start,
feeder edges linking each group to the R32 matches it seeds.

> **Post-migration rewrite.** The stack is now **Vite + React 19 SPA + Hono** (no Next.js). This plan
> supersedes the pre-migration `plan.md`, correcting every assumption that the migration invalidated.
> Reality deltas verified against the live tree (see "Codebase reality" below).

## Codebase reality (verified — corrections to the prior plan)

- **`d3-hierarchy` + `@types/d3-hierarchy` are ALREADY installed** (`package.json` deps/devDeps).
  **No `package.json` change is required.** A passing install smoke already exists at
  `src/lib/d3-hierarchy.smoke.test.ts` — do **not** touch it.
- **DOM testing is ALREADY available**: `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, and `jsdom` are installed; `vitest.config.ts` `include` already
  covers `src/**/*.test.tsx`, default `environment: 'node'`, per-file `// @vitest-environment jsdom`
  pragma supported, `setupFiles: ['./vitest.setup.ts']`. The prior plan's "no DOM test" workaround is
  obsolete — we MAY add a jsdom `MatchNode` handle test, but the **authoritative** handle-contract
  assertion stays in `build-graph.test.ts` (pure, deterministic).
- **CSS lives at `src/styles/global.css`** (NOT `src/app/globals.css`). Tokens `--node-w/--node-h`,
  `.advance-edge*`, `[data-lod] [data-lod-detail]` confirmed there.
- **No SSR.** `useStageView` already guards `typeof window` but runs client-only; the URL-param logic
  carries over unchanged in shape.
- **Fixture counts (derived, re-verified):** mock has **104 matches, 12 groups, 32 bracket nodes**.
  Group-stage matches = `104 − 32 = 72` (12 groups × 3 matchdays × 2 = 72). Each group's 6 matches
  have **distinct kickoffs** (`iso(5, 11+md*4, 12+(g%4)*2, n*30)` in `build-mock-tournament.ts:176`),
  so a strict kickoff ordering inside a lane is well-defined.
- **Domain `Match` already carries `group: string|null` + `matchday: number|null`**
  (`src/domain/types/match.ts:53-55`); the mock populates them (`...mock:171-172`). Only the
  `MatchNodeData` view model + `matchData()` need to surface them — **no schema/parse change.**
- **`BracketSlot.source` is a discriminated union** `{kind:'group'|'winnerOf'|'loserOf', …}` with
  **no bare `matchId`** — children are resolved via `source.kind==='winnerOf'` →
  `source.matchId` (`src/domain/types/bracket.ts:12-15`). `build-bracket.ts:89-92` pairs child
  `slot*2` (home) / `slot*2+1` (away) — the structural midpoint guarantee.
- **THIRD_PLACE slots are `loserOf` the two semifinals** (`build-bracket.ts:147-148`), so it is **not**
  part of the winner-tree and is excluded from the midpoint assertion.
- **Canvas uses `panOnScroll`** (`RoadmapCanvas.tsx:91`): plain wheel pans; **ctrl+wheel zooms**. The
  e2e smoke must use the `ctrlWheel` helper pattern from `e2e/wheel-zoom.spec.ts:50-67`.

## Scope

### In scope

- Emit a `match` node for **every `GROUP_STAGE` match** (72 in the mock — derived, never hardcoded),
  reusing the existing `match` node type and the `matchData()` payload shape.
- Horizontal group band: one lane per group A..L; the `GroupTableNode` stays at lane start (x=0);
  group matches sorted by `Match.kickoff` ascending at strictly-increasing x; each group a distinct
  lane y.
- Vertical knockout via **`d3-hierarchy` (`d3.tree`)**: stage depth → y (R32 top → Final bottom),
  parent x = midpoint of its two structural children's x; `THIRD_PLACE` beside the Final.
- One continuous canvas: KO band starts at `y >= groupBandHeight + SECTION_GAP`; feeder edges
  (group node → seeded R32 matches) retained and re-routed **downward**.
- Handle migration to **top (target `t`) + bottom (source `b`)** on `MatchNode` and in `handlesFor`,
  kept in lock-step so edges don't detach; `GroupTableNode` source handle moves to bottom; verify
  `AdvanceEdge` renders cleanly top↔bottom (it reads RF-passed positions — no logic change expected).
- Add `group: string|null` + `matchday: number|null` to `MatchNodeData`; render "Group A · MD1" on
  group cards (Tailwind utilities on the component, behind `data-lod-detail`).
- Demote `StageToggle` from layout-swap to a **focus/scroll-to-phase** camera control; the continuous
  canvas becomes the default and only layout. Repurpose `useStageView` → focus state (`?focus=`).
- Retune `useFitOnChange` / `useBracketKeyboard` fit-padding for the taller continuous canvas.
- Rewrite `build-graph.test.ts`, `bracket-layout.test.ts`, `group-layout.test.ts` to the new spec
  (the old files characterize the deleted horizontal/mirrored model).
- Add a Playwright smoke (`e2e/per-match-orientation.spec.ts`): load → ctrl+wheel zoom → a group match
  node AND the Final node both reachable.
- Update `e2e/{roadmap,visual,a11y,wheel-zoom}.spec.ts` for `?focus=` and refreshed counts/baselines.

### Out of scope

- **Domain logic** — `computeGroups`, `buildBracket`, `R32_SEEDING`, `stage-order`, the mock
  simulator: unchanged. Tests `build-bracket.test.ts`, `build-mock-tournament.test.ts`,
  `standings.test.ts` stay GREEN untouched.
- **`parseTournament` / `tournament-schema`** — no change; `Match.group`/`Match.matchday` already
  exist on the domain type. Only the view model changes.
- **LOD / semantic-zoom engine** (`lod.ts`, `useZoomLevel`, `lod.test.ts`) — reused as-is. Keep the
  LOD work intact; the new group-card label reuses the existing `data-lod-detail` hook, no threshold
  change.
- **`d3-hierarchy` install smoke** (`src/lib/d3-hierarchy.smoke.test.ts`) — leave untouched.
- **`package.json`** — no dependency add (d3-hierarchy already present).
- Data layer, server routes, `MatchDetailPanel`, datetime/format utilities, TanStack Query wiring,
  live polling — unchanged. Their tests stay GREEN.
- `GroupTableNode` internals beyond moving its source handle to the bottom.
- New node-to-node keyboard traversal (the requirement says traversal "spans group + KO" — see Risks:
  `useBracketKeyboard` today binds only F/0/Esc; cross-phase node traversal would be net-new with its
  own tests. We keep fit/reset and document the gap rather than silently expand scope).

## Approach

Keep `buildRoadmapGraph` as the single immutable `Tournament → {nodes, edges}` transform and keep the
pure layout helpers as the only place geometry lives. Compose three pure passes inside
`build-graph.ts` into one continuous coordinate space:

1. **`computeGroupMatchLanes(tournament)`** (new, `group-layout.ts`) — group band: one lane per group
   (`laneY = laneIndex * LANE_PITCH_Y`), table at `{x:0, y:laneY}`, group matches sorted by `kickoff`
   ascending at `x = TABLE_W + GROUP_GAP + orderIndex * GROUP_MATCH_STEP_X`. Returns table positions,
   match positions, and `bandHeight`.
2. **`computeBracketLayout(bracket, bandOffsetY)`** (rewritten, `bracket-layout.ts`) — vertical
   top→bottom KO via `d3.tree`, offset below the group band.
3. The existing **R32 feeder seeding** (`R32_SEEDING`) — group node → seeded R32 match, re-routed
   downward.

Migrate handles to top/bottom in `MatchNode` + `handlesFor` + `GroupTableNode` together. Collapse the
3-view model to a single continuous layout; repurpose the view enum into a **focus target**
(`'all' | 'groups' | 'knockout'`) that drives a camera move (`setCenter`/`fitBounds`), not graph shape.

Use `d3-hierarchy`'s `d3.tree()` for the KO fan-in: a bracket is a balanced binary tree (16→8→4→2→1),
and `d3.tree().nodeSize([LEAF_PITCH_X, STAGE_PITCH_Y])` gives `parent.x = midpoint-of-its-two-children.x`
for free — exactly the requirement — **provided the hierarchy's children are enumerated in `[home,
away]` order so they match the structural `slot*2 / slot*2+1` pairing** (see Data Model). Map d3's
normalized `{x, y}` onto our pitch constants and **flip depth** so R32 (deepest) sits at top, Final
(depth 0) at bottom.

**Rejected alternative:** keep the existing hand-rolled bottom-up fan-in (transpose x↔y, reverse
depth). It is O(n) and works, but the library-first policy supersedes hand-rolled tree layout with
`d3-hierarchy` for the bracket, and `d3.tree` removes the bespoke `yBySideDepth` accumulator plus the
mirrored-half special-casing. The hand-rolled vertical fan-in (averaging `child[2p].x`/`child[2p+1].x`,
preserving the `slotIndex` child ordering) remains the **documented fallback** if a `d3-hierarchy`
runtime issue ever surfaces — but the install is already proven, so the library path is primary.

## Files

| Path | Action | Responsibility |
| --- | --- | --- |
| `src/features/roadmap/layout/layout-constants.ts` | modify | Add `LANE_PITCH_Y`, `GROUP_MATCH_STEP_X`, `GROUP_GAP`, `TABLE_W`, `STAGE_PITCH_Y`, `LEAF_PITCH_X`, `SECTION_GAP`, and `groupBandHeight(groupCount)`. Retire the now-unused `STEP`/`ROW_PITCH` (and `GROUP_GAP_X`/`GROUP_GAP_Y` once `computeGroupGrid` is deleted). Keep `XY`, `NODE_W/H`, `GROUP_W/H`, `COL_GAP`, `ROW_GAP`. |
| `src/features/roadmap/layout/group-layout.ts` | rewrite | Replace `computeGroupGrid`/`groupGridWidth` with `computeGroupMatchLanes(tournament): GroupLaneLayout` — per-group lane y, table x=0, match positions keyed by `matchId` sorted by `kickoff`, plus `bandHeight`. Pure, O(n). |
| `src/features/roadmap/layout/bracket-layout.ts` | rewrite | Vertical top→bottom KO via `d3-hierarchy` `d3.tree`. New signature `computeBracketLayout(bracket, bandOffsetY): Map<string, XY>`. Children resolved by `source.kind==='winnerOf'` → `source.matchId`; depth→y downward; midpoint→x; normalize minX→0; `THIRD_PLACE` beside the normalized Final. Pure, O(n). |
| `src/features/roadmap/build-graph.ts` | rewrite | Single continuous graph: emit `match` nodes for every group match (`matchData`) + `group` table nodes + KO match nodes; compose group band above + KO below (`bandOffsetY = groupBandHeight + SECTION_GAP`); feeder edges group→R32; `handlesFor` returns a constant `{sourceHandle:'b', targetHandle:'t'}` for all edges; `matchData` reads `match.group`/`match.matchday` (`null` in the no-match fallback). Drop the 3-view branching + `groupsOnlyGraph` + x-offset. New signature `buildRoadmapGraph(tournament)` (no `view` arg). |
| `src/features/roadmap/graph-model.ts` | modify | Add `group: string \| null` + `matchday: number \| null` to `MatchNodeData`. Replace `RoadmapView = 'groups'\|'bracket'\|'full'` with `RoadmapFocus = 'all'\|'groups'\|'knockout'`. |
| `src/components/nodes/MatchNode.tsx` | modify | Replace `tl/tr` target + `sl/sr` source handles with one `top` target (`id="t"`, `Position.Top`) + one `bottom` source (`id="b"`, `Position.Bottom`); render "Group A · MD1" label (Tailwind, `data-lod-detail`) when `group` set; optional group-vs-KO visual variant via a `data-group` attribute. |
| `src/components/nodes/GroupTableNode.tsx` | modify | Move the `sr` (Right) source handle to a `bottom` source handle (`id="b"`, `Position.Bottom`) so feeder edges flow downward. |
| `src/components/edges/AdvanceEdge.tsx` | verify | Confirm `getBezierPath` renders cleanly top↔bottom (`sourcePosition`/`targetPosition` passed by RF from the handle sides — no code change expected). Bump `curvature` only if visual review needs it. |
| `src/features/roadmap/hooks/useStageView.ts` | modify | Re-key to focus: `RoadmapFocus`, default `'all'`, persist `?focus=` param, expose `setFocus`. Keep the exported hook name `useStageView` (or rename to `useRoadmapFocus` and update 1 import) — internals become focus. |
| `src/components/roadmap/StageToggle.tsx` | modify | Repurpose: on change, move the camera to the chosen phase via RF `fitBounds`/`setCenter`; no layout swap. Options `All / Groups / Knockout`. Takes `focus` + `onChange`. |
| `src/features/roadmap/hooks/useFitOnChange.ts` | modify | Retune padding so the taller continuous canvas frames cleanly; key becomes `nodes.length` only (no `view` prefix). |
| `src/features/roadmap/hooks/useBracketKeyboard.ts` | modify (small) | Only retune fit padding for the taller canvas; keep F/0/Esc bindings. No node-to-node traversal added (documented gap). |
| `src/features/roadmap/hooks/useRoadmapGraph.ts` | modify | Drop the `view` param: `useRoadmapGraph(tournament)` → memo on `tournament` only. |
| `src/components/roadmap/RoadmapCanvas.tsx` | modify | Call `buildRoadmapGraph(tournament)` (no view); wire focus → camera; `useFitOnChange(nodes.length)`; pass `focus`/`setFocus` to `StageToggle`. |
| `src/styles/global.css` | modify (small) | Keep `.advance-edge*` + `[data-lod] [data-lod-detail]` rules; add only a band-divider affordance if needed. Group-card label/variant live as Tailwind on the component. |
| `src/features/roadmap/layout/bracket-layout.test.ts` | rewrite | New vertical assertions (depth→y monotonic, midpoint→x via slot pairing, third-place beside Final, `bandOffsetY` arg). Replaces the mirrored-x/`STEP` assertions. |
| `src/features/roadmap/layout/group-layout.test.ts` | rewrite | Cover `computeGroupMatchLanes` (count==72 derived, ordering, x monotonic, distinct lane y, table at x=0). Old file imports deleted symbols — replaced wholesale. |
| `src/features/roadmap/build-graph.test.ts` | rewrite | New continuous-graph assertions (72 group nodes + 32 KO + 12 tables, KO below band, downward `b`/`t` handles, feeders, group/matchday payload, purity). Old file calls `buildRoadmapGraph(t,'groups'\|'bracket'\|'full')` + `computeGroupGrid` — all gone — so replaced wholesale. |
| `src/components/nodes/MatchNode.test.tsx` | create (optional) | jsdom render test: a group-data node renders the "Group A · MD1" label + a top target & bottom source handle; a KO node renders no group label. (DOM deps already installed; reinforces the build-graph contract.) |
| `e2e/per-match-orientation.spec.ts` | create | Playwright smoke: load → ctrl+wheel zoom → a group match node (renders a "Group · MD" label) AND a Final node (`[data-final="true"]`) both reachable. |
| `e2e/roadmap.spec.ts` | modify | Drop the `?view=` 3-tab toggle assertion; assert default continuous canvas (group + KO nodes present); update the toggle test to the `All/Groups/Knockout` focus control (or assert focus URL). |
| `e2e/wheel-zoom.spec.ts` | modify | Replace `/?view=bracket` with `/` (or `/?focus=all`); rest of the ctrl+wheel logic unchanged. |
| `e2e/visual.spec.ts` | modify | Replace `/?view=bracket` with `/`; regenerate screenshot baselines (`test:e2e:update`) — flag, don't auto-bless. |
| `e2e/a11y.spec.ts` | modify | Replace `/?view=bracket` with `/`; assertions otherwise unchanged. |
| `README.md` | modify (small) | Update any `?view=` reference to `?focus=` / continuous canvas (doc consistency only). |

## Data Model / Types

```ts
// graph-model.ts — MatchNodeData (group/matchday already exist on domain Match)
export type MatchNodeData = {
  matchId: string;
  stage: Stage;
  roundLabel: string;
  group: string | null;    // NEW — "A".."L" for group matches, null in KO
  matchday: number | null; // NEW — 1..3 group, null otherwise
  home: TeamRef;
  away: TeamRef;
  score: Score;
  status: MatchStatus;
  kickoff: string | null;
  minute: number | null;
  venue: Venue;
  isFinal: boolean;
  isThirdPlace: boolean;
};

// Focus replaces the 3-layout view — camera target only, no graph-shape change.
export type RoadmapFocus = 'all' | 'groups' | 'knockout';

// group-layout.ts
export interface GroupLaneLayout {
  readonly table: ReadonlyMap<string, XY>;   // key = group name "A".."L"; {x:0, y:laneY}
  readonly matches: ReadonlyMap<string, XY>; // key = group-match matchId
  readonly bandHeight: number;               // = groupBandHeight(groupCount)
}
export function computeGroupMatchLanes(tournament: Tournament): GroupLaneLayout;

// layout-constants.ts (illustrative; tune in impl — tests assert RELATIONS, not absolutes)
export const LANE_PITCH_Y = GROUP_H + 40;     // distance between group lanes (>= GROUP_H so lanes never overlap)
export const TABLE_W = GROUP_W;               // table width consumed before the first match
export const GROUP_GAP = 56;                  // gap: table → first match
export const GROUP_MATCH_STEP_X = NODE_W + 56;// x step between matches in a lane
export const STAGE_PITCH_Y = NODE_H + 110;    // vertical distance between KO stages
export const LEAF_PITCH_X = NODE_W + 36;      // horizontal spacing of R32 leaves
export const SECTION_GAP = 240;               // group band → KO band gap
export function groupBandHeight(groupCount: number): number; // = groupCount * LANE_PITCH_Y

// bracket-layout.ts — d3-hierarchy, NEW two-arg signature
import { hierarchy, tree } from 'd3-hierarchy';
export function computeBracketLayout(bracket: Bracket, bandOffsetY: number): Map<string, XY>;
```

### `matchData()` change

`matchData(node, match)` in `build-graph.ts` is the only place `MatchNodeData` is populated. It now
also emits `group`/`matchday`:

- concrete-match branch: `group: match.group`, `matchday: match.matchday`;
- bracket-node-without-match fallback branch: `group: null`, `matchday: null`.

For group-stage nodes built directly from `tournament.matches` (not via the bracket), construct the
same `MatchNodeData` shape with `node.stage = 'GROUP_STAGE'`, `roundLabel = STAGE_LABELS.GROUP_STAGE`,
`isFinal/isThirdPlace = false`, `group = match.group`, `matchday = match.matchday`. No schema/parse
change — domain `Match.group`/`Match.matchday` already exist.

### Group lane layout (`computeGroupMatchLanes`)

- Group-stage matches = `tournament.matches.filter(m => m.stage === 'GROUP_STAGE')`. Count is
  **derived from the fixture** (72 for the mock).
- For each group letter in `A..L` order (lane index `i`): `laneY = i * LANE_PITCH_Y`. Table position
  `{x: 0, y: laneY}` keyed by group name.
- That group's matches, sorted by `kickoff.localeCompare` ascending (ISO-UTC ⇒ lexical == chronological;
  tie-break on `id` for determinism), get `{x: TABLE_W + GROUP_GAP + orderIndex * GROUP_MATCH_STEP_X,
  y: laneY}`. So x strictly increases with kickoff; all matches in a lane share `laneY`; each lane has
  a distinct y.
- `bandHeight = groupBandHeight(groupCount)`.

### KO layout via d3-hierarchy

- **Children resolution.** Build the d3 hierarchy with a child accessor that switches on `source.kind`:
  - root = the FINAL `BracketNode`;
  - a node's children = `[node.home, node.away]` mapped to the `BracketNode` referenced by
    `source.matchId` **only when `source.kind === 'winnerOf'`**; stop (leaf) when
    `source.kind === 'group'` (the R32 leaves);
  - resolve `matchId` → `BracketNode` via a `Map` built from `bracket.rounds.flatMap(r => r.nodes)`.
- **Order = `[home, away]` ⇒ structural `slot*2 / slot*2+1` pairing.** `build-bracket.ts:89-92` makes
  child `slot*2` feed `home` and `slot*2+1` feed `away`. Emitting children in `[home, away]` order
  preserves that ordering, so `d3.tree`'s laid-out leaf order matches the structural `slotIndex` order
  and `parent.x` coincides with the **structural** midpoint the acceptance test asserts.
- **Coordinates.** `d3.tree().nodeSize([LEAF_PITCH_X, STAGE_PITCH_Y])` → use `node.x` for x and flip
  depth for y: `y = bandOffsetY + (maxDepth - node.depth) * STAGE_PITCH_Y` so R32 leaves (deepest) sit
  at top and the Final (depth 0) at the bottom. `bandOffsetY = groupBandHeight + SECTION_GAP` is passed
  in from `build-graph.ts`.
- **x-origin normalization order.** After the tree pass, compute `minX` over all tree nodes and shift
  every tree node by `-minX` so the canvas starts at x≥0. **THIRD_PLACE is placed AFTER this shift,
  relative to the already-normalized Final x:** `{x: normalizedFinalX + LEAF_PITCH_X, y: finalY}`.
  THIRD_PLACE has no `winnerOf` children, so it is **excluded from the d3 tree and the midpoint-x
  assertion**. Layout and tests therefore agree on the same normalized origin.

### Handles

- `MatchNode`: one `top` target (`id="t"`, `Position.Top`) + one `bottom` source (`id="b"`,
  `Position.Bottom`). Remove `tl/tr/sl/sr`.
- `handlesFor()` collapses to a constant `{ sourceHandle: 'b', targetHandle: 't' }` for **all** advance
  + feeder edges (child is always above its parent in the vertical layout).
- `GroupTableNode`: source handle moves to `Position.Bottom` (`id="b"`); feeder edges flow down to R32.

## Test Strategy

Vitest unit tests (pure layout + build-graph — fixture-derived counts, never hardcoded) + an optional
jsdom `MatchNode` test + one Playwright smoke. **Coverage target ≥80%** on the changed
`src/features/roadmap/layout/**` + `src/features/roadmap/build-graph.ts` modules (the existing
`coverage.include` scope). `npm run test` must be all green.

### Untouched green tests (must NOT regress)

`build-bracket.test.ts`, `build-mock-tournament.test.ts`, `standings.test.ts`, `lod.test.ts`,
`datetime.test.ts`, `useTournamentQuery.test.tsx`, `mapper.test.ts`, `MatchDetailPanel.test.tsx`,
`d3-hierarchy.smoke.test.ts`, and all `server/**` tests stay GREEN unchanged — do not edit them.

### Behaviors to test (unit — node env unless noted)

**`computeGroupMatchLanes`** (`group-layout.test.ts`)

1. Emits a position for every `GROUP_STAGE` match (count == `matches.filter(stage==='GROUP_STAGE')`
   → 72 for the mock, derived not hardcoded).
2. Within each lane, matches ordered by ascending `kickoff` → x strictly increasing; all share one `y`.
3. Each group gets a **distinct** lane `y`; lane order follows `A..L`.
4. Table position at `x=0` at the lane's `y`; first match x == `TABLE_W + GROUP_GAP`.
5. Pure: structurally equal across calls; does not mutate a deep-frozen tournament.

**`computeBracketLayout` (vertical)** (`bracket-layout.test.ts`)

6. Positions every bracket node (32 including THIRD_PLACE).
7. KO `y` increases monotonically with stage depth (R32 minimal/top → FINAL maximal/bottom).
8. Each parent's `x` equals the midpoint of its two **structural** children's `x` (±ε), where children
   are resolved via `source.kind==='winnerOf'` → `source.matchId` in `slotIndex` order. THIRD_PLACE
   excluded (no winner children).
9. `THIRD_PLACE` adjacent to FINAL: same `y`, `x == finalX + LEAF_PITCH_X` after normalization.
10. Every node `x >= 0` (normalized) and every `y >= bandOffsetY`; pure + immutable; honors the
    `bandOffsetY` arg (calling with a different offset shifts all y by exactly the delta).

**`buildRoadmapGraph` (continuous)** (`build-graph.test.ts`, replaces the file wholesale)

11. Exactly one `match` node per `GROUP_STAGE` match (72) + one per bracket node (32) + one `group`
    node per group (12); no duplicate ids.
12. Exactly one `group` table node per group, at its lane start (x=0).
13. Group band occupies the top y-range; every KO node `y >= groupBandHeight + SECTION_GAP`.
14. **Handle contract (authoritative):** every advance + feeder edge has `sourceHandle:'b'` /
    `targetHandle:'t'`; no edge uses `sl/sr/tl/tr`.
15. Feeder edges connect each group to exactly the R32 matches it seeds (count derived from
    `R32_SEEDING`, same derivation as the old `full`-view test).
16. `MatchNodeData.group`/`matchday` populated from the domain match for group cards; `null` for KO
    nodes (incl. the bracket-node-without-match fallback).
17. Purity: equal output across calls; no mutation of a deep-frozen tournament.

**`MatchNode` (optional, jsdom — `MatchNode.test.tsx`, `// @vitest-environment jsdom`)**

18. A node with `group: 'A', matchday: 1` renders a "Group A · MD1" label and exactly one top target
    + one bottom source handle; a KO node (`group: null`) renders no group label. (DOM deps already
    installed; this reinforces #14/#16 at the component boundary.)

### E2E (Playwright smoke) — `e2e/per-match-orientation.spec.ts`

19. Load `/` → `.react-flow__node` visible → **ctrl+wheel** zoom (reuse the `ctrlWheel` helper from
    `e2e/wheel-zoom.spec.ts:50-67`; the canvas uses `panOnScroll`, so plain wheel pans, only ctrl+wheel
    zooms) → a group-stage match node (a `.react-flow__node` rendering a "Group · MD" label) **and** a
    Final node (`[data-final="true"]`) are both reachable in the DOM. Browsers may be unavailable in
    this environment — if so, document the gap (the spec is committed and runs in CI/local).

### Coverage

≥80% on the changed `src/features/roadmap/layout/**` + `src/features/roadmap/build-graph.ts` modules
(existing `coverage.include` scope). Run `npm run test` (all green), `npm run typecheck`, `npm run build`.

## Risks & Open Questions

- **Old layout/build-graph tests assert the deleted model — replaced wholesale, not patched.**
  `build-graph.test.ts` calls `buildRoadmapGraph(t,'groups'|'bracket'|'full')` and imports
  `computeGroupGrid`/`groupGridWidth` (both removed); `bracket-layout.test.ts` asserts mirrored x /
  `sr→tl` / `STEP`; `group-layout.test.ts` covers `computeGroupGrid`. Any leftover import of a deleted
  symbol breaks `tsc`. Rewrite the three files entirely.
- **`RoadmapView` → `RoadmapFocus` / drop `view` arg touches 6 source files together** (`graph-model`,
  `useStageView`, `StageToggle`, `RoadmapCanvas`, `useRoadmapGraph`, `build-graph`). Change in one pass
  or the build breaks.
- **Handle id rename detaches edges if half-done.** `MatchNode` ids (`t`/`b`), `handlesFor` output, and
  `GroupTableNode`'s handle must change in one pass; any mismatch silently drops edges. The build-graph
  handle-contract test (#14) catches a stale `handlesFor`; the jsdom/e2e tests catch a stale component.
- **`computeBracketLayout` signature ripple** `(bracket) → (bracket, bandOffsetY)` breaks the one-arg
  call in `build-graph.ts` and the two test call sites — all rewritten here, so the ripple is contained.
- **`computeGroupGrid`/`groupGridWidth` deletion is safe** — only referenced by `build-graph.ts`,
  `build-graph.test.ts`, and `groupsOnlyGraph` (itself removed). Grep confirms no other caller.
- **Keyboard traversal "spans group + KO" (requirement) vs. current binding.** `useBracketKeyboard`
  today binds only F/0/Esc — there is **no** node-to-node traversal to extend. We retune fit padding
  only and **document that cross-phase node traversal is net-new and out of this change set** (it would
  need its own focus-management + tests). Flag for reviewer: confirm this interpretation is acceptable
  or split traversal into a follow-up requirement.
- **Canvas grows wide and tall.** A lane of 6 matches + a 296px table is wide; the canvas is much
  taller (12 lanes + 5 KO stages). ~116 nodes (72+32+12) stays within the <300-node SVG/DOM budget.
  `fitView` padding tuned so the smoke + visual tests pass; `onlyRenderVisibleElements` already on.
- **Visual regression baselines.** `e2e/visual.spec.ts` screenshots all change; baselines must be
  regenerated (`npm run test:e2e:update`). Flag, don't auto-bless.
- **Browsers may be unavailable in this environment.** The Playwright smoke is committed but may not
  execute here; document the gap and rely on the deterministic unit tests for the contract.

### Open questions (non-blocking — sensible defaults chosen)

- Exact pitch constant values are tuning, not contract — tests assert ordering/monotonic/midpoint
  **relations**, not absolutes. Defaults in Data Model.
- Keep `?focus=` URL persistence (cheap, shareable, mirrors old `?view=`), default `'all'`.
- Group-card vs KO-card visual variant is a design nicety (a `data-group` attribute hook); minimal by
  default — anti-template polish can layer on without changing the contract.

## Acceptance Criteria

1. `buildRoadmapGraph(tournament)` emits exactly one `match` node per `GROUP_STAGE` match
   (== `matches.filter(m=>m.stage==='GROUP_STAGE').length`; 72 for the mock).
2. Within each group lane, match nodes are ordered by ascending `kickoff` with strictly increasing x;
   every node in a lane shares one y; each group has a distinct lane y in A..L order.
3. Exactly one `group` table node per group remains, at its lane start (x=0).
4. KO node y increases monotonically by stage depth (R32 minimal/top → FINAL maximal/bottom); each KO
   parent's x equals the midpoint of its two **structural** children's x (±ε), with children resolved
   via `source.kind==='winnerOf'` in `slotIndex` order; `THIRD_PLACE` is adjacent to the normalized
   Final x and excluded from the midpoint assertion.
5. Every advance and feeder edge uses `sourceHandle:'b'` (bottom of child) / `targetHandle:'t'` (top of
   parent); no `sl/sr/tl/tr` handle ids remain on `MatchNode` or `GroupTableNode`.
6. One continuous canvas: the group band occupies the top y-range and every KO node satisfies
   `y >= groupBandHeight + SECTION_GAP`; feeder edges connect each group to the R32 matches it seeds.
7. `MatchNodeData` includes `group`/`matchday`; group match cards render "Group A · MD1" (Tailwind on
   the component); `parseTournament`/schema unchanged.
8. The KO fan-in is computed with `d3-hierarchy`'s `d3.tree` (already installed; no `package.json`
   change), or the justified hand-rolled fallback preserving the `slotIndex` child ordering.
9. Layout helpers are pure and O(n); `buildRoadmapGraph` does not mutate a deep-frozen tournament and
   returns structurally-equal output across calls.
10. `StageToggle` no longer swaps layouts; it moves the camera to `all`/`groups`/`knockout`; the
    continuous canvas is the default and only layout, persisted via `?focus=`.
11. Playwright smoke passes (where browsers are available): after load and a ctrl+wheel zoom, a
    group-stage match node and a Final node (`[data-final="true"]`) are both reachable in the DOM.
12. `npm run test` (all green, including the rewritten layout + build-graph unit tests and the
    untouched domain/data/lod/server tests), `npm run typecheck`, and `npm run build` (vite) all pass,
    with ≥80% coverage on the changed `layout/**` + `build-graph.ts` modules.
