---
description: Verify the running local app at http://localhost:3217 in a real browser via the Playwright CLI (live smoke check).
argument-hint:
  [optional focus, e.g. "group cards show Group X · MD#" or "?view=full and the Final node renders"]
---

Dispatch the `live-verifier` agent to verify the running app at **http://localhost:3217** using the Playwright CLI (headless Chromium driven by a `tsx` script).

Focus for this run (if any): `$ARGUMENTS`

The agent will: preflight the server (`curl` :3217 + the proxied `/api/worldcup`), ensure Chromium is installed (`npx playwright install chromium`), run a Playwright script against `:3217` (console errors + DOM assertions + a screenshot), and return a **PASS / FAIL / INCONCLUSIVE** verdict with evidence. If the dev server isn't running it will tell you to start it with `npm run dev`.
