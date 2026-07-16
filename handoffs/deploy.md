# Handoff: Deploy (Roadmap milestone 5)

You are picking up **milestone 5 of the roadmap** in `DESIGN.md`: deploy to
Railway with turtleherder.com pointed at it from day one, then seed the
real team. Read `DESIGN.md` in full before starting — **the design is
already settled**: a ninth interview (July 16, 2026) produced the "Deploy"
section and the "Decision log (deploy interview)" table. Do not re-grill
settled decisions; they are Richard's, made with the trade-offs on the
table (he chose the esbuild bundle over tsx-on-source knowingly, for
example).

## How Richard works

- Genuinely new forks that *surface during implementation* get the
  /grill-me treatment: present options, let him choose, reveal your own
  recommendation only **after** he picks (then argue if you feel
  strongly). Conventional calls: just make them.
- Commit when he says to, with real messages. During milestone 4 he
  authorized Claude to commit and push directly; confirm that still
  stands, then keep pushes small and watch CI after each.
- **Anything outward-facing or costing money goes through him**: creating
  the Railway project/Postgres (billing), starting the domain transfer at
  AWS, changing DNS records, and the final cutover. Walk him through
  those steps; don't attempt them unilaterally. He can run interactive
  commands himself by prefixing them with `!` in the session.

## Current state (verified July 16, 2026)

- Milestones 1–4 done and on master. CI (`.github/workflows/ci.yml`) is
  green — 4/4 runs since it landed. Two jobs, each with its own
  `postgres:17-alpine` service: "Typecheck, build, unit & integration"
  and "End-to-end". Suites: 14 unit + 35 integration + 13 e2e.
- Remote: `git@github.com:richardharrington/turtleherder.git` (public
  repo). Classic branch protection on master: both job names are required
  checks; admin enforcement is off, so direct pushes (as Richard) bypass —
  keep CI green anyway.
- The `gh` CLI is installed (brew) but **unauthenticated**; milestone 4
  monitored CI via the public REST API with curl
  (`/repos/richardharrington/turtleherder/actions/runs?head_sha=…`).
  Either get Richard to `! gh auth login` or keep using curl.
- Nothing Railway- or Namecheap-related exists yet: no accounts wired up,
  no `railway.json`, no server build script, no create-team script.

## Inputs only Richard can supply

Collect these before the steps that need them (none block the code work):

1. **Real team details** for `db:create-team`: name, slug, min players,
   quota minimum, quota noun singular/plural, timezone, captain's name.
2. **Railway**: account + project creation (billing decisions are his),
   and dashboard-side settings (wait-for-CI toggle, custom domains,
   backup schedule).
3. **Namecheap + AWS**: accounts, domain unlock + auth code at Route 53,
   initiating the transfer. **Start the transfer in the first working
   session** — it can take ~a week and everything else proceeds in
   parallel against the `.up.railway.app` URL.

## Repo facts the implementation must respect

- **The server already serves the client in production.**
  `server/src/index.ts` statically serves `client/dist` (override:
  `CLIENT_DIST` env) with an SPA fallback that skips `/api`. `/join/:token`
  is a server route, not a client one. `PORT` env is honored.
- **Server build is the new part.** Today `pnpm start` runs tsx on
  TypeScript source and `server` has no build script; the milestone adds
  an esbuild bundle. Gotchas:
  - `@turtleherder/shared` is consumed as TS source
    (`"." : "./src/index.ts"`) — the bundle must compile it in.
  - `pg` has an optional `require("pg-native")` — mark it external or
    esbuild fails/bloats.
  - Root `package.json` is `"type": "module"`; pick output format
    accordingly.
  - Once `server` has a `build` script, root `pnpm build` (`pnpm -r
    build`) — which CI already runs — will build the bundle. Add the
    **boot-the-bundle smoke check** to CI per the design (no suite
    exercises the bundle otherwise). The test job already has a Postgres
    service if the check needs `DATABASE_URL`; note the `pg` Pool is
    lazy, so a bare boot may not need a live DB — verify, don't assume.
  - `db:migrate` runs `tsx src/migrate.ts` — the pre-deploy command uses
    source, unaffected by bundling.
- **`NODE_ENV=production` flips the session cookie's Secure flag**
  (`server/src/auth.ts`). Railway does not set it for you; `railway.json`
  or service vars must.
- **The dev seed (`db:seed`) TRUNCATEs everything.** It must never run
  against production. Worth adding a guard (refuse when
  `NODE_ENV=production`) as part of this milestone. The new
  `db:create-team` script must never truncate (per the decision log) and
  should print the captain's link using `APP_ORIGIN`, not
  `localhost:$PORT` (see `seed.ts`'s current link-printing for the shape).
- **Never point the e2e suite (or `TEST_DATABASE_URL`) at production** —
  it truncates and reseeds. Production verification is manual: browse via
  join links (a signed-out visit correctly shows only the wall — that's
  the auth design working, not a broken deploy).
- **Toolchain:** pnpm monorepo, `packageManager: pnpm@11.5.3`, Node 24
  (`engines` + `.nvmrc`). Railway's builder should honor both — verify in
  the build logs.
- **The bobcats sandbox in prod:** `db:create-team` makes team + captain
  only; the sandbox's roster/games can be added through the UI afterward —
  don't extend the script for that.

## Scope

- Code: server esbuild bundle + build script, CI boot-smoke check,
  `railway.json` (build/start/pre-deploy commands), `db:create-team`
  script, the dev-seed production guard, `APP_ORIGIN` support.
- Railway setup with Richard: project, Postgres, env vars
  (`DATABASE_URL` reference, `NODE_ENV`, `APP_ORIGIN`), wait-for-CI,
  custom domains (apex + www), backups enabled **and one restore
  verified**.
- DNS: coordinate the Namecheap transfer (his steps), then ALIAS at the
  apex + CNAME at www.
- Cutover, in the design's order: deploy → verify on the Railway URL →
  create bobcats sandbox + real team → transfer completes → DNS records →
  re-verify on turtleherder.com → Richard's captain texts the join links.
- Verify the deployed app end-to-end by hand before calling it done: join
  link signs in, attendance saves, manage pages work, PWA installs from
  the real domain.
- Mark milestone 5 done in `DESIGN.md`'s roadmap (✅ + date + one-line
  summary; as-built notes only for genuine surprises).

## Out of scope

- **Multi-team keyring (milestone 6)** and everything after it — no
  self-serve, no landing page, no tip jar (the `/` wall page stays as-is).
- Staging environments, monitoring/alerting stacks, uptime bots, log
  drains — none of it was asked for.
- Migrating any data from the old PHP site's MySQL. It stays where it is;
  retiring the old site is a DNS repoint, deliberately reversible.
- Service worker / offline support (settled in milestone 3: none).

## Gotchas observed while building milestone 4

- GitHub Actions service containers can't mount repo files (they start
  before checkout) — anything initdb-shaped must be env-var-driven. The
  same class of surprise likely exists on Railway: verify assumptions
  against real build/deploy logs, not docs alone.
- A green local run proves nothing about the hosted environment — the
  milestone isn't done until the real thing is verified working on
  turtleherder.com.
- `pnpm test` uses `--passWithNoTests` in some workspaces; when reading
  CI or deploy logs, confirm suites actually ran rather than trusting
  exit codes.
