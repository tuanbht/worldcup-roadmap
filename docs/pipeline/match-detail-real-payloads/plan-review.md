# Plan Review — match-detail real payloads (revision #2)

## Summary

The plan is strong, specific, and—critically—its claims hold up against the captured
ground-truth payloads and the current source. I independently re-verified every
"verified divergence" against `docs/fifa-real-payloads/{timeline,live}.sample.json`
and the live code (`match-detail-schema.ts`, `match-detail-mapper.ts`,
`formation-layout.ts`, `match-detail-client.ts`, the domain types, and the panel
tabs). The four substantive bugs the plan calls out are all real and currently
present:

- **positionIndex bug** — `formation-layout.ts:64` sorts by `positionIndex`, the mapper
  sets `positionIndex = ShirtNumber` (`match-detail-mapper.ts:136`), and the schema even
  mistypes `Position` as `z.string()` (`match-detail-schema.ts:22`) while the real payload
  carries numeric `Position` 0–3. Confirmed.
- **Goal `Type:2` bug** — both legit Mexico goals carry `Type:2` in `HomeTeam.Goals`, and
  `buildEnrichment` (`match-detail-mapper.ts:92`) currently `continue`s on `Type===2`, so it
  would drop both scorers. Confirmed.
- **Event names absent** — real timeline events have no `PlayerName`; the mapper reads
  `raw.PlayerName` at lines 244 and 288, so every event name and the `scorerName` map are
  null today. Confirmed.
- **Wrong coach** — `HomeTeam.Coaches[0]` is Role:1 (Rafael MARQUEZ); the mapper reads
  `Coaches?.[0]?.Name` (`match-detail-mapper.ts:159`). Confirmed.

Possession is genuinely `null` for both `BallPossession` and `TerritorialPossesion`;
the `IdAssistPlayer` fields in `Goals[]` are `null`; the timeline-substitution
`IdPlayer`=ON / `IdSubPlayer`=OFF convention is confirmed; and the panel consumes
only domain fields (`event.relatedName`, `lineup.coach`, `positionIndex`), so the
"data-layer only, domain types byte-identical" constraint is satisfiable.

The plan satisfies the requirement, the architecture is sound (pure mapper, lenient
zod boundary, stable domain types), it reuses the existing layered design rather
than reinventing, and the test strategy is concrete and genuinely testable. No
CRITICAL or HIGH issues. A handful of MEDIUM/LOW items below should be tightened to
remove ambiguity for the implementer, but none block.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM

**M1 — Make assist→goal pairing run on raw array order, and make the final event sort stable.**
`parseMinute` collapses stoppage time (`"45'+2'"`→45, `"90'+2'"`→90), which the plan accepts.
But the mapped events are `.sort((a,b) => a.minute - b.minute)` with no tiebreak, and many real
events share a parsed minute (minute 76 has 4 subs; minute 67 has Assist + Goal). The
adjacency-based assist pairing (mapper rule 3) and AC #7 (assist 9'→Quiñones, 67'→RAÚL) only
hold if pairing runs over the **raw `Event[]` in original array order, BEFORE** the minute sort.
Pin this explicitly, and give the final `events` sort a deterministic secondary key (e.g.
original array index) so co-minute events keep a stable order. The plan hints at it but the
"events sorted by minute ascending" AC and the pairing step must be reconciled so the
implementer cannot sort-then-pair.

**M2 — Document one name-source convention per surface (event/related vs. lineup card).**
Mapper rule 1 builds `lineupName` as `pickLocale(ShortName) ?? pickLocale(PlayerName)` → "RAÚL"
for 356731 (matches AC #7). But `mapPlayer` (`match-detail-mapper.ts:127`) builds the lineup card
`name` as `PlayerName ?? ShortName` → "Raul JIMENEZ", and the plan leaves that untouched. The same
player therefore renders "Raul JIMENEZ" on the lineup card and "RAÚL" in the timeline. That may be
intentional, but the plan should state it (events/relatedName use ShortName; lineup-card names use
full PlayerName) so implementation reviewers can tell intended from accidental.

**M3 — Turn the GK-first intent (AC #10) into a concrete assertion.**
`positionIndex = (Position ?? 9)*100 + ShirtNumber` depends on `Position` being a number (the plan's
schema snippet fixes the current `z.string()`). AC #10 is phrased loosely ("places the goalkeeper on
the own goal line"). Pin a concrete assertion: the first element of `home.starters` sorted by
`positionIndex` is the Position-0 keeper (Raul RANGEL #1 / WILLIAMS #1). Without it the RED test will
not catch a regression to `positionIndex = ShirtNumber`.

### LOW

**L1 — Do not assert intra-line left/right slots.** `LineupX/LineupY` are `null`; within-line order
falls back to shirt number and is an approximation. Only assert GK-first, never a specific outfield
slot, to avoid a brittle test.

**L2 — Top-level nulls (`IsUpdateable:null`, `CoverageLevel:null`, `Properties:{}`, etc.).**
`.passthrough()` accepts these because they are undeclared. No action needed; noted only so the
implementer does not declare them and accidentally make one non-nullable.

**L3 — Confirm `mapper.test.ts` is out of scope.** Two mapper test files exist (`mapper.test.ts` and
`match-detail-mapper.test.ts`). The plan only rewrites the latter. Confirm `mapper.test.ts` is the
unrelated list/standings mapper so the rewrite doesn't miss a second file importing the old fixtures.

**L4 — Coach `Alias` must be added to the schema.** Plan picks `pickLocale(Alias) ?? pickLocale(Name)`
→ "Javier AGUIRRE". Confirmed sensible, but the *current* `rawCoach` declares only `Name`
(`match-detail-schema.ts:64`); the plan snippet adds `Alias`. Ensure that add lands or the Alias read
silently returns null and falls back to the full Name.

## Coverage / non-functionals

- Coverage target (≥80% line/branch on the four data-layer files) is stated; the combination of
  real-payload mapper test + integration test + null/partial degradation tests + synthetic
  own-goal/penalty label tests is adequate.
- Security/secrets: none touched; tests use captured fixtures, no live FIFA. Good.
- Graceful degradation: lenient-accept schema + null-degrading mapper + `fetchSection` swallow-to-null
  preserved; `(null,null)` and `(live,null)` AC cases retained. Good.
- No `console.log`; immutability preserved. Good.

## Verdict

APPROVED — no CRITICAL/HIGH issues. The MEDIUM items (M1 ordering/pairing determinism, M2 name-source
convention, M3 concrete GK-first assertion) should be folded into the implementation as written above,
but they refine an already-correct plan rather than block it.
