// Shared, deterministic timezone pin for the radial kickoff-caption specs
// (MatchDotNode.test.tsx + FinalCenterNode.test.tsx). Both components render
// `formatDateTime(kickoff)` with NO explicit `tz`, so they resolve the viewer's
// LOCAL browser zone via `localTimeZone()`. These specs pin that zone here — once —
// so the render and the assertion oracle read the SAME zone and the caption can
// NEVER drift between the mock and the expectation, and the test never depends on
// the CI machine's zone.
//
// Co-locating the fixed zone + the fixed instant + the "expected caption" oracle in
// ONE module is the whole point: TZ, ISO and `expectedCaption()` all flow from these
// constants, so a change to the zone updates the mock AND the oracle together. Pure
// helpers — no assertions; kept under __test-support__ so it is excluded from
// coverage and never collected as a test.
import { afterEach, beforeEach, vi } from 'vitest';
import * as datetime from '@/lib/datetime';
import { formatDateTime } from '@/lib/datetime';

/** A FIXED IANA zone pinned for determinism (EDT in July == UTC−4), chosen so the
 *  local render visibly SHIFTS the day/time away from the raw UTC instant — proving
 *  browser-local rendering rather than a passthrough of the ISO. */
export const TZ = 'America/New_York';

/** 04:00Z on 2026-07-05. In `TZ` (EDT, UTC−4) this is 00:00 the SAME calendar day —
 *  a clear cross-zone shift the caption must reflect (04:00Z → 00:00 local). */
export const ISO = '2026-07-05T04:00:00Z';

/** The caption the component MUST render for `ISO`, computed through the SAME
 *  `formatDateTime` façade in the SAME pinned zone — so the assertion is never a
 *  brittle hardcoded literal and can never disagree with what the component emits.
 *  For the default `ISO`/`TZ` pair this is the EDT-shifted `"05 Jul, 00:00"`. */
export function expectedCaption(iso: string | null = ISO): string {
  return formatDateTime(iso, TZ);
}

/** The literal EDT-shifted caption for `ISO`, asserted alongside `expectedCaption()`
 *  so the cross-zone shift (04:00Z → 00:00 local, NOT the UTC 04:00) is pinned
 *  explicitly and a regression to UTC/passthrough rendering is caught. */
export const EXPECTED_CAPTION_EDT = '05 Jul, 00:00';

/** The util's null/empty/unparseable fallback (from `datetime.ts`) — the caption for
 *  a null kickoff. Referenced by name so the "Date TBD" contract lives in one place. */
export const TBD_CAPTION = 'Date TBD';

/** Install a `localTimeZone()` spy pinning the viewer zone to `TZ` for every test in
 *  the calling `describe`, and restore all mocks afterwards. Keeps the REAL
 *  `formatDateTime` (only the ambient local-zone read is stubbed), so the format
 *  logic under test is exercised, not mocked away. */
export function pinLocalZone(): void {
  beforeEach(() => {
    vi.spyOn(datetime, 'localTimeZone').mockReturnValue(TZ);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
}
