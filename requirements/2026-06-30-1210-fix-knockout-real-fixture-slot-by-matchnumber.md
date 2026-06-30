# Requirement: Fix knockout feeder mismatch — slot real KO fixtures by FIFA MatchNumber, not kickoff time

## Bug (real, live data)
On the knockout bracket with the REAL, partially-played FIFA World Cup 2026 feed, a resolved team is rendered
in a Round-of-16 card whose incoming advance dash-lines feed from the WRONG Round-of-32 matches. Concretely:
Brazil (group-C winner = seeding `1C`, R32 slot 3 = `1C vs 2F`, beat Japan) is shown in an R16 card whose other
side is the placeholder "Winner R32-8" and whose two advance edges originate from R32 slots 6 & 7 — matches
Brazil never played. "Brazil is not going to this match." (User screenshot, 2026-06-30.)

This does NOT reproduce in the deterministic mock (it fully resolves every KO round in slot order); it needs the
real, partially-resolved feed.

## Root cause (confirmed by reproduction + 3 independent investigations — high confidence)
`src/domain/bracket/build-bracket.ts` assigns real knockout fixtures to bracket slots by **kickoff time**:
`sortKoMatches` (line ~62, sorts by kickoff then id) → dense-pack `const match = real[slot]` (line ~75). But the
**advance edges and seeding labels are topological**: for r==0 the sources come from `R32_SEEDING[slot]`
(lines ~84-85); for r>=1 `homeSource/awaySource = winnerOf(childNodes[slot*2]/[slot*2+1])` (lines ~89-92). The
**displayed team** for r>=1 is then read from the real fixture's OWN resolved `match.home/away` (lines ~97-106).
So when FIFA's R16 kickoff order ≠ the bracket slot order, the kickoff-sort drops a resolved fixture into a slot
whose two R32 feeders are a different pair than where that team actually came from — the displayed team and the
advance edges decouple.

- This is a **pre-existing latent bug** in build-bracket's real-fixture→slot mapping, **NOT introduced** by the
  official-seeding fix (commit `f977b0a`); the seeding only defines the topological slot ORDER the edges follow.
- It is **NOT** in the FIFA mapper's faithfulness, nor in `build-graph.ts`/renderers — those transcribe
  `tournament.bracket` verbatim (confirmed). The fix belongs UPSTREAM, in build-bracket (+ a tiny mapper/type add).
- The class is general to every KO round; R16 just exposes it first via the resolved-team / source split. R32
  cards would mislabel too if FIFA's R32 kickoff order ever diverged from slot order.

## The authoritative slot key already exists — and is being thrown away
The FIFA payload carries **`MatchNumber`** (official fixture number: R32 = 73–88 → slots 0–15; R16 = 89–96; QF =
97–100; SF = 101–102; 3rd = 103; Final = 104) and **`PlaceHolderA/PlaceHolderB`** feeder refs (e.g. `W49`/`W50`).
`src/data/providers/fifa/schema.ts` captures `MatchNumber` (line ~30) and PlaceHolderA/B (lines ~45-46), but
`src/data/providers/fifa/mapper.ts` (lines ~124-144) **drops `MatchNumber` entirely** and uses PlaceHolderA/B
only as a cosmetic placeholder label. The domain `Match` type has no bracket-position field, so build-bracket has
nothing to slot by except kickoff.

## Decision / approach
Make the displayed team and the advance edges share ONE source of truth — FIFA's own bracket numbering.

1. **Domain type** (`src/domain/types/match.ts` + the `index.ts` barrel if it re-exports the shape): add an
   **OPTIONAL** field `readonly matchNumber?: number | null`. It MUST be optional so that **zero existing `Match`
   constructors/fixtures need changing** — this keeps the change set disjoint from the concurrent build team's
   uncommitted radial WIP (which already modifies `roadmap-fixtures.ts`, `graph-model.ts`, `team-focus.ts`, etc.).
   Only the FIFA mapper sets it; only build-bracket reads it.
2. **Mapper** (`src/data/providers/fifa/mapper.ts`): populate `matchNumber: raw.MatchNumber ?? null` on every
   mapped `Match` (the value is already validated in `schema.ts` — confirm; surface it, do not re-validate).
3. **build-bracket** (`src/domain/bracket/build-bracket.ts`): when a stage's real fixtures carry `matchNumber`,
   place each fixture at its TRUE slot `matchNumber − STAGE_FIRST_MATCH[stage]` (NOT dense kickoff-packing), so
   absent fixtures keep their synthetic placeholder slot. Apply uniformly to all KO rounds (R32 → SF, third place,
   final). Fall back to the existing kickoff-sort dense-pack ONLY when `matchNumber` is absent (mock/legacy) — this
   guarantees a **no-op for the mock** (already in slot order) and complete brackets. Guard the computed slot to
   `[0, stageCount)`; if out of range, fall back defensively. Keep build-bracket **pure** (never mutate inputs).
4. **STAGE_FIRST_MATCH** constant (put near `stage-order.ts`): `{ ROUND_OF_32: 73, ROUND_OF_16: 89,
   QUARTER_FINALS: 97, SEMI_FINALS: 101, THIRD_PLACE: 103, FINAL: 104 }`, documented as the official WC2026
   schedule (cross-ref `seeding.ts`, which already documents "Matches 73–88 → R32 slots 0–15").

The planner MAY instead drive slotting from the parsed `PlaceHolderA/B` feeder refs if it proves cleaner/more
robust than `matchNumber` − base; either way the invariant below must hold. Prefer the simplest change that holds it.

## Acceptance criteria (testable)
- **Regression (the bug):** a new build-bracket unit test reproduces the exact scenario — full real R32 seeded per
  the official table (mixed finished/scheduled) + a real R16 fixture whose kickoff is EARLIER than its slot order,
  with a resolved home team that is the winner of a NON-adjacent R32 slot. Assert: the R16 bracket node that
  displays that team has `home.source`/`away.source = winnerOf` the team's ACTUAL R32 match and its sibling (i.e.
  the displayed team's real R32 is one of the node's two source feeders), and that kickoff order no longer
  determines the slot. This test MUST be RED before the fix and GREEN after.
- **Invariant:** for every knockout `BracketNode`, the displayed `home/away.team` (when resolved) is consistent
  with the `winnerOf` lineage of `home/away.source` — the team in a slot is always reachable from that slot's
  advance edges. Add an assertion expressing this over a real-shaped fixture.
- **Mapper:** a test asserts `matchNumber` is surfaced onto the domain `Match` from `raw.MatchNumber` (and is
  `null` when absent).
- **Mock no-op:** `build-mock-tournament` and all existing bracket/graph tests stay GREEN with no fixture changes
  (the mock sets no `matchNumber` → fallback path → byte-identical bracket).
- `npm run typecheck` + `npm test` (≥969 passing) + `npm run build` + `npm run format:check` all green.
- **Do NOT change** `build-graph.ts`, the canvas/renderers, the seeding table, or any file in the team's WIP set.
- Live-verify: best-effort. The mock cannot show this (fully resolved, slot-ordered); proving it needs the real
  feed or a crafted partial bracket. SKIPPED is acceptable if no deterministic offline UI surface exists — the
  regression unit test is the authoritative proof.

## Out of scope
- Parsing/using `PlaceHolderA/B` feeder refs for anything beyond (optionally) slotting — no feeder-graph rebuild.
- Deriving the displayed team purely from resolved children (correct slotting already aligns team and edges).
- Any `build-graph`/renderer/radial-view change; any seeding-table change.
- Adding `matchNumber` to the mock (the mock is already correct via the fallback).

## Files (indicative)
- `src/domain/types/match.ts` (+ `index.ts` barrel) — optional `matchNumber` → **wc-domain-engineer**
- `src/data/providers/fifa/mapper.ts` (+ `mapper.test.ts`), verify `schema.ts` — surface `MatchNumber` → **wc-data-engineer**
- `src/domain/bracket/build-bracket.ts` (+ `build-bracket.test.ts`), `stage-order.ts` — slot-by-matchNumber → **wc-domain-engineer** + **wc-test-engineer**

## Notes
Owner: **wc-domain-engineer** (the build-bracket slotting) + **wc-data-engineer** (surface MatchNumber). Runs in an
isolated worktree branched from the seeding fix (`9ae4df1`) because the build team is concurrently building the
radial view; the optional-field design keeps every changed file disjoint from their uncommitted WIP for a clean
fast-forward merge.
