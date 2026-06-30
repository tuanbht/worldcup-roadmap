# Requirement: Fix the knockout bracket — use the OFFICIAL WC 2026 Round-of-32 seeding

## Bug
The knockout stage shows the **wrong matches** (and therefore the wrong placeholder teams /
feeder lines). `src/domain/bracket/seeding.ts` `R32_SEEDING` is an **admitted made-up "well-formed
template"** (its own comment says "FIFA's official pairing … differs in detail") — it is NOT the real
FIFA World Cup 2026 bracket. It is also **structurally wrong** for the 48-team format:

- Current `R32_SEEDING` has **8** winner-vs-runner-up matches, **4** runner-up-vs-3rd matches, and **4**
  winner-vs-3rd matches — with NO runner-up-vs-runner-up matches.
- The OFFICIAL format is **4** winner-vs-runner-up + **8** winner-vs-3rd + **4** runner-up-vs-runner-up.

Because `R32_SEEDING` drives (a) the placeholder source labels on every R32 card (`1A`, `2B`, …), (b)
the feeder edges in `build-graph.ts`, (c) the offline mock fixture, and (d) the `team-focus` edge-id
reconstruction, the displayed Round-of-32 matchups are simply not the real tournament's.

## The correct bracket (verified)
Official 2026 FIFA World Cup Round-of-32, Matches 73–88 → R32 slots 0–15 (home = first listed). Source:
Wikipedia "2026 FIFA World Cup knockout stage". Cross-checked against live results reported in press
(Brazil = 1C, Japan = 2F → `1C vs 2F`; Netherlands = 1F, Morocco = 2C → `1F vs 2C` — the C↔F mirror; and
Germany = 1E plays a 3rd-place team, Paraguay = 3rd-D, in the `1E vs 3rd` match), which match this table.

| Slot | Match | Home | Away |
|------|-------|------|------|
| 0  | 73 | `2A` | `2B` |
| 1  | 74 | `1E` | `3rd` (from A/B/C/D/F) |
| 2  | 75 | `1F` | `2C` |
| 3  | 76 | `1C` | `2F` |
| 4  | 77 | `1I` | `3rd` (C/D/F/G/H) |
| 5  | 78 | `2E` | `2I` |
| 6  | 79 | `1A` | `3rd` (C/E/F/H/I) |
| 7  | 80 | `1L` | `3rd` (E/H/I/J/K) |
| 8  | 81 | `1D` | `3rd` (B/E/F/I/J) |
| 9  | 82 | `1G` | `3rd` (A/E/H/I/J) |
| 10 | 83 | `2K` | `2L` |
| 11 | 84 | `1H` | `2J` |
| 12 | 85 | `1B` | `3rd` (E/F/G/I/J) |
| 13 | 86 | `1J` | `2H` |
| 14 | 87 | `1K` | `3rd` (D/E/I/J/L) |
| 15 | 88 | `2D` | `2G` |

**Validity invariants (must hold):** all 12 group winners `1A..1L` used exactly once; all 12
runners-up `2A..2L` used exactly once; exactly 8 third-place slots; 4 (1v2) + 8 (1v3rd) + 4 (2v2) = 16.
The R16 progression is UNCHANGED and already correct in `build-bracket.ts` (slots `i`,`i+1` → R16
`floor(i/2)`): 73&74→R16-1, 75&76→R16-2, … 87&88→R16-8.

## Decision
- **Replace `R32_SEEDING`** with the table above (exact home/away order). Rewrite its doc comment: it is
  now the **official** FIFA WC 2026 bracket (cite the source), not a placeholder template — keep noting
  that the concrete third-place *teams* still come from the API / the mock's best-thirds, and that the
  R16+ topology is derived in `build-bracket.ts`.
- **Third-place slots:** keep the placeholder source token as `'3rd'` (generic) by default so the existing
  `SlotSource`/placeholder machinery is unchanged. OPTIONAL (if clean and low-risk): enrich the 8 `'3rd'`
  placeholders with their official possible-group set (e.g. `3rd C/D/F/G/H`) purely as a label — do NOT
  encode the full 495-combination allocation table; that is out of scope.
- **Do NOT change** the bracket topology / progression logic in `build-bracket.ts` (R16→Final + 3rd place)
  — it is correct; only the seeding template feeding round 0 is wrong.
- **Update every dependent test/fixture** that asserts the old pairings to the official ones — at minimum
  `src/domain/bracket/build-bracket.test.ts` (e.g. `:106` slot-0 source is now `2A`/`2B`), plus any
  `build-graph` feeder-edge tests, `team-focus` edge-id tests, the mock fixture
  (`src/data/providers/mock/build-mock-tournament.ts`) and `roadmap-fixtures.ts` that depend on
  `R32_SEEDING`. Re-pin (do not weaken) them to the new, correct seeding.

## Acceptance criteria (testable)
- `R32_SEEDING` equals the official table above (order + home/away exact); a unit test asserts the
  validity invariants (each `1X`/`2X` used once; 8 thirds; 4/8/4 split) so a future wrong edit fails loudly.
- The derived Round-of-32 bracket shows the official matchups: slot 0 = `2A vs 2B`, slot 2 = `1F vs 2C`,
  slot 3 = `1C vs 2F`, slot 11 = `1H vs 2J`, slot 13 = `1J vs 2H`, the four `2X vs 2Y` matches
  (slots 0,5,10,15), and the eight `1X vs 3rd` matches in their correct slots.
- Feeder edges (`build-graph.ts`) and `team-focus` edge ids recompute correctly from the new seeding (no
  orphaned/duplicated feeders; one feeder per real (group, seeded-R32) pair).
- The offline mock tournament still assembles a valid 48-team bracket (12 winners + 12 runners-up + 8
  thirds → 16 R32) with the new seeding; `roadmap-fixtures.ts` derived expectations updated.
- `npm run typecheck` + `npm test` + `npm run build` green; visual/e2e suite stays deterministic.
- Live-verify: on the canvas the Round-of-32 cards render the official source labels (the 4 runner-vs-
  runner, 8 winner-vs-3rd, 4 winner-vs-runner matches in the right slots) and the feeder lines connect the
  right groups.

## Files (indicative)
- `src/domain/bracket/seeding.ts` (the `R32_SEEDING` table + comment), `src/domain/bracket/seeding.test.ts`
  (new validity test) → **wc-domain-engineer**
- `src/domain/bracket/build-bracket.test.ts` (re-pin R32 source assertions) → wc-domain + **wc-test-engineer**
- `src/features/roadmap/build-graph.ts` tests + `team-focus` tests (feeder/edge ids) → wc-graph + wc-test
- `src/data/providers/mock/build-mock-tournament.ts` + tests, `src/features/roadmap/__test-support__/roadmap-fixtures.ts` (re-pin) → wc-data + wc-test

## Notes
The R16-and-up bracket math is already correct; this is purely the round-0 seeding template being a
made-up placeholder instead of the real FIFA bracket. Owner: **wc-domain-engineer** (the seeding/bracket
domain) + **wc-test-engineer** (re-pin the dependent fixtures/tests).
