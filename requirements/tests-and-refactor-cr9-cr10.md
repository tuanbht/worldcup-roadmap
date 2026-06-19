# Requirement: Test coverage + mapper refactor — CR-9, CR-10

Source: `requirements/change-request-2026-06-19.md`. Two behavior-PRESERVING
items: add missing test coverage (CR-10) and split an oversized module (CR-9).
No user-facing behavior changes; the existing suites are the safety net.

> TDD note for this requirement: CR-10's new tests assert the CURRENT, correct
> behavior of already-shipped branches (coverage, not bug-fixing) — they are
> expected to pass once written. CR-9 is a pure extraction guarded by the
> existing + new mapper tests, which must stay green before and after. So "RED"
> here means "a genuinely new assertion that did not exist", and the gate is
> "behavior is provably unchanged and the suite stays green", not "a failing
> test drove new production behavior".

---

## CR-10 — Add tests on reachable, documented branches
Two branches are reachable and documented but untested:

- `src/data/cache/tournament-cache.ts` (~lines 35-37): the **stale-on-error**
  path — when a refresh throws but a stale cached value exists, the cache serves
  the stale value instead of propagating the error. Add a test that primes the
  cache, makes the next refresh throw, and asserts the stale value is returned
  (and that with NO cached value the error propagates).
- `src/features/roadmap/hooks/useFocusCamera.ts` (~lines 52-69): the camera/
  bounds helpers `boundsOf`, `isGroupZoneNode`, `isKnockoutNode`. Unit-test them
  directly (export if needed): `boundsOf` over a set of nodes returns the correct
  min/max envelope; the node-type predicates classify group-zone vs knockout
  nodes correctly (incl. empty/edge inputs).

### Acceptance
1. A `tournament-cache` test exercises stale-on-error: stale value served when a
   refresh throws AND a stale entry exists; error propagates when none exists.
2. `boundsOf` / `isGroupZoneNode` / `isKnockoutNode` have direct unit tests
   covering normal + edge inputs.
3. New tests pass against the CURRENT implementation (coverage of existing
   correct behavior); no production behavior changes for CR-10. If any test
   reveals a real defect, fix it minimally and note it.

---

## CR-9 — Split the oversized match-detail mapper
`src/data/providers/fifa/match-detail-mapper.ts` is ~429 lines (over the 400-line
soft target) and `mapFifaMatchDetail` (~lines 375-429) exceeds the 50-line
function guidance.

### Fix
Extract the stats / win-probability block and the enrichment block into
single-responsibility helper functions (same file or a sibling module under the
same folder, e.g. `match-detail-mapper.stats.ts`). `mapFifaMatchDetail` becomes a
thin orchestrator that composes the helpers. **Behavior must be byte-for-byte
identical** — the existing mapper tests (and the real-payload fixtures under
`docs/fifa-real-payloads/` if used) must stay green unchanged.

### Acceptance
4. `mapFifaMatchDetail` is under ~50 lines and reads as a composition of named
   helpers; the file is at/under the 400-line target (or clearly split into
   focused modules).
5. Every extracted helper is pure and single-responsibility; immutability
   preserved (no mutation introduced).
6. The existing match-detail mapper test suite passes UNCHANGED (behavior
   identical); a snapshot/round-trip over a real fixture confirms identical
   output before/after.

---

## Constraints (whole requirement)
- Pure refactor + test addition; no dependency changes, no API changes.
- Immutability + small focused functions per the coding-style rules.
- All gates green and deterministic: `npm run test`, `npm run typecheck`,
  `npm run build`, `npx prettier --check` on touched files.

## Files likely touched
- `src/data/cache/tournament-cache.test.ts` (new/extended) — CR-10
- `src/features/roadmap/hooks/useFocusCamera.ts` (maybe export helpers) +
  a new unit test — CR-10
- `src/data/providers/fifa/match-detail-mapper.ts` (+ a new sibling helper
  module) and its existing test — CR-9
