# Turtleherder v2 — Design

A rewrite of the original PHP turtleherder as a React + Node app in TypeScript, backed by
Postgres. This document records the decisions made during the design interview
(July 2026) and is the spec for the first version. A second interview settled
the [auth design](#auth-design); a third the [roadmap](#roadmap) — the
priority order for everything after feature parity; a fourth the auth
backend's implementation details as that backend was built; a fifth settled
the mobile-first redesign's visual and UX direction, recorded in the
standalone [`REDESIGN.md`](REDESIGN.md) rather than here (July 2026
throughout).

## Goal

A **feature-complete copy of the original app**, shipped for real use. The legacy PHP in
`legacy/` is the reference for behavior. Deliberately deferred to later versions:

- Authentication / access control UI — the design and backend are done (see
  below); the wall page, manage-access page, and personal question arrive in
  the front-end push (see [Roadmap](#roadmap)), before real deployment
- Improved calendar/date picking beyond the platform default — since folded
  into the pre-launch mobile-first redesign (see [Roadmap](#roadmap))
- Team creation & settings UI (self-serve signup)
- A public landing page at `/` (the old `index.html`'s role), which is also the
  home for the **tip jar**: the app stays free with no freemium tier, ever; a
  single static sentence + link (GitHub Sponsors or Ko-fi, not Patreon — no
  membership semantics) lets appreciative captains chip in for hosting. Never
  on team-facing pages, never a banner/modal/nag, no tracking attached.

The two structural flaws of the original are fixed now, not later:

1. **Table-set-per-team** (`bobcats_player`, `bobcats_game`, …) → a proper `team` table
   with foreign keys. Fully multi-team from day one; adding a team is an `INSERT`.
2. **PHP interleaved with HTML** → API server + React client with a typed contract.

## Architecture

- **Monorepo** in this repo, pnpm workspaces:
  - `client` — React SPA
  - `server` — API
  - `shared` — zod schemas + TypeScript types shared by both
- **Server:** Hono on Node (TypeScript). Plain JSON REST API. Request/response
  validation with zod via `@hono/zod-validator`; the same schemas type the client.
- **Client:** Vite + React + TypeScript. React Router for navigation, TanStack Query
  for all server state (fetching, caching, invalidation after mutations).
- **Database:** Postgres, accessed with **raw parameterized SQL via `pg`**.
  - All queries confined to one data-access module per resource, so row typing
    happens in exactly one place.
  - Schema migrations with **node-pg-migrate** — no ad-hoc SQL files.
- **Dev environment:** Postgres in Docker Compose; pnpm; config via env vars
  (12-factor, so a later deploy is unblocked). Local-only for now — no hosting
  decisions made yet.
- **Data:** fresh start. No migration from the live MySQL database; a seed script
  creates a bobcats-style demo team with players and games.

## Schema

- **team** — `id`, `name`, `slug` (unique, used in URLs), `min_players`,
  `min_quota_players`, `quota_noun_singular` / `quota_noun_plural`
  (e.g. `"woman"` / `"women"` — both stored because the report needs both
  and plurals aren't derivable), `timezone` (IANA name).
  Teams are created via seed script or SQL only in v1 (no admin UI).
  The original's hardcoded `min_players = 7` / `min_females = 2` become these columns.
- **player** — `id`, `team_id` FK, `name`, `counts_toward_minimum` (boolean).
  This quota-eligibility flag replaces the original's `gender` column: it models what
  the league actually checks (does this player count toward the women/gender-minimum
  rule) without modeling gender identity. The auth milestone added
  `join_token` (unique), `join_token_revoked_at`, and `is_captain` — see
  [Auth design](#auth-design).
- **game** — `id`, `team_id` FK, `opponent_name` (nullable — `NULL` means bye week),
  `opponent_color` (nullable), `starts_at` (`timestamptz`).
  Times are true instants; the team's `timezone` is used for entry and display.
- **attendance** — `id`, `player_id` FK, `game_id` FK, `status` enum
  (`yes` / `no` / `not_sure`), unique on `(player_id, game_id)`.
  **Absence of a row means "hasn't responded."** Unlike the original, rows are *not*
  pre-created for every player × game; the schedule view LEFT JOINs the roster to
  render non-responders. This eliminates the original's insert-fanout on new
  players/games.
- **session** — `id` (random text, the cookie value), `player_id` FK,
  `created_at`, `last_seen_at`. Added by the auth milestone; see
  [Auth design](#auth-design).

## Routes (client)

Mirrors the original's team-at-a-path URLs:

- `/:teamSlug` — schedule (home). Past/future game sections, roster report per game,
  **inline attendance editing** (yes/no/not-sure controls on each player row; mutation +
  query invalidation replaces the original's separate `changeattendance.php` page).
- `/:teamSlug/games/:gameId` — single game with the same inline controls. This is the
  **shareable link** a captain texts the team ("set your status for Sunday").
- `/:teamSlug/players` — roster management (list, add/edit/delete players).
- `/:teamSlug/games` — game management (list, add/edit/delete games).

Player form: name + quota checkbox. Game form: opponent name, color, and a native
`datetime-local` input (replaces the six dropdowns; the better calendar UX comes
later). Deletes use confirm dialogs instead of confirmation pages. The
"show/hide past games" toggle persists in localStorage (was a cookie).

## API (server)

REST under `/api`, team-scoped by slug. Every team-scoped endpoint requires a
session cookie for that team (see [Auth design](#auth-design)); the lone route
outside `/api` is `GET /join/<token>`, the browser-facing cookie exchange.
Roughly:

- `GET /api/teams/:slug` — team with settings
- `GET /api/teams/:slug/me` — the signed-in player (backs the personal question)
- `GET /api/teams/:slug/games` — games with attendance + roster report data
- `GET /api/teams/:slug/games/:id` — single game (backs the shareable page)
- `POST/PUT/DELETE` on games and players
- `PUT /api/teams/:slug/games/:gameId/attendance/:playerId` — upsert status
- Captains only: `GET /api/teams/:slug/access` (each player's join link), plus
  `POST …/players/:id/regenerate-token` and `POST …/players/:id/revoke-token`

Exact shapes live as zod schemas in `shared`.

## UX fidelity

- **Visual design**: originally a faithful port of `legacy/bobcats/css/main.css`
  (green gradient, centered white card, purple links, color-coded statuses).
  Superseded before launch by the mobile-first redesign — see
  [`REDESIGN.md`](REDESIGN.md) for the settled look (the green and status
  colors survive, toned for 2026; the gradient and purple links don't).
- **The roster report keeps the original's grammar engine**: numbers as words,
  singular/plural handling, and the "we need **two** more players, **both** of whom
  must be women" constructions. The quota noun comes from the team's
  `quota_noun_singular`/`quota_noun_plural`, so the wording stays faithful for
  classic co-ed teams but works for any league rule. One sentence is necessarily
  reworded: the original counted both genders ("two women and five men, for a
  total of seven players"), which the quota flag can't express; it becomes
  "So far we have **seven** players, **two** of whom are women."
  This logic lives in `shared` or `server` as pure functions — it is the most
  unit-testable code in the app.
- Bye weeks render as in the original ("Bye week." with no roster).

## Testing

Full pyramid:

- **Unit (Vitest):** roster-report grammar engine, date/timezone handling.
- **API integration:** Hono endpoints against a real test Postgres (Docker).
- **E2E (Playwright), a few flows:** mark attendance inline, add a game, add a player —
  chosen because the spec is "behaves like the original," and e2e is how that's checked.

## Auth design

Settled in a second design interview (July 2026). The backend half was built
as its own milestone (July 2026); the UI arrives with the front-end push,
before any real deployment. Guiding constraint: the app's entire value
is being *lower-friction than email*, so every unit of auth friction spends the
product's reason to exist.

**Threat model:** the ex-insider. Rec teams churn every season; the data here is
precisely "where will this specific person be, and when." So revocation of one
person's access, without disturbing anyone else, is the non-negotiable
requirement. (Random discovery and targeted outsiders are covered for free by
anything that solves this.)

**Mechanism — per-player capability links exchanged for a cookie:**

- Each player has one active **join token** (long random string, e.g. 128-bit
  base64url), auto-generated when the player is created.
- The player's personal link is `/join/<token>`. Visiting it sets an httpOnly,
  Secure, SameSite=Lax **session cookie** and redirects to the team's normal,
  clean URLs. The token never appears in everyday URLs, so copy-pasting any
  page (including the shareable per-game links) leaks nothing.
- Links are **multi-use**: new phone or cleared cookies = tap your link again
  from your text history. Links reach players by the captain texting them —
  **no email infrastructure, no passwords, no accounts.**
- Sessions last **~1 year, rolling** (renewed on every visit): in practice you
  sign in once per device per season.
- Every team page and every `/api/teams/:slug/*` endpoint requires a session
  belonging to that team. Signed-out visitors see only a friendly wall:
  "Ask your captain for your link." Nothing about the team leaks. There is
  **no public demo**; the README shows the app with words/screenshots.

**Trust inside the wall — same as the original:** anyone with access can edit
anyone's attendance and manage games/players. Teammates fixing each other's
status was always a feature. The one thing gated harder is **access control
itself**: only captains see the manage-access page.

**Captains:** an `is_captain` boolean on player, managed by SQL only (like team
creation — it changes about once a season). The seed prints the first captain's
join link. Captains get a **manage-access page**: each player's current join
link (copyable for re-texting), plus regenerate and revoke. Regenerating or
revoking a token also kills that player's sessions; deleting a player cascades
everything.

**Token storage — plaintext, deliberately:** captains can always re-copy a
player's current link. Hashing would force regenerate-only UX, and a database
compromise of this app already exposes everything the tokens protect. Session
ids are random and stored likewise.

**The personal question (designed here; built with auth's UI in the
front-end push):** the one place the
UI does use the session's identity. The original `changeattendance.php` greeted
the player personally:

```php
<?php echo "<p>$player_name, will " .
      "you be coming to the game on " .
      "$game_date against $game_name at $game_time?</p>"; ?>
```

That question is revived wherever attendance is answerable, addressed to the
signed-in player with the yes/no/not-sure controls inline and preselected to
their current status — e.g. "Alice, will you be coming to the game on Sunday,
July 19 against the Wombats at 6:30 pm?":

- at the **top of the home/schedule page** (`/:teamSlug`), about the **next
  upcoming non-bye game** (omitted when there is none);
- at the **top of each single-game page** (`/:teamSlug/games/:id`), about
  **that game** (omitted for byes).

**Explicitly out of scope:** subs (they stay in the text-message layer, as
always); per-player edit enforcement; email delivery; public demo teams.
Because sessions map to players, the app always knows who is browsing even
though the rest of the UI doesn't use it — so highlighting your own row on the
schedule and per-player enforcement remain cheap future options.

**Schema additions (built):** `player.join_token` (unique),
`player.join_token_revoked_at`, `player.is_captain`, and a `session` table
(`id`, `player_id`, `created_at`, `last_seen_at`).

### Auth implementation notes (milestone 1, backend built July 2026)

The backend half is built; the UI (wall page, manage-access page, personal
question) waits for the front-end push milestone. Implementation decisions,
settled in a fourth interview:

- **Tokens & sessions:** join tokens are 128-bit `crypto.randomBytes`
  base64url; session ids 256-bit. Cookie `th_session`: httpOnly,
  SameSite=Lax, Path=/, Max-Age 1 year; `Secure` only when
  `NODE_ENV=production` (dev and e2e run over plain http on localhost).
- **Rolling renewal, throttled hourly:** validity = `last_seen_at` within
  365 days, checked on every request; the renewal write + re-issued cookie
  happen at most once an hour per session. Expired rows are pruned
  opportunistically on every `/join` hit — no scheduler.
- **Uniform 401, session-first:** any `/api/teams/:slug/*` request without a
  valid session *for that slug* gets the identical
  `401 {"error":"unauthorized"}` — signed out, expired, wrong team, and
  nonexistent team are indistinguishable, so slugs can't be enumerated. The
  wall page keys off the 401. A signed-in non-captain calling a captain
  endpoint gets `403 {"error":"forbidden"}` (inside the wall, honesty beats
  opacity).
- **Revoked tokens keep their row:** revoke stamps
  `player.join_token_revoked_at` (repeat revokes keep the first stamp);
  `/join` and the access list treat a stamped token as dead. Regenerate
  writes a fresh token and clears the stamp. Both kill the player's sessions
  in the same transaction.
- **Endpoints:** `GET /join/:token` lives *outside* `/api` (it's a browser
  navigation): valid → session cookie + 302 to `/:teamSlug`; invalid/revoked
  → 302 to `/?join=invalid` (constant `INVALID_JOIN_REDIRECT` in `shared`),
  so the wall can say "that link didn't work — ask your captain."
  `GET /api/teams/:slug/me` → `{ playerId, name, isCaptain }` (backs the
  personal question). Captains only: `GET /api/teams/:slug/access` (each
  player's current link, `joinToken: null` + `revokedAt` when revoked) and
  `POST /api/teams/:slug/players/:id/regenerate-token` / `…/revoke-token`.
  Shapes are `meSchema` / `playerAccessSchema` in `shared`.
- **Tests sign in by inserting session rows directly:** integration tests
  send the cookie header; e2e's global-setup writes a Playwright
  `storageState` file so every test browses as fixture-Alice. The dev seed
  prints captain Alison Bechdel's join link.

## Roadmap

Settled in a third design interview (July 2026). Sort key: **real users first**
— a specific team is waiting to adopt the app — with learning value breaking
ties. There is no hard date, so scope wasn't cut to meet one; but self-serve
signup was confirmed a non-blocker (the launch team's row is an `INSERT`).

**Pre-launch spine** (in order; each milestone is a commit boundary):

1. **Auth backend** — ✅ done (July 2026). Was shovel-ready with zero design
   dependency: migration
   (`player.join_token`, `player.is_captain`, `session` table), the
   `/join/<token>` cookie exchange, session middleware walling team pages and
   API, token regenerate/revoke endpoints, integration tests. Auth's UI waits
   for the redesign so it's built once.
2. **Mobile-first redesign (design phase)** — ✅ done (July 2026). Settled in
   its own design interview, run in parallel with milestone 1; recorded in
   the standalone [`REDESIGN.md`](REDESIGN.md), not here. Scope: the **full
   UX rethink** — visual redesign (green and status-color heritage kept,
   toned for 2026; gradient and purple links dropped), attendance controls
   designed for thumbs (a segmented Yes/No/Not-Sure control), and the
   calendar/date-picking ceiling set at "style the native input well" (no
   custom picker). Includes the **PWA shell** (manifest, icons, standalone
   display) so the team gets a home-screen icon from day one. Surfaced one
   unscoped need along the way — captains managing more than one team — see
   Parking lot.
3. **One front-end push** — every page built once in the new design language:
   the existing pages plus auth's UI (the friendly wall, the captains'
   manage-access page, the personal question at the top of home and
   single-game pages). Playwright suite updated to cover the wall and join
   flow.
4. **CI** — GitHub Actions running all three suites on push, before a real
   team depends on master.
5. **Deploy** — Railway, with **turtleherder.com pointed at it from day one**
   so the team's saved links (join links especially) never change. Before
   repointing: verify nobody still depends on the old PHP site there. Seed the
   real team; the captain onboards everyone by texting join links.

**Post-launch** (in order):

6. **Self-serve teams** — a public create-team flow: team row, first captain,
   and that captain's join link issued entirely through the UI. Supersedes
   "seed/SQL only" for team *creation*; later captain changes may stay SQL
   until this milestone decides otherwise. Brings the first spam/abuse
   considerations.
7. **Landing page + tip jar** — the polish pass on the public page:
   what-is-this copy plus the single tip-jar sentence and link (GitHub
   Sponsors or Ko-fi), per the constraints in the goal section.

**Parking lot** (explicitly unranked, not forgotten):

- **Push notifications** — deliberately unresolved. The captain's text *is*
  the notification layer, and it worked for a decade; automated nagging is
  the bells-and-whistles-ness this app exists to reject. Revisit only if a
  real captain says "I'm tired of texting reminders."
- **React Native / App Store app** — eventual follow-up, purely additive: a
  second client on the same API. The web app remains the permanent web
  experience; both coexist indefinitely, and universal links make already-
  texted join/game links open the native app. First-class push arrives here
  if push is ever wanted.
- **Multi-team captain switching** — surfaced during the redesign interview:
  a captain running more than one team has no way to switch between them in
  the UI (the schema has supported multi-team from day one; the client and
  session model assume one team per visit). Not scoped anywhere yet; revisit
  if a real captain actually runs multiple teams.

## Decision log (original design interview)

| Decision | Choice | Notes |
| --- | --- | --- |
| Team modeling | Full multi-team, `team` table | Fixes flaw #1 completely |
| Team admin UI | None in v1; seed/SQL only | Settings are columns from day one |
| Data migration | Fresh start + seed data | Old MySQL schema is trivial to migrate later if ever needed |
| Deployment | Local dev only, 12-factor config | Hosting decided later |
| Repo layout | pnpm workspaces monorepo | `client` / `server` / `shared` |
| Server framework | Hono | zod-native, best TS inference |
| DB access | Raw SQL via `pg` | With node-pg-migrate + per-resource data modules as guardrails |
| API shape | REST + shared zod schemas | Debuggable with curl; schemas type both sides |
| Frontend | Vite + TanStack Query | React Router, SPA |
| Gender modeling | `counts_toward_minimum` flag + quota noun (singular + plural) | Models the league rule, not identity |
| Attendance | Row = response; absence = no response | 3-state enum, unique (player, game) |
| Game times | `timestamptz` + team timezone | True instants, local display |
| Attendance UX | Inline on schedule **and** per-game shareable route | Replaces changeattendance.php |
| Date entry | Native `datetime-local` | Six dropdowns retired |
| Report copy | Original grammar engine, configurable quota noun | The app's soul, preserved |
| Styling | Superseded — see [`REDESIGN.md`](REDESIGN.md) | Mobile-first redesign (milestone 2) kept the green/status-color heritage, dropped the gradient and purple links |
| Testing | Unit + API integration + Playwright e2e | |
| Dev env | Docker Compose Postgres + pnpm | |
| Legacy PHP | Moved to `legacy/`, kept as reference spec | Delete whenever |

## Decision log (auth implementation interview)

| Decision | Choice | Notes |
| --- | --- | --- |
| Rolling renewal | Throttled: at most one `last_seen_at` write + cookie re-issue per hour | Vs. write-on-every-request; expiry up to an hour "early" on a 1-year window is meaningless |
| Session cleanup | Validity checked on read; expired rows deleted on every `/join` | No scheduler, table stays clean |
| Unauthorized contract | Uniform `401 {"error":"unauthorized"}`, session checked before team lookup | Signed-out / wrong team / unknown slug indistinguishable — no enumeration. Non-captain on captain endpoint: `403 {"error":"forbidden"}` |
| Viewer identity | Separate `GET /api/teams/:slug/me` | Keeps team schema auth-free; backs the personal question |
| Revoked-token modeling | Token kept + `join_token_revoked_at` stamp | Manage-access page can show *when*; regenerate clears the stamp |
| Captain API shape | `GET …/access` list + explicit `POST …/regenerate-token` / `…/revoke-token` verbs | `DELETE …/token` would misread as deleting the row |
| Invalid `/join` | 302 to `/?join=invalid` | Distinguishable but leak-free; wall can say "ask your captain for a fresh link" |
