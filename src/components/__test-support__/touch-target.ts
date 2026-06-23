// Shared test-support for the mobile touch-target contract
// (requirement 2026-06-23-1336-mobile-friendly-small-screens, scope #5 / AC #5).
//
// WCAG 2.5.5 asks for ≥44×44px tap targets on touch. The plan grows the hit area
// ONLY on coarse pointers (`@media (pointer: coarse)` / Tailwind `pointer-coarse:`)
// so the desktop *visual* density (and the byte-identical ≥1024 snapshots) is
// untouched. jsdom can't measure real CSS layout, so component specs assert the
// CONTRACT instead of a computed box: the control must carry a stable, named
// coarse-pointer hit-area HOOK.
//
// This is deliberately a CONTRACT pattern, not a brittle exact-class match: any of
// the standard non-destructive techniques the plan sanctions satisfies it —
//   - a Tailwind `pointer-coarse:` variant (e.g. `pointer-coarse:min-h-[44px]`),
//   - an explicit `min-h-`/`min-w-` sizing token,
//   - a named reusable hit-area utility (`touch-target` / `hit-…`).
// A valid implementation can pick any one; what it must NOT do is leave the
// control at its current sub-44px size with no coarse-pointer affordance.
//
// Centralising the pattern here means the four touch-target surfaces (the App
// view-toggle + match-detail tab row via SegmentedControl, both close buttons,
// and the standings flag button) pin the SAME contract from one source of truth —
// so a future tweak to the sanctioned technique set changes one regex, not five.

/**
 * The coarse-pointer hit-area hook regex. A `className` matching this carries one
 * of the sanctioned ≥44px touch-target techniques. Exported so a test can compose
 * it (e.g. assert it on a queried-by-something-else element) when the helper below
 * doesn't fit.
 */
export const COARSE_HIT_AREA_PATTERN = /pointer-coarse:|min-h-|min-w-|touch-target|hit-/;

/**
 * Assert an element presents a ≥44px hit area on coarse pointers via a stable
 * hook, WITHOUT pinning a single literal class (which a different-but-valid
 * implementation could legitimately not use).
 *
 * Throws with the element's full className in the message so a RED failure shows
 * exactly what the control carries today.
 */
export function expectCoarseHitArea(element: Element): void {
  const className = element.className;
  if (!COARSE_HIT_AREA_PATTERN.test(className)) {
    throw new Error(
      `expected a ≥44px coarse-pointer hit-area hook ` +
        `(${COARSE_HIT_AREA_PATTERN.source}) on the element, ` +
        `but its className was:\n  "${className}"`,
    );
  }
}
