# Requirement: Library-first stack policy

> **For planners, implementers, and reviewers.** Standing policy for the whole `wc-roadmap` codebase.

## Policy

**Prefer the most popular, well-maintained, relevant library for every cross-cutting/infrastructure
concern instead of hand-rolling it.** Don't reinvent solved problems (dates, HTTP, caching, styling,
validation, testing). Pick the de-facto-standard library for each concern and use it consistently.

Resolved with the requester:
- **Scope = infrastructure only.** Library-first applies to cross-cutting concerns. **Bespoke domain
  logic stays hand-written** — no library models World Cup rules (standings, bracket topology, seeding,
  the deterministic simulator). See _Non-goals_.
- **Strictness = strong default, justify exceptions.** Reach for the canonical library first; custom code
  is allowed when a library is genuinely overkill, but the deviation must be justified in review.
- ~~**Bundler = Next.js 15 is kept.**~~ **SUPERSEDED by [migrate-to-vite-react.md](./migrate-to-vite-react.md):**
  the app migrates to a **Vite + React SPA + a thin Hono API**; Next.js is removed. (The original decision kept
  Next/Turbopack; the owner has since chosen plain React. TanStack Query stays — it now calls the Hono API.)

## Canonical stack map (single source of truth)

| Concern | Library (pick) | Status | Notes |
|---|---|---|---|
| Framework / routing / bundler | **Vite + React SPA + Hono API** (was Next.js 15) | ⚠️ migrating | Superseded by `migrate-to-vite-react.md`; Vite builds the SPA, Hono serves `/api/worldcup`. |
| Language | **TypeScript 5** | ✅ in repo | — |
| Styling | **Tailwind CSS v4** | ➕ add | Replace bespoke CSS. Keep the oklch design tokens via Tailwind v4 `@theme` (tokens stay, expressed through Tailwind). Add `prettier-plugin-tailwindcss` for class order. |
| Accessible UI primitives | **shadcn/ui** (Radix) | ➕ add (optional) | For dialogs/tabs/tooltip etc. Most popular, accessible-by-default. |
| Server state / data fetching | **TanStack Query** (`@tanstack/react-query`) | ➕ add | Client-side fetch/caching + **live polling** (mock has a live Final; `env.ts` already defines live/idle cache TTLs). Pair with native `fetch`. Don't copy server state into a client store. |
| Client state (only if needed) | **Zustand** | ➕ add if needed | React Flow already uses it internally. Per project patterns. |
| URL state (filters / active view) | **nuqs** | ➕ add if needed | Type-safe Next search params. |
| Date/time + timezone | **date-fns** + **date-fns-tz** | ➕ add | Kickoffs are ISO-UTC (`Match.kickoff`); render in venue/user tz. (`Luxon` is the acceptable alternative — pick **one**, don't ship both.) |
| Validation | **Zod** | ✅ in repo | The standard; already the data boundary (`parseTournament`, `env.ts`). Keep. |
| Graph / zoomable canvas | **React Flow** (`@xyflow/react`) | ✅ dep (unused) | Smooth mouse-wheel zoom requirement. See `zoomable-roadmap-graph.md`. |
| Tree / bracket layout | **d3-hierarchy** | ➕ add | A bracket is a binary tree → `d3.tree`/`d3.cluster`. **Supersedes Dagre** from the earlier spec (dagre/dagre-d3 are deprecated). `elkjs` only if needed. |
| Icons | **lucide-react** | ➕ add | Most popular React icon set. |
| UI animation (non-graph) | **Framer Motion** (`motion`) | ➕ add (sparingly) | Compositor-friendly only. React Flow handles graph motion. |
| HTTP client | native **fetch** | ✅ native | No dep. Wrapped by TanStack Query. (`ky` only if a thin wrapper is truly wanted.) |
| Number / locale formatting | native **Intl** | ✅ native | No dep needed. |
| Unit / component testing | **Vitest** + **@testing-library/react** (+ `jest-dom`, `user-event`) | ⚠️ partial | Vitest configured; add Testing Library. |
| E2E testing | **Playwright** (`@playwright/test`) | ➕ add | Mandated by project testing rules. |
| Lint / format | **Prettier** (+ tailwind plugin) | ⚠️ partial | `eslint-config-next` removed with Next; no ESLint config remains. Add Prettier. |
| Fonts | **@fontsource/archivo** + **@fontsource/inter** | ✅ in repo | Was `next/font`; now self-hosted via `@fontsource` (`font-display: swap`). |
| Images / flags | plain `<img loading="lazy" width height>` | ✅ in repo | Was `next/image`; the `next.config.ts` `remotePatterns` FIFA-host allow-list is dropped with Next. `Flag.tsx` loads flags directly with a monogram `onError` fallback. A future CSP must allow `https://api.fifa.com` + `https://digitalhub.fifa.com` in `img-src`. |

Legend: ✅ already in place · ⚠️ partially present · ➕ to add.

## Non-goals (stays hand-written — do NOT library-ize)
- Domain rules and derivations: `computeGroups` (standings), `buildBracket` (topology), `R32_SEEDING`,
  `stage-order`, and the deterministic mock simulator (`mulberry32` PRNG, Poisson `drawGoals`, `decide`).
  These encode WC-specific rules or are tiny deterministic helpers with no canonical library.
- **Allowed justified exception:** the inline `mulberry32` seeded PRNG stays (zero-dep, deterministic,
  well-understood) rather than adding `seedrandom` — determinism of fixtures matters more than the dep.

## Tensions to reconcile (call out, don't silently duplicate)
- **Tailwind vs design tokens:** keep the oklch token set, but define it in Tailwind v4 `@theme` — one
  styling system, not two. Don't keep a parallel bespoke CSS framework.
- **TanStack Query vs Next Server Components:** server components/route handlers do the initial fetch +
  Zod validation; TanStack Query owns client-side **live polling** and cache. Don't duplicate server state.
- **date lib vs `Intl`:** standardize tz conversions on the chosen date lib; simple display may use `Intl`,
  but all kickoff/timezone rendering goes through one consistent path.

## Acceptance criteria (reviewable)
- This stack map is the single source of truth; a PR adding a custom util for a listed concern must use
  the mapped library or justify the deviation in review.
- **No hand-rolled date/timezone formatting** — all `kickoff` rendering goes through the tz lib.
- **No bespoke fetch/caching layer** — client data fetching/polling uses TanStack Query.
- **Styling is Tailwind** (utilities + theme tokens); no second styling system beyond global resets/tokens.
- Unit/component tests use Vitest + Testing Library; critical flows have Playwright E2E.
- `package.json` reflects the map with **no two libraries solving the same concern** (e.g. not both
  `date-fns` and `luxon`, not both `axios` and `ky`).
- Domain logic remains pure, framework-agnostic TypeScript (unchanged by this policy).

## Review enforcement (per strictness = strong default)
- Hand-rolling a mapped concern without justification → **MEDIUM** (return for rework or written rationale).
- Introducing a **second** library for an already-covered concern (dependency bloat / inconsistency) → **HIGH**.
- Replacing domain logic with a library against _Non-goals_ → **reject** (out of scope).

## Follow-up: update the existing spec
`requirements/zoomable-roadmap-graph.md` predates this policy — update it to: Dagre → **d3-hierarchy**,
add **Tailwind** for styling, **TanStack Query** for any live data, and the **tz lib** for kickoff display.
