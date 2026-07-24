# Handoff: Auth backend (Roadmap milestone 1)

You are picking up **milestone 1 of the roadmap** in `DESIGN.md`: build the
backend half of the already-agreed auth design. Read `DESIGN.md` in full before
anything else — especially the "Auth design (agreed, not yet built)" section
and the "Roadmap" section. It is the authoritative spec and decision log.

## How Richard works

- He settles open questions via **/grill-me interviews**: present options,
  let him choose, and reveal your own recommendation only **after** he picks
  (then argue for it if you feel strongly).
- The **design is settled** — do not re-litigate anything in DESIGN.md's auth
  section or decision log (plaintext multi-use tokens, no accounts/passwords/
  email, ~1-year rolling sessions, captains-only access management, trust
  inside the wall, etc.). Grill only on genuine *implementation-level*
  unknowns not covered by the spec.
- Commit at each milestone boundary with a real message, when he says to.
  Don't batch unrelated work.

## Scope: backend only — no UI

Auth's UI (friendly wall page, captains' manage-access page, the personal
question on home + single-game pages) is **milestone 3**, built after the
mobile-first redesign settles the design language. Another agent is running
that design interview in parallel. Therefore:

- **Do not touch `client/`.** Not even small edits.
- The one client-facing thing you own is the **API contract for
  unauthenticated requests** (e.g. a consistent 401 JSON shape, and the
  `/join/<token>` redirect behavior) — define it now, in `shared/` schemas
  where appropriate, so milestone 3 can build against it.

## What to build

Per DESIGN.md's auth section:

1. **Migration**: `player.join_token` (unique, auto-generated on player
   creation), `player.is_captain` (boolean, default false), and a `session`
   table (`id`, `player_id` FK, `created_at`, `last_seen_at`).
2. **`GET /join/<token>`**: exchanges a valid token for an httpOnly, Secure,
   SameSite=Lax session cookie (~1 year, rolling — renewed on every visit)
   and redirects to the team's home page. Invalid/revoked token → the same
   response shape a signed-out visitor gets (leak nothing).
3. **Session middleware**: every `/api/teams/:slug/*` endpoint requires a
   session belonging to that team. (The SPA wall page itself is milestone 3;
   the API enforcement is yours.)
4. **Captain endpoints** (session must be a captain of that team): list
   players' current join links, regenerate a token, revoke a token.
   Regenerate/revoke also kills that player's sessions; deleting a player
   cascades everything.
5. **Seed updates**: seed and e2e fixtures need tokens/captain flags; the
   dev seed prints the first captain's join link.
6. **Tests**: extend the integration suite (`server/src/app.test.ts` pattern —
   real `turtleherder_test` Postgres, `DATABASE_URL` set before dynamic
   import). Critically, the **existing 18 integration tests and 6 Playwright
   e2e tests must keep passing** once the API is walled — that means test
   setup (`e2e/global-setup.ts`, the integration tests' setup) needs to
   establish sessions. Updating e2e to *cover* the join flow and wall is
   milestone 3; keeping the existing e2e suite green is yours.

## Likely grill-worthy implementation questions

Examples of what's legitimately open (not exhaustive): token/session-id
generation details (e.g. `crypto.randomBytes` → base64url), cookie handling in
Hono (`hono/cookie`), how rolling renewal is implemented (write-on-every-
request vs. throttled `last_seen_at` updates), session pruning, whether
`/join` lives inside or outside `/api`, exact 401 contract. If the spec plus
codebase makes the answer obvious, just decide and note it — don't interview
for its own sake.

## Coordination

- The parallel agent writes **only a fresh design document** — it will not
  touch code or DESIGN.md. You may append implementation notes/decision-log
  rows to DESIGN.md without conflict.
- Docker Postgres via `pnpm db:up`; suites: `pnpm test` (unit + integration),
  e2e in `e2e/` (ports 3100/5199, workers: 1).
