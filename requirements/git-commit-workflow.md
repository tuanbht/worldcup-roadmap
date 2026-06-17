# Requirement: Git commit workflow

> **Standing process policy.** The repo must be under git, and every completed request/requirement must be
> committed.

## Policy
1. **The project is a git repository.** Initialized on the `main` branch.
2. **Commit after every completed request.** When a request or requirement is finished (code + tests green),
   create at least one commit capturing that work. Don't leave finished work uncommitted.
3. **One requirement → one logical commit (or a small focused set).** Keep commits scoped and coherent; don't
   mix unrelated changes.
4. **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`, `perf:`, `ci:`), with an
   optional scope, e.g. `feat(roadmap): vertical knockout layout`.
5. **Local only unless asked.** Do **not** `git push` or create a remote/PR unless the user explicitly asks.
6. **Never commit:** `node_modules/`, `.next/`, `coverage/`, `test-results/`, `*.tsbuildinfo`, real `.env*`
   (keep `.env.example`), `.omc/`, `.playwright-mcp/`, and screenshot artifacts. Enforced via `.gitignore`.

## Existing work (backfill — done with this requirement)
The pre-existing implementation was committed retroactively as a clean, ordered history grouped by area /
requirement, foundation first:
1. `chore:` Next.js 15 + TypeScript scaffold & tooling config
2. `chore:` requirement-pipeline agents/commands (`.claude/`)
3. `feat(domain):` WC2026 domain model + bracket/standings derivation (+ tests)
4. `feat(data):` mock + FIFA providers, repository, cache, validation, API route (+ tests)
5. `feat(roadmap):` zoomable React Flow bracket UI (nodes, edges, layout, hooks)
6. `test(e2e):` Playwright setup + specs
7. `docs:` project docs + README
8. `docs(requirements):` requirement specs (incl. this one)

## Acceptance criteria
- `git status` is clean after each completed request.
- Every completed requirement is represented by at least one commit with a Conventional-Commits message.
- No ignored/build/secret artifacts are tracked (`git ls-files` contains none of the excluded paths).
- History is on `main`; nothing pushed unless explicitly requested.

## Going forward
After each future request is done and verified, I commit it (scoped, conventional message) before reporting
completion — no separate reminder needed.
