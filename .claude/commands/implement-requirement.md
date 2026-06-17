---
description: Run a requirement through the 7-stage gated TDD pipeline (plan → review → test → refactor test → implement → review → final review).
argument-hint: <requirement description, or path to a requirement file>
---

You are the **orchestrator** of the requirement-implementation pipeline. Drive the seven `req-*` subagents in order, enforce the review gates, and loop back on rejection. Do the coordination yourself; delegate the actual work to the subagents via the Task tool.

## The requirement

`$ARGUMENTS`

If that is empty, ask the user for the requirement before proceeding. If it is a file path, read it.

## Setup

1. Derive a short kebab-case `<slug>` from the requirement.
2. Create the run folder `docs/pipeline/<slug>/` and write the requirement verbatim to `docs/pipeline/<slug>/requirement.md`.
3. Use this folder for every artifact below. Always pass each subagent the **absolute paths** it needs (it does not share your context).

## Pipeline (run in order)

**Stage 1 — Plan.** Dispatch `req-planner` with `requirement.md` and the run folder. It writes `plan.md`.

**Stage 2 — Review plan (GATE).** Dispatch `req-plan-reviewer` with `requirement.md` + `plan.md`. It writes `plan-review.md` and returns `VERDICT: APPROVED` or `VERDICT: CHANGES_REQUESTED`.

- If `CHANGES_REQUESTED`: re-dispatch `req-planner` with `plan-review.md` to revise, then review again. Max **3** plan iterations; if still not approved, stop and surface the blockers to the user.

**Stage 3 — Write tests (RED).** Dispatch `req-test-writer` with the approved `plan.md`. It writes failing tests and confirms they fail for the right reason.

**Stage 4 — Refactor tests (still RED).** Dispatch `req-test-refactorer`. It improves the tests without weakening them or adding production code, and confirms they are still RED.

**Stage 5 — Implement (GREEN).** Dispatch `req-implementer` with `plan.md` + the tests. It writes production code until the suite is green, then runs typecheck/lint/build.

**Stage 6 — Review implementation (GATE).** Dispatch `req-impl-reviewer` with the changed code + `plan.md` + tests. It writes `impl-review.md` and returns a verdict.

- If `CHANGES_REQUESTED`: re-dispatch `req-implementer` with `impl-review.md`, then review again. Max **3** implementation iterations; if still not approved, stop and surface the blockers.

**Stage 7 — Final holistic review.** Dispatch `req-final-reviewer` with the whole run. It writes `final-review.md` (tradeoffs, tech debt, risks, follow-ups, verdict).

## Rules

- The project's `requirements/` directory is the authoritative source of truth. Read it at the start and have every stage re-consult the relevant requirement file frequently while working — keep the build aligned to the requirement, not only to upstream stage artifacts.
- All seven `req-*` agents run on **opus**. Under ultracode the session's **xhigh ("ultra") effort** propagates to them; for guaranteed xhigh effort regardless of session, run the `.claude/workflows/implement-requirement.js` variant instead, which pins it per call.
- Enforce the gates. Do not advance past a `CHANGES_REQUESTED` gate until it is `APPROVED` or you hit the iteration cap.
- Keep the user informed between stages with a one-line status (stage, verdict, key artifact path). Do not dump full subagent output unless asked.
- Never skip the test stages. Tests are written and must be RED before implementation begins.

## Final report to the user

A compact summary: per-stage outcome (and iteration counts), the final verdict from stage 7, the top tradeoffs/risks, recommended follow-ups, and links to the artifacts in `docs/pipeline/<slug>/`.
