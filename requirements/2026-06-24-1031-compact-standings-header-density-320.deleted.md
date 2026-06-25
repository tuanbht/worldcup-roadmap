# Requirement: Polish compact standings header density at 320px

## Context

`2026-06-23-1336-mobile-friendly-small-screens` introduced the compact mobile standings column set
(`# / Team / MP / GD / Pts`, via `pickStandingsColumns('compact')` in `src/features/roadmap/responsive.ts`) and
a viewport-bounded `StandingsOverlay`. It works and fits 320px with no overflow, but the 1336 live-verify flagged
the **`MP` header / numeric columns as tight** at 320px — a LOW visual-polish item deferred from that run.

## Want

At 320px the compact standings header and rows read comfortably — no cramped/overlapping headers, no truncated
labels, no horizontal overflow. This is **density/typography tuning only**, not a structural change: adjust
cell padding, font-size (via the existing `clamp()`/Tailwind token scale), header label treatment, and column
width distribution so `# / Team / MP / GD / Pts` sit cleanly. Team name may ellipsis-truncate gracefully if
needed; the numeric columns must stay fully legible.

## Decision

- Tune the **compact** path only (mobile / `max-[640px]`). The full desktop table (≥1024) and the full column
  set stay **byte-identical**.
- One styling system: Tailwind v4 utilities + the oklch tokens already in `src/styles/global.css`. No new
  styling mechanism, no magic pixel values where a token exists.
- Keep it compositor-friendly; honor `prefers-reduced-motion` (no new motion expected).

## Acceptance criteria (testable)

- At **320px** (both the in-node group table and the `StandingsOverlay` dialog): the compact header row
  `# / Team / MP / GD / Pts` renders without overlapping/clipped headers, numeric columns fully legible, and
  **no horizontal overflow** (document `scrollWidth ≤ clientWidth + 1`, and the dialog stays within the
  viewport).
- Team-name cells truncate gracefully (ellipsis) rather than forcing overflow when a name is long.
- Desktop ≥1024 and the full column set are unchanged.
- Visual snapshot(s) for the compact standings at 320px updated **deterministically** (reuse the hardened
  `standings-open-*` determinism in `e2e/visual.spec.ts` — stable in-viewport trigger, masked dynamic content;
  no new flake). `npm run typecheck` + `npm test` + `npm run build` green.

## Files (indicative)

- `src/components/roadmap/StandingsOverlay.tsx`, `src/components/nodes/GroupTableNode.tsx` (compact render path)
- `src/features/roadmap/responsive.ts` (only if a width/label tweak belongs with the column metadata)
- `src/styles/global.css` (tokens, if a new spacing/size token is genuinely warranted)
- `e2e/visual.spec.ts-snapshots/standings-open-320-*.png` (regenerated)

## Notes

Independent of the in-flight camera work (`2026-06-24-0951-preserve-viewport-on-refetch`). No file overlap.

Owner: **wc-ui-engineer** + **wc-test-engineer** (visual snapshot refresh).
