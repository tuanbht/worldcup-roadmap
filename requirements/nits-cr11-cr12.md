# Requirement: Defensive nits — CR-11 image-URL guard, CR-12 renormalize all-zero

Source: `requirements/change-request-2026-06-19.md` (OPTIONAL/LOW). Two small,
independent defensive fixes.

---

## CR-11 — Validate `PictureUrl` before it becomes an `<img src>`
`src/data/providers/fifa/match-detail-schema.ts` (~line 20) accepts the FIFA
`PictureUrl` unvalidated; it flows into `<img src>`. Add a `https:`-only (or
root-relative) URL guard as defense-in-depth and to avoid mixed-content.

### Fix
At the schema boundary, accept the URL only when it is `https:` or a relative
URL; otherwise degrade it to `null` (do NOT throw the whole payload — keep the
existing tolerant-but-validating posture). Reject `http:`, `javascript:`,
`data:`, and other non-https absolute schemes. Apply consistently to every
photo/flag URL field the schema exposes.

### Acceptance
1. A valid `https://…` URL passes through unchanged.
2. A relative URL (e.g. `/players/10.png`) passes through.
3. `http://…`, `javascript:…`, `data:…`, and other non-https absolute URLs
   degrade to `null` (not thrown).
4. The rest of the payload still parses (tolerant boundary preserved); tests
   cover #1–#3.

---

## CR-12 — `renormalize(0,0,0)` must return the neutral split
`src/data/providers/fifa/win-probability.ts` — `renormalize` (or the equivalent
normalizer) divides by the sum, so an all-zero input produces a non-neutral /
NaN result instead of a sensible neutral distribution.

### Fix
Add an all-zero (sum ≤ 0 / non-finite) guard that returns the neutral split
(the same neutral distribution the module already uses for "no signal" — e.g.
equal probabilities, or the project's defined neutral home/draw/away split).
Non-zero inputs are unchanged.

### Acceptance
5. `renormalize(0, 0, 0)` returns the neutral split (finite, sums to 1, no NaN).
6. Existing non-zero normalization behavior is unchanged; tests cover the
   all-zero guard plus a representative non-zero case.

---

## Constraints (whole requirement)
- Library-first; reuse the existing schema (zod) + module conventions. No new
  dependencies.
- Immutability + explicit boundary handling per the coding-style rules.
- All gates green and deterministic: `npm run test`, `npm run typecheck`,
  `npm run build`, `npx prettier --check` on touched files.

## Files likely touched
- `src/data/providers/fifa/match-detail-schema.ts` (+ test) — CR-11
- `src/data/providers/fifa/win-probability.ts` (+ test) — CR-12
