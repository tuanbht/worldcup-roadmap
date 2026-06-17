# Final Review — Library-first stack policy (post-Vite migration)

**Stage:** 7 (closing strategic assessment)
**Reviewer altitude:** whole-effort. Line-level review happened in stage 6 (`impl-review.md`, APPROVED).
**Date:** 2026-06-17
**Verdict:** **SHIP WITH CAVEATS** (one trivial, non-code caveat — see below).

---

## 1. Requirement satisfaction

The requirement is the standing *library-first* policy plus the concrete remaining adoptions it
mandates, re-scoped to the already-completed Vite + React SPA + Hono migration. Every in-scope item
landed, and I re-verified the load-bearing claims against the live tree rather than trusting prior
stages:

| Requirement item | Delivered? | Evidence (re-verified) |
| --- | --- | --- |
| date-fns + date-fns-tz; all kickoff/tz rendering through one path | ✅ | `src/lib/datetime.ts` wraps `parseISO` + `formatInTimeZone({ locale: enUS })` against default `'UTC'`; `format.ts` is a thin barrel re-exporting `formatDate/formatDateTime/formatTime`; all three consumers (`MatchNode`, `StatusPill`, `MatchDetailPanel`) import from it. Grep for real `Intl.DateTimeFormat`/`toLocale*` date formatting in `src/` → only two **doc-comment** mentions, zero usage. |
| d3-hierarchy + types as a dependency only (+ smoke test); no hierarchy build here | ✅ | `d3-hierarchy@^3.1.2` + `@types/d3-hierarchy@^3.1.7` present; imported **only** in `src/lib/d3-hierarchy.smoke.test.ts` (5 tests pass); no `bracketHierarchy`/`d3-bracket-adapter` wrapper; no dagre. Construction correctly deferred to req #2. |
| lucide-react; replace inline glyphs | ✅ | `MatchDetailPanel.tsx` imports `{ X }` and renders `<X aria-hidden size={16} />`; button keeps `aria-label="Close match details"`. Grep for `✕/✗/⨯` in non-test `src/` → none. |
| @testing-library/user-event; Testing Library component tests | ✅ | `@testing-library/user-event@^14.6.1` added; `MatchDetailPanel.test.tsx` (9 tests) uses `userEvent.click`, per-file jsdom pragma, `vitest.setup.ts` `setupFiles`. Global `node` env preserved — domain suite stays green. |
| prettier + prettier-plugin-tailwindcss; config + format script | ✅ (config inlined) | `prettier@3.4.2` + `prettier-plugin-tailwindcss@0.6.11`; config inlined in `package.json` `"prettier"` key (not a standalone `.prettierrc`); `format`/`format:check` scripts present. All of `src/` is Prettier-clean. |
| framer-motion → DEFER (no consumer) | ✅ | Not in `package.json`. Panel slide stays compositor-only CSS `transition-transform`. Policy row marked "deferred — no consumer" with a revisit trigger. Correct anti-bloat call. |
| Enforce one-library-per-concern / single styling system | ✅ | Grep: no luxon/moment/dayjs/axios/ky/framer-motion. `src/styles/global.css` is the sole app stylesheet. |
| Doc updates (`zoomable-roadmap-graph.md`, policy map) | ✅ | `zoomable-roadmap-graph.md` now names d3-hierarchy (Dagre superseded), Tailwind v4 `@theme`, TanStack Query, date-fns/date-fns-tz, Vite+React+Hono. Policy stack map matches post-migration reality. |
| Non-goals untouched (standings, topology, seeding, stage-order, mock PRNG) | ✅ | Diffs to domain/mock files are pure Prettier reflow; no logic edits (confirmed in stage 6 line review). |

**Partial / deferred — stated honestly:**

- **framer-motion** is intentionally deferred, not delivered — this is the *correct* outcome the
  requirement explicitly asked for (no speculative dependency), not a gap.
- **`formatDate`** is exported and unit-tested but has **no runtime consumer** (flagged L1 in plan
  review). Harmless contract completeness; noted so a future reader doesn't hunt for a caller.
- **Viewer-local timezone** is deferred behind the `tz` argument; production renders a fixed `'UTC'`
  broadcast zone. This is a deliberate determinism decision, documented in the façade and the plan.

No gate was skipped and no test was weakened to pass. The date tests genuinely prove a real tz
conversion (cross-zone divergence + a midnight-crossing case), not a string slice — I consider the
suite honest.

---

## 2. Tradeoffs

1. **Fixed `'UTC'` broadcast zone vs. viewer-local time.** Optimized for *determinism* (reproducible
   production output and stable E2E visual snapshots) at the cost of *user locality* — a viewer in
   Tokyo sees UTC kickoff times, not local. Right call for this phase: the domain model has **no
   per-venue timezone field**, so "venue-local" is impossible today, and the `tz` argument makes
   per-user/venue zones a one-line future change. The alternative (resolving the viewer's machine
   zone) would reintroduce exactly the non-determinism this refactor removed.

2. **Adopt d3-hierarchy now, consume it in req #2.** Optimized for *clean phase sequencing* (req #2
   starts on a known-good, type-resolved base) at the cost of shipping a dependency with no production
   consumer for one phase. The smoke test mitigates the only real risk (an unresolvable/mis-typed
   dep). Reasonable, but it does mean a dep sits unused until req #2 lands — acceptable given the
   ordering is intentional.

3. **date-fns over Luxon.** Both are canonical; the stack map names date-fns as the pick. Optimized
   for *bundle size* (date-fns is tree-shakeable; pairs cleanly with date-fns-tz) over Luxon's richer
   single-object API. Right call for an SPA with a bundle budget. The discipline of "pick one, never
   ship both" is upheld.

4. **Prettier-only, no ESLint.** The migration removed ESLint with Next. This phase added Prettier but
   not a linter. Optimized for *scope discipline* over *static-analysis depth* — defensible here, but
   it does leave the repo without lint-level enforcement (see debt below).

---

## 3. Architecture & fit

Strong fit. The change exploits the codebase's existing single-funnel boundaries so each diff is
minimal and idiomatic:

- `format.ts` was already the single date façade every kickoff consumer imported; collapsing it to a
  barrel over `src/lib/datetime.ts` means **zero call-site churn**. This is the codebase's own pattern,
  not a new one.
- `src/lib/datetime.ts` is small (65 lines), pure, React-free, no ambient clock — consistent with the
  repo's "small focused files, pure domain/util modules" direction.
- The icon swap is a one-component change that preserves the accessible-name contract, so the e2e/a11y
  surface is unchanged.
- Tailwind v4 remains the single styling system; no second styling mechanism introduced.

No friction or inconsistency introduced. The work reinforces the repo's direction (one library per
concern, single styling system, hand-written domain) rather than cutting across it.

---

## 4. Tech debt & risks (system level)

- **`format:check` is red on a docs file (cavet — see verdict).** `docs/pipeline/library-first-stack-policy/impl-review.md`
  was written by stage 6 *after* the format pass ran, so it is not Prettier-formatted and
  `npm run format:check` now exits 1 on it. **All of `src/`, `server/`, and configs are clean** — this
  is a documentation-hygiene blemish, not a code regression, and is fixed by a single
  `npm run format` (or excluding `docs/**` in `.prettierignore`). The impl-review's "format:check PASS"
  claim was true at its run time but is now stale because that same review file changed the tree.
- **No linter.** With ESLint gone and only Prettier added, there is no static analysis catching unused
  exports (e.g. `formatDate`), accidental `any`, or import hygiene. Low risk at current size; worth a
  follow-up as the bracket-layout work (req #2) grows the surface.
- **Unused dependency window.** d3-hierarchy ships with no production consumer until req #2. If req #2
  slips, a dep audit would flag it. Intentional and smoke-tested, but real.
- **Timezone UX assumption.** The fixed-UTC render is a product decision baked into a default constant.
  If product later wants local time, every snapshot rebaselines again. The `tz` seam makes the *code*
  change trivial, but the *visual-test churn* recurs.
- **Visual snapshots are machine/OS-bound.** Baselines are `*-chromium-darwin.png`. CI on Linux would
  need its own baselines or a containerized renderer — a pre-existing trait, not introduced here, but
  worth noting for the system's portability posture.
- **Security/performance posture:** unchanged and healthy. No new secrets, no `console.*` in
  `src/`/`server/`, no new network surface. Bundle stays within a sane budget (main `index` 71KB gz;
  lazy `RoadmapCanvas` 79.75KB gz). date-fns is tree-shaken; framer-motion correctly avoided. The
  pre-existing CSP follow-up (allow FIFA image hosts in `img-src`) remains future work, untouched here.

No CRITICAL or HIGH debt. The notable risks are all LOW and most are intentional, sequenced decisions.

---

## 5. Test & quality posture

**Confidence: high** for the delivered surface.

- **Suite:** 12 files, **109 tests, 0 failures** (re-run by me below). Mix of node domain/data tests,
  a d3 smoke test, the datetime unit suite (25 tests), and a Testing Library component test (9 tests).
- **Where it's strong:** the date façade is the only new logic module and it's at **100% coverage**
  with meaningful assertions (cross-zone divergence + midnight-crossing prove real tz math; null/empty/
  whitespace/unparseable boundary guards all exercised). The component test asserts the *behavioral*
  a11y contract (icon is `aria-hidden`, button name preserved, `onClose` via `userEvent`), not brittle
  markup. The two-zone test is exactly the right guard that date-fns-tz — not Intl-default — is wired.
- **Where it's thin (acceptable):** d3-hierarchy has install-proof only (by design — construction is
  req #2's job). `MatchDetailPanel.tsx` is exercised but not a logic module. There is a harmless
  jest-dom double-registration (LOW-2 in stage 6) that's pure tidy-up.
- **E2E:** Playwright visual (4 desktop baselines regenerated under `timezoneId: 'UTC'` + `locale:
  'en-US'`), roadmap, and a11y specs were green in stage 6. I did not re-run Playwright in this pass
  (browser/runtime cost); I confirmed the four baselines exist and the tz/locale pin is in place, so I
  rely on stage 6's green E2E result plus the unit/build/typecheck re-runs below.

---

## 6. Follow-ups (prioritized)

**Must-do (before considering this fully closed):**

1. **Run `npm run format` once** to normalize `docs/pipeline/library-first-stack-policy/impl-review.md`
   (and any sibling docs), or add `docs/**` to `.prettierignore`, so `npm run format:check` is green
   again. One command. This is the only thing standing between the repo and a clean format gate.

**Nice-to-have (next phase / opportunistic):**

2. **Stand up req #2** (`docs/pipeline/per-match-nodes-and-orientation/`) to give d3-hierarchy a real
   consumer and retire the unused-dependency window.
3. **Decide `formatDate`'s fate** — either wire its intended consumer or drop the export to avoid a
   dead public API.
4. **Reintroduce a linter** (ESLint flat config or Biome) to recover static analysis lost with Next;
   would have caught the unused `formatDate` automatically.
5. **Tidy the jest-dom double-registration** (`MatchDetailPanel.test.tsx` direct import + shared
   `setupFiles`) — the test's own comment already invites removing the redundant lines.
6. **Track the timezone-UX question** explicitly in the backlog (viewer-local vs. broadcast UTC) so the
   `tz` seam is a deliberate product decision, not a forgotten default.

---

## Verification (re-run by this reviewer — not taken on faith)

| Gate | Command | Observed result |
| --- | --- | --- |
| Unit/component tests | `npm run test` | **PASS** — 12 files, **109 tests, 0 fail** (1.70s) |
| Build | `npm run build` (Vite) | **PASS** — built in ~1s; `index` 71.04 KB gz, lazy `RoadmapCanvas` 79.75 KB gz |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASS** (exit 0) |
| Format | `npm run format:check` | **FAIL (exit 1)** — sole offender `docs/.../impl-review.md`; **all `src/` is clean** (`prettier --check "src/**/*.{ts,tsx,css}"` → "All matched files use Prettier code style!") |

Grep spot-checks confirmed: zero real `Intl`/`toLocale*` date formatting in `src/` (only doc
comments); no luxon/moment/dayjs/axios/ky/framer-motion in `package.json`; lucide `X` swapped in with
no remaining glyphs; d3-hierarchy imported only in its smoke test; docs updated.

---

## Overall verdict

### SHIP WITH CAVEATS

The library-first work is complete, surgical, standards-clean, and faithful to both the policy and the
post-migration reality. Code, build, typecheck, and the full unit/component suite are green;
non-goals are untouched; no duplicate-concern libraries; the date determinism story is genuinely
tested. Stage 6 approved the line-level diff and I independently re-confirmed the gates.

**Caveats (both trivial, neither blocks the code):**

1. **`npm run format:check` is currently red** solely because the stage-6 `impl-review.md` doc was
   written after the format pass. All shipped code (`src/`, `server/`, configs) is Prettier-clean. Run
   `npm run format` once (or ignore `docs/**`) to restore the green format gate. This is a
   documentation-hygiene fix, not a code change.
2. **`formatDate` is exported but unused** — harmless, but either wire or drop it next phase.

Not "NEEDS WORK": there are no functional blockers, no failing code gate, and no security/correctness
risk. The single red gate is a one-command docs-formatting cleanup.
