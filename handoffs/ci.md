# Handoff: CI (Roadmap milestone 4)

You are picking up **milestone 4 of the roadmap** in `DESIGN.md`: GitHub
Actions running all three test suites on push, before a real team depends
on master. Read `DESIGN.md` in full before starting — especially the
Roadmap and Testing sections. There is no separate design doc for this
milestone; the spec is one sentence and the substance is in the repo
facts below.

## How Richard works

- He settles open questions via **/grill-me interviews**: present options,
  let him choose, and reveal your own recommendation only **after** he
  picks (then argue for it if you feel strongly).
- CI is mostly conventional — don't grill on things with an obvious
  default (pnpm store caching, uploading Playwright traces on failure,
  service-container health checks: just do them). Genuine forks worth
  grilling, none of which the docs resolve:
  - **Node version.** No `engines` field exists anywhere; his dev machine
    runs Node 24. Pinning the workflow needs a decision.
  - **Trigger scope.** The spec says "on push" — every branch, or master
    plus pull requests?
  - **More than the three suites?** `pnpm typecheck` and `pnpm build`
    exist and are fast; the spec names only the suites. Include or not.
  - **Branch protection** (require green before merge) is a GitHub
    setting, not workflow YAML — ask whether he wants it at all before
    touching repo settings.
- Commit when he says to, with a real message. This milestone is likely
  one commit.

## Current state (verified July 16, 2026)

Milestones 1–3 are done and on master. All suites green at `835371f`:
14 unit + 35 integration + 13 e2e. The remote is
`git@github.com:richardharrington/turtleherder.git`; local master is in
sync with `origin/master`. Note: **Richard has been handling pushes
himself** — coordinate with him about pushing workflow commits and
watching runs (`gh run watch` works; the `gh` CLI is available).

## Repo facts your workflow must respect

- **Toolchain:** pnpm monorepo; `packageManager: pnpm@11.5.3` in the root
  `package.json` (corepack or `pnpm/action-setup` will honor it).
  Workspaces: `client`, `server`, `shared`, `e2e`.
- **No build step is needed for tests.** `@turtleherder/shared` exports
  TypeScript source directly (`"." : "./src/index.ts"`), which tsx, vite,
  and vitest all consume. A fresh checkout + `pnpm install` can run every
  suite immediately.
- **The three suites:**
  1. `pnpm test` runs vitest in `shared` (pure unit, no DB) **and**
     `server` (integration, needs Postgres — see below). One command,
     two suites.
  2. `pnpm test:e2e` runs Playwright in `e2e/`.
- **Postgres:** local dev uses `compose.yml` (postgres:17-alpine, user
  and password `turtleherder`, main DB `turtleherder`), and
  `docker/create-test-db.sql` — mounted into the container's initdb —
  creates the **`turtleherder_test`** database that both test suites use.
  ⚠️ GitHub Actions **service containers can't mount repo files** (they
  start before checkout), so that init script won't run. Either give the
  service `POSTGRES_DB: turtleherder_test` directly, or add a `psql`
  step that creates it. Both suites honor `TEST_DATABASE_URL` (default:
  `postgres://turtleherder:turtleherder@localhost:5432/turtleherder_test`).
- **Migrations are self-serve:** `server/src/app.test.ts` and
  `e2e/global-setup.ts` each run node-pg-migrate themselves before
  testing. CI needs no separate migrate step.
- **Playwright specifics:** `@playwright/test` ^1.50, default project
  (Chromium only) — install browsers with
  `pnpm --filter @turtleherder/e2e exec playwright install --with-deps chromium`.
  The Playwright config starts both web servers itself (API via tsx on
  port 3100, Vite client on 5199, `reuseExistingServer: false`,
  `workers: 1` — the tests share one seeded database and must not
  interleave; do not parallelize them). `e2e/global-setup.ts` migrates,
  seeds, and writes a `storageState` cookie file; it needs
  `TEST_DATABASE_URL` reachable and nothing else.
- **Integration and e2e both truncate and reseed `turtleherder_test`** —
  they can share one database *sequentially* but must not run against it
  at the same time. Either order the jobs, or give each its own database.

## Scope

- A GitHub Actions workflow running all three suites per the trigger
  scope Richard picks, plus whatever extras he approves in the grill.
- Whatever tiny repo adjustments the workflow genuinely needs (e.g. an
  `engines` field if he picks a Node version and wants it recorded).
- Verify the workflow actually passes on GitHub — a green local run
  proves nothing about the Actions environment. Coordinate pushes with
  Richard; iterate until the real run is green.
- Mark milestone 4 done in `DESIGN.md`'s roadmap when it is, following
  the convention of the other milestones (✅ + date + one-line summary;
  add an as-built note only if something non-obvious surfaced).

## Out of scope

- **Deploy (milestone 5)** — no Railway config, no deploy workflow, no
  turtleherder.com anything. Noting seams is fine.
- **Multi-team keyring (milestone 6)** and everything after it.
- **Coverage reporting, badges, Dependabot/Renovate, release
  automation** — none of it was asked for; don't add tooling Richard
  didn't choose.

## Gotchas observed while building milestone 3

- The e2e suite's two spec files depend on alphabetical order:
  `app.spec.ts` (signed-in flows, mutates fixtures, revokes Bob's token)
  runs before `auth.spec.ts` (signed-out wall/join flows, deliberately
  uses Alice's untouched token). `workers: 1` already guarantees this —
  preserve it.
- `pnpm test` runs vitest with `--passWithNoTests` in some workspaces;
  a "passing" run that silently skipped a suite is a failure mode worth
  guarding against when reading CI logs.
- Shell state: `server`'s integration tests set `DATABASE_URL` from
  `TEST_DATABASE_URL` *inside the test file* — the workflow only needs
  `TEST_DATABASE_URL` exported, nothing else.
