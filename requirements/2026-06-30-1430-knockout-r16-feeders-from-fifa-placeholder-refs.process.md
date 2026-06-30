# Requirement: Derive R16+ knockout feeders from FIFA PlaceHolder (W##) refs, not adjacent-pair topology

## Bug (real, live data — verified)
A Round-of-16 card renders the SAME team on both sides — "Paraguay vs Paraguay" (Philadelphia, 05 Jul 04:00).
Verified against the live WC2026 feed: FIFA did NOT send a duplicate (`Away.IdTeam` was null); OUR
`build-bracket` manufactured it from a WRONG feeder map.

## Root cause (confirmed against live FIFA data)
`src/domain/bracket/build-bracket.ts` derives the R16-and-up feeder edges from an **adjacent-pair assumption**:
R16 slot `k` is fed by R32 child nodes `childNodes[2k]` and `childNodes[2k+1]` (and likewise QF←R16, SF←QF).
But FIFA's REAL 2026 bracket interleaves the halves and encodes the true pairing in each KO fixture's
`PlaceHolderA`/`PlaceHolderB` ("W##" = winner of MatchNumber ##):

```
FIFA R16 match 89: PlaceHolderA="W74"  PlaceHolderB="W77"   → pairs winner(74) with winner(77)
FIFA R16 match 90: PlaceHolderA="W73"  PlaceHolderB="W75"   → pairs winner(73) with winner(75)
OUR build-bracket R16 slot 0 (match 89): home=winnerOf(73), away=winnerOf(74)   ← adjacent, WRONG
```

Walk-through of the duplicate (live): FIFA match 89 (`matchNumber 89 → our slot 0`) has `Home.IdTeam=Paraguay`
(RESOLVED — it is `W74`, and match 74 = Germany 1–1 Paraguay, Paraguay won) and `Away` = placeholder `W77`
(match 77 unplayed). In `build-bracket` r>=1:
- `homeTeam = match.home = Paraguay` (FIFA-resolved home).
- `awayTeam`: `match.away` unresolved → falls to `decidedTeam(bottomChild = childNodes[1] = match 74, 'winner')`
  = **Paraguay** (because our adjacency makes match 74 the bottom feeder of R16 slot 0).
→ both sides become Paraguay. The genuinely-unresolved side back-filled from a feeder that is the same team
already shown as home. With the CORRECT feeders (74 & 77), home=winner(74)=Paraguay and away=winner(77)=an
unplayed placeholder → "Paraguay vs Winner R32-…", no duplicate.

The FIFA mapper is faithful: `schema.ts` captures `PlaceHolderA`/`PlaceHolderB` (and `MatchNumber`), but
`mapper.ts` only uses PlaceHolder as a COSMETIC label and never parses the `W##` feeder reference into
structure — so `build-bracket` has nothing but adjacency to wire R16+ edges. (The R32 round is unaffected:
its sources are GROUP positions from `seeding.ts`, not match-winner refs.)

## Decision / approach
Make the KNOCKOUT feeder graph authoritative — drive R16-and-up feeders from FIFA's `PlaceHolder` `W##`/`L##`
references instead of the adjacent-pair assumption.

1. **Mapper** (`src/data/providers/fifa/mapper.ts`): parse `PlaceHolderA`/`PlaceHolderB` into STRUCTURED feeder
   refs and surface them on the domain `Match` — e.g. `feeders?: { home: KoFeederRef | null; away: KoFeederRef | null }`
   where `KoFeederRef = { kind: 'winnerOf' | 'loserOf'; matchNumber: number }`. Parse `"W74"→{winnerOf,74}`,
   `"L101"→{loserOf,101}`; for non-match placeholders (R32 group positions like `"1A"`, `"RU-B"`, `"3rd…"`)
   leave the ref null (R32 keeps its seeding-label sources). Keep cosmetic placeholder labels working as today.
2. **Domain `Match` type** (`src/domain/types/match.ts` + barrel if needed): add the OPTIONAL `feeders` field
   (FIFA-only; absent on mock/legacy). Optional so ZERO existing Match constructors change → change set stays
   disjoint from the concurrent team's WIP.
3. **build-bracket** (`src/domain/bracket/build-bracket.ts`): for r>=1 (and the third-place node), when the real
   fixture carries `feeders`, wire `home.source`/`away.source` and the team derivation to the child nodes
   identified by those refs (look up the prior-round node whose `matchNumber` equals the ref's `matchNumber`;
   since every node — real or synthetic — sits at slot `matchNumber − STAGE_FIRST_MATCH[stage]`, the lookup is
   `childNodes[refMatchNumber − STAGE_FIRST_MATCH[childStage]]`). Derive each side's team from ITS feeder
   (`decidedTeam(thatChild,'winner'|'loser')`), preferring the real fixture's own resolved team for that side
   when present and consistent. FALL BACK to the existing adjacent-pair wiring (`childNodes[2k]/[2k+1]`) when
   `feeders` is absent (mock/legacy) — so the deterministic mock bracket stays BYTE-IDENTICAL. Keep
   `buildBracket` PURE. This eliminates the duplicate, makes the advance dash-lines connect the real feeder
   matches, and also resolves the previously-flagged within-card "crossing" (the resolved team now sits on the
   side its feeder actually feeds).
4. **Do NOT** change the R32 seeding table, the `MatchNumber` slotting (positioning), `build-graph`/renderers,
   the mock, or any file in the team's WIP territory (`src/features/roadmap/**`, `src/components/**`).

## Acceptance criteria (testable)
- **No duplicate teams:** for every knockout `BracketNode`, `home.team` and `away.team` never resolve to the
  same team id. A regression test reproduces the live case (R32 matches 73 & 74 finished — 74 won by "Paraguay";
  R16 match 89 with `matchNumber 89`, `feeders {home: W74, away: W77}`, `home` resolved to Paraguay, `away`
  placeholder) and asserts the R16-slot-0 node = Paraguay vs an UNRESOLVED placeholder (NOT Paraguay), with
  `home.source = winnerOf(match 74)` and `away.source = winnerOf(match 77)`. RED before, GREEN after.
- **Feeders match FIFA:** every R16+ node's two sources reference the matches named in its `PlaceHolderA/B`
  (winnerOf/loserOf), not the adjacent pair. Assert for the 89=W74/W77 and 90=W73/W75 cases.
- **Mapper:** a test asserts `PlaceHolderA/B` parse to `{kind,matchNumber}` feeder refs (`"W74"→winnerOf 74`,
  `"L101"→loserOf 101`, group-position placeholders → null), surfaced onto `Match.feeders`.
- **Mock no-op:** `build-mock-tournament` + all existing bracket/graph/layout suites stay GREEN unchanged
  (mock sets no `feeders` → adjacency fallback → byte-identical bracket).
- **Set-membership invariant** (from the prior fix) still holds, now with the corrected feeders.
- `npm run typecheck` + `npm test` + `npm run build` + `npm run format:check` green.
- **Live-verify:** on the real feed, the Paraguay R16 card shows "Paraguay vs Winner R32-…" (no duplicate), and
  R16 pairings match FIFA's PlaceHolder refs; spot-check that no KO card shows the same team twice.

## Risks / things the planner MUST verify
- **Layout consumption:** confirm how `build-graph.ts` / the bracket layout builds the knockout tree — does it
  follow each node's `source` (winnerOf matchId) or independently assume slot adjacency? If it follows sources,
  the corrected feeders give a correct tree automatically (possibly with more visual crossing — a SEPARATE
  layout-polish follow-up, out of scope). If the layout independently assumes adjacency, flag it; any needed
  change must stay OUT of the team's radial files (`src/features/roadmap/layout/**` is shared — if a change is
  unavoidable there, surface it for coordination rather than silently editing the team's WIP territory).
- Feeder-ref lookups for matches that don't exist yet → the prior-round node is synthetic at the implied slot;
  the lookup by `matchNumber − base` still resolves to that synthetic node (placeholder propagates). Confirm.
- `STAGE_FIRST_MATCH` base for each child stage (R32=73, R16=89, QF=97, SF=101) drives the ref→slot lookup.
- Mixed/edge cases: a fixture with only one feeder ref, refs pointing across stages, third-place `L101/L102`.

## Out of scope
- Re-positioning the bracket LAYOUT so non-adjacent feeders draw without crossing (a graph/layout follow-up,
  and the team is concurrently in that area).
- Any R32 seeding-table change; any `build-graph`/renderer/radial change beyond what's strictly required and
  disjoint; the mock.

## Files (indicative)
- `src/data/providers/fifa/mapper.ts` (+`mapper.test.ts`), verify `schema.ts` PlaceHolder fields → **wc-data-engineer**
- `src/domain/types/match.ts` (+barrel) — optional `feeders` → **wc-domain-engineer**
- `src/domain/bracket/build-bracket.ts` (+`build-bracket.test.ts`) — feeder-ref wiring + adjacency fallback → **wc-domain** + **wc-test**

## Notes
Builds directly on the prior fixes (official R32 seeding `f977b0a`; MatchNumber slotting `c9ae0bb`). Runs in an
isolated worktree branched from current main because the team is concurrently building
`1416-radial-winner-nodes-and-match-scores`; the optional `feeders` field keeps the change disjoint from their
WIP for a clean rebase/merge. Owner: **wc-domain-engineer** + **wc-data-engineer**.
