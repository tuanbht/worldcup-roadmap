# WC Roadmap — FIFA World Cup 2026

An interactive, zoomable, draggable **roadmap** for the FIFA World Cup 2026, on
**one continuous canvas**: every match is a node — group matches run in horizontal
lanes (one per group, by kickoff, standings table at each lane start) that flow
down into a vertical knockout tree (Round of 32 at the top → Final at the bottom).
Built with Vite, React, React Flow, and Tailwind CSS.

![Continuous canvas: groups + knockout](https://img.shields.io/badge/canvas-groups+knockout-3ddc97)

## Highlights

- **Zoom / pan / drag** canvas powered by `@xyflow/react` (React Flow v12).
- **Per-match nodes** for the whole tournament: horizontal group lanes feeding a
  **vertical knockout tree** (R32 → Final), the tree laid out with `d3-hierarchy`
  so each parent sits at the midpoint of its two children, plus the third-place play-off.
- **Focus control** (synced to the `?focus=` URL) that moves the camera to
  `all` / `groups` / `knockout` — it never swaps layouts; the continuous canvas is the default.
- **Live data from the official FIFA API** (`api.fifa.com/api/v3`) behind a provider-agnostic
  adapter, with a deterministic **offline mock** so it runs with zero configuration.
- Match **detail panel** (desktop drawer / mobile bottom sheet), minimap, controls, keyboard
  shortcuts, and a "Midnight Pitch" dark theme.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3217 — runs against the offline mock by default
```

`npm run dev` starts **only Vite** — there is no backend. With no `.env`, the app
serves a fully-simulated tournament (real teams, a live final), so there's nothing
to configure. To use live FIFA data, see **Data providers** below.

## Scripts

| Script                  | What it does                                             |
| ----------------------- | -------------------------------------------------------- |
| `npm run dev`           | Vite dev server (SPA only)                               |
| `npm run build`         | Production static build → `dist/`                        |
| `npm run preview`       | Preview the built static bundle                          |
| `npm run typecheck`     | `tsc --noEmit`                                           |
| `npm test`              | Vitest unit tests (domain, layout, mapper, hooks)        |
| `npm run test:coverage` | Unit tests with coverage                                 |
| `npm run test:e2e`      | Playwright E2E (run `npx playwright install` once first) |

## Data providers

The SPA fetches `api.fifa.com` **directly from the browser** (no backend). The
provider is a build-time client config — set `VITE_FIFA_PROVIDER` (see
`.env.example`):

| Value            | Behaviour                                                              |
| ---------------- | ---------------------------------------------------------------------- |
| `auto` (default) | FIFA API, transparently falling back to the mock on any failure        |
| `fifa`           | Strictly the official FIFA API (`idCompetition=17`, `idSeason=285023`) |
| `mock`           | The bundled offline fixture — deterministic, no network                |

FIFA's knockout fixtures are created only as teams qualify, so the bracket topology
(parent/child edges, placeholders) is **computed locally** and filled in as results arrive —
the app never depends on the API providing those links.

> Note: the original idea of scraping Google's sports widget isn't viable — that page is
> bot-protected and returns no structured data. The official FIFA API is the real source
> behind fifa.com's fixtures page and is used instead.

## Architecture

Pure frontend — the browser fetches FIFA directly; TanStack Query owns caching,
dedupe, and focus-only refetch. No server, no internal API, no shared cache.

```
api.fifa.com / mock fixture        (called directly from the browser)
        │  (provider adapters: FifaRepository | MockRepository)
        ▼  normalize + zod-validate → Tournament (assembled client-side)
  selectRepository().getTournament()
        ▼  useTournamentQuery (TanStack Query: cache · dedupe · focus refetch)
  build-graph  →  React Flow nodes/edges (one continuous canvas)
        ▼
  RoadmapCanvas (@xyflow/react)  ·  MatchNode + AdvanceEdge + group tables
        ▼  useMatchDetailQuery → loadMatchDetail → FIFA live + timelines
  MatchDetailPanel (Timeline / Lineups / Stats)
```

| Layer                                             | Location                |
| ------------------------------------------------- | ----------------------- |
| Domain types + bracket/standings logic            | `src/domain/`           |
| Providers, repository, FIFA client/mappers/loader | `src/data/`             |
| Layout engine + graph builder + hooks             | `src/features/roadmap/` |
| React Flow + panel components                     | `src/components/`       |

## Tech

Vite · TypeScript · React 19 · React Flow v12 (`@xyflow/react`) · TanStack Query ·
Tailwind CSS v4 · zod · Vitest · Playwright.

## Keyboard

`F` fit view · `0` reset zoom · `Esc` close the detail panel · `Tab` focus match cards.
