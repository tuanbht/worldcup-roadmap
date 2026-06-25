# Requirement: Fix the standings e2e opener so the compact snapshots regenerate

## Context

`2026-06-24-1031-compact-standings-header-density-320` shipped (commit `b75cc03`) but left **AC #11 open**:
the two COMPACT visual snapshots `standings-open-320` / `standings-open-375` were **not** regenerated. The
`mobile standings overlay layout` → `standings overlay fits at {320,375,768}px` block in
`e2e/visual.spec.ts` fails at its **SETUP step**: `getByRole('button', { name: 'Open Group A standings' })`
(the opener rendered on the always-on `group-standings` node — `GroupTableNode.tsx:111`) **never becomes
visible / in-viewport in headless Chromium** at the test's first-load camera. The deterministic-trigger
comment at `e2e/visual.spec.ts:347` assumes the top-aligned first-load frame surfaces the Group A opener,
but it does **not** in headless — so `await opener.click()` (`:352`) never fires, the dialog never opens,
and the screenshot / overflow / vertical-fit assertions cannot run. This blocks the **entire** standings
e2e block at all three widths.

Crucially, this is **not** a fundamental headless limitation: the `1031` live-verifier DID open the
`StandingsOverlay` headless (it screenshotted the centered dialog at 320px) using its own approach. So the
overlay is openable — only the e2e test's "rely on first-load framing to surface the opener" approach is
broken.

## Bug

At the test camera, the `Open Group A standings` button is off-screen / not hittable in headless Chromium,
so the opener `click()` never happens → no dialog → the `standings-open-*` snapshots are stale (still at
commit `22a9436`, pre-1031), and the in-viewport / no-overflow / 320×720 vertical-fit assertions are inert.

## Want

The `standings overlay fits` e2e block runs **green** in headless Chromium at 320 / 375 / 768 by
deterministically opening the Group A standings overlay, so the compact `standings-open-320` and
`standings-open-375` snapshots **regenerate** (closing 1031 AC #11) and the in-viewport / no-overflow /
vertical-fit assertions actually execute.

## Decision

- **Make the opener deterministically reachable before clicking.** Bring the Group A `group-standings`
  opener into view via a reliable, deterministic mechanism rather than relying on first-load framing —
  e.g. an explicit camera frame / `fitView` to the Group A standings region, `scrollIntoViewIfNeeded()` /
  computed-position click on the opener element, or a deterministic open path mirroring what the 1031
  live-verifier did. No fixed timeouts; keep the existing hardening (stable in-viewport trigger, masked
  dynamic `img`, settled transform).
- **Prefer a test-only fix.** This is e2e-infra + snapshot work; do **not** change app behavior. If a tiny
  non-test affordance is genuinely required to make the opener deterministically reachable (e.g. a stable
  `data-` hook or an a11y-neutral focus path), keep it minimal and justify it; the default expectation is
  zero production-code change.
- **Regenerate ONLY the compact snapshots.** `standings-open-320` + `standings-open-375` via
  `npm run test:e2e:update`. The byte-identity snapshots `standings-open-768`, `roadmap-1024`,
  `roadmap-1440` **must NOT change** — if any diffs, STOP and fix (it's a leak, not a refresh).

## Acceptance criteria (testable)

- `npx playwright test e2e/visual.spec.ts -g "standings overlay fits"` passes at **320 / 375 / 768** in
  headless Chromium: the Group A standings dialog opens, the close button + dialog are in viewport, no
  horizontal overflow (`scrollWidth ≤ clientWidth + 1`), and the 320×720 vertical-fit assertion runs.
- The compact `standings-open-320` and `standings-open-375` snapshots are regenerated to reflect the
  shipped 1031 compact density; the diff is reviewed and reflects **only** the tuned density (upper-cased
  `PTS/TEAM` labels are unchanged — not a regression).
- `standings-open-768`, `roadmap-1024`, `roadmap-1440` remain **byte-identical** (no diff).
- `npm run typecheck` + `npm test` + `npm run build` + `npm run format:check` green. No production app
  behavior change (or a minimal, justified affordance only).

## Files (indicative)

- `e2e/visual.spec.ts` — the `mobile standings overlay layout` block opener (deterministic open) →
  **wc-test-engineer**
- `e2e/visual.spec.ts-snapshots/standings-open-320-*.png`, `standings-open-375-*.png` (regenerated)
- optionally a small deterministic test helper for opening the standings overlay

## Notes

Closes the single open caveat from requirement 1031 (the standings density visual baseline). Owner:
**wc-test-engineer** (e2e infra + snapshot refresh); **wc-graph-engineer** only if a deterministic
camera/focus affordance is the chosen open mechanism.
