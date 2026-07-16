# Turtleherder v2 — Design

A rewrite of the original PHP turtleherder as a React + Node app in TypeScript, backed by
Postgres. This document records the decisions made during the design interview
(July 2026) and is the spec for the first version. A second interview settled
the [auth design](#auth-design); a third the [roadmap](#roadmap) — the
priority order for everything after feature parity; a fourth the auth
backend's implementation details as that backend was built; a fifth settled
the mobile-first redesign's visual and UX direction, recorded in the
standalone [`REDESIGN.md`](REDESIGN.md) rather than here; a sixth settled
the front-end push's implementation details as it was built; a seventh the
[multi-team keyring](#multi-team-keyring-designed-july-2026-build-in-milestone-6)
— how one browser holds several teams; an eighth (a short one) the CI
workflow's open forks as it was built; a ninth the
[deploy](#deploy-designed-july-2026-build-in-milestone-5) (July 2026
throughout).

## Goal

A **feature-complete copy of the original app**, shipped for real use. The legacy PHP in
`legacy/` is the reference for behavior. Deliberately deferred to later versions:

- Authentication / access control UI — ✅ no longer deferred: the wall page,
  manage-access page, and personal question shipped with the front-end push
  (milestone 3, July 2026)
- Improved calendar/date picking beyond the platform default — resolved by
  the redesign: the ceiling is a well-styled native `datetime-local` input
  (shipped in milestone 3); a custom picker remains a possible future upgrade
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

All three levels (plus typecheck and build) run in GitHub Actions on every
master push and PR — see roadmap milestone 4 and the
[CI decision log](#decision-log-ci-interview). Locally, the suites assume
the Compose Postgres is up and read `TEST_DATABASE_URL` (defaulting to the
Compose `turtleherder_test` database).

## Auth design

Settled in a second design interview (July 2026). The backend half was built
as its own milestone (July 2026); the UI shipped with the front-end push
(milestone 3, July 2026). Guiding constraint: the app's entire value
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

**The personal question (designed here; built in the front-end push,
July 2026):** the one place the
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
question) was built in the front-end push milestone — see
[Front-end implementation notes](#front-end-implementation-notes-milestone-3-built-july-2026).
Implementation decisions, settled in a fourth interview:

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

### Front-end implementation notes (milestone 3, built July 2026)

The full client rebuild against [`REDESIGN.md`](REDESIGN.md), plus auth's UI
and the PWA shell. Implementation decisions, settled in a sixth interview:

- **Styling:** CSS Modules (Vite-native, zero new dependencies), one
  `.module.css` per component; REDESIGN.md's tokens live as CSS custom
  properties in `client/src/main.css` alongside base element styles. Fonts
  are self-hosted via `@fontsource` (Inter variable for body, Merriweather
  700 for headings) — no external requests, works as an installed PWA. Nav
  icons come from `lucide-react`.
- **The wall's client half:** `api.ts` throws a typed `ApiError` carrying
  the HTTP status; a global TanStack Query `QueryCache`/`MutationCache`
  `onError` listener catches a 401 from *any* query or mutation — first
  visit, expired session, or a captain revoking mid-browse — and
  hard-navigates to the wall so all client state starts clean. The bounce
  URL is `/?from=<slug>`, echoing the path the visitor themselves typed
  (leak-free), so the wall can explain rather than guess.
- **The wall page at `/`, four behaviors:** signed out → the minimal
  banner, no interactive elements, identical for every cause;
  `?join=invalid` → the "that link didn't work" variant; a **direct
  landing** with a working session (PWA launch — `start_url` is `/` — or a
  typed root URL) → auto-forward to the last-visited team, remembered as
  `lastTeamSlug` in localStorage (REDESIGN.md's "root redirects to team");
  **bounced** (`?from=`) while holding a session for a *different* team →
  no silent substitution — the banner plus a "you can only be signed into
  one team at a time" note echoing the typed slug, and a visible
  "Go to [team] →" link to the team the session does work for. That last
  case is a graceful patch for the parked multi-team future, not its
  answer (a real fix needs multi-identity sessions and a switcher).
- **Manage-access:** REDESIGN.md contradicts itself on the table
  breakpoint (its component section says ≥640px; its responsive section
  and decision log say ≥1024px) — resolved to **≥1024px** for the
  all-links-visible table, reveal-on-tap below. Regenerate and revoke
  both confirm first, since both kill the player's sessions.
- **Personal question card:** one deliberate deviation from REDESIGN.md —
  a 1px border was added, because the spec gives the card the same
  background as the page (`#f9fafb`) and "no borders", which together
  would make it invisible.
- **No service worker:** the PWA shell is manifest + icons + standalone
  display only, per REDESIGN.md's PWA section; the app is live-data and
  installability doesn't require one. The turtle icons (white silhouette
  on `#5ec942`, 512/192/180px + SVG favicon) are generated assets in
  `client/public/`.
- **E2e:** the suite grew to 13 tests. `auth.spec.ts` opts out of the
  shared `storageState` (browses signed out) to cover the wall, the
  invalid-join variant, and the join-token cookie exchange; captain flows
  (access page, regenerate, revoke) and the cross-team bounce ride along
  in `app.spec.ts` as Alice.

## Multi-team keyring (designed July 2026, build in milestone 6)

Settled in a seventh design interview (July 2026). The original app's decade
showed the need is real: people often play on two teams whose seasons
overlap (bocce and soccer), and the current session model is actively
confusing for them — tapping team B's join link signs you *out* of team A,
because `/join` replaces the session.

The insight that keeps join-link auth intact: a session was never "who you
are" — it is **what this browser has proven it holds**. The join link
doesn't have to mean "become this player and forget everything else"; it can
mean "add this key to the keyring." No accounts, no passwords, no email — 
still.

**Mechanism — the keyring session:**

- A session holds **many player identities**: `session.player_id` becomes a
  `session_player` join table (the migration maps existing sessions 1:1).
- `/join/<token>` **adds** that player to the browser's existing session
  (creating a session if there is none). One key per team per session: a
  link for a team the keyring already holds *replaces* that team's key, so
  `/me` stays unambiguous.
- One `th_session` cookie, unchanged. Middleware asks "does this session
  hold a player on *this* team?" — the uniform-401 contract is untouched.
- **One shared rolling clock:** `last_seen_at` stays on the session, so any
  visit to any team renews the whole keyring. A bocce-and-soccer player who
  lives on the soccer page all winter keeps their bocce key alive. (This is
  why cookie-per-team lost: per-team idle clocks make seasonal players
  re-tap.)
- **Revocation stays per-player:** regenerate/revoke detaches that player
  from every keyring holding it; keys for other teams are untouched. The
  ex-insider threat model is unchanged.
- **No person entity, ever.** A person on two teams is still two unrelated
  player rows that happen to sit on one keyring.

**Sign-out — the app's first:** keyrings accumulate. Tap your link on a
teammate's phone to answer the question, and that phone now holds two
people's keys, persistently (today's replace-on-join was accidentally
self-cleaning). So the switcher menu gains **Sign out**: one new endpoint
that deletes the session and clears the cookie — the whole keyring at once.

**Switcher UI:** the team name becomes the switcher — top of the sidebar on
desktop; mobile gains a tappable team-name header. When the keyring holds
more than one team, it opens a menu of them, plus sign-out. Single-team
users see no change.

**The wall's cross-team note generalizes:** milestone 3's "you can only be
signed into one team at a time" copy (true today) becomes "You're not
signed into “{slug}” on this device — use the join link that team's captain
sent you," with one link per keyring team instead of the single
"Go to [team] →".

**PWA landing:** the first PWA launch at `/` with a multi-team keyring
shows a **one-time team chooser**; the pick is remembered and thereafter
moves with any team visit (i.e., last-visited). Single-team keyrings
forward silently, as today.

**Rejected consciously:** real accounts / a person entity (ends "no
passwords, no email"); client-stored join tokens (moves credentials from
the httpOnly cookie into XSS-readable localStorage); cookie-per-team
(per-team idle expiry, plus cookies named after slugs break on slug
renames); unified cross-team views (each team page stays the whole world).

## Deploy (designed July 2026, build in milestone 5)

Settled in a ninth design interview (July 2026). The service topology was
already decided in code — `server/src/index.ts` serves the built client with
an SPA fallback in production — so the interview covered everything around
it.

- **Topology:** one Railway service (Hono serving both `/api` and
  `client/dist`) plus a Railway Postgres. US East, matching the team's
  timezone.
- **Server runtime:** the server ships as an **esbuild bundle** (the client
  already builds with Vite). Because no test suite exercises the bundle —
  they all run TypeScript source via tsx/vitest — CI gains a smoke check
  that boots the bundled server, so bundle-only breakage can't reach the
  team first.
- **Migrations:** Railway **pre-deploy command** (`pnpm db:migrate`) — runs
  against the production database before each new version goes live; a
  failed migration aborts the deploy instead of crash-looping it.
- **Deploy trigger:** auto-deploy on every master push, **gated on CI**
  (Railway's wait-for-CI): the two required GitHub checks must pass or the
  commit never deploys. GitHub Actions stays the verifier; Railway is only
  build-and-ship.
- **Config as code:** a `railway.json` in the repo holds build/start/
  pre-deploy commands; the dashboard holds only secrets and domains.
  Env: `DATABASE_URL` (service reference), `NODE_ENV=production` (flips the
  Secure cookie flag), `APP_ORIGIN` (so scripts print real join links).
- **Seeding production:** a new parameterized **create-team script**
  (`db:create-team`: name, slug, quota settings, captain) inserts one team
  plus its captain and prints the captain's join link — it never truncates,
  unlike the dev seed, and doubles as a dry run for milestone 7's
  self-serve flow. Production holds the real team **and a private bobcats
  sandbox** — unreachable without its join links, per the wall — for
  verifying deploys and demoing without touching real data.
- **DNS:** the domain **transfers from Route 53 to Namecheap** (a
  consolidation wanted independently); Namecheap's ALIAS record points the
  apex at Railway, which Route 53 cannot do (its alias records only target
  AWS services). `www` gets a plain CNAME; both are Railway custom domains;
  bare `turtleherder.com` is canonical. The transfer (~up to a week) is the
  long pole, so it starts first; everything else proceeds in parallel
  against the `.up.railway.app` URL, and cutover happens when it lands.
- **Old PHP site:** "live but surely unused" — retiring it is a judgment
  call, made deliberately: repointing DNS destroys nothing (the old host
  and its MySQL data are untouched), so it's reversible in minutes if a
  forgotten user surfaces.
- **Backups:** Railway's built-in Postgres backups, with one restore
  verified by hand. No extra machinery.
- **Cutover order:** deploy → verify on the Railway URL → create bobcats +
  the real team → transfer completes → ALIAS/CNAME → re-verify on
  turtleherder.com → the captain texts everyone their join links.

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
3. **One front-end push** — ✅ done (July 2026). Every page built once in
   the new design language: the existing pages plus auth's UI (the friendly
   wall, the captains' manage-access page, the personal question at the top
   of home and single-game pages) and the PWA shell. Playwright suite
   updated to cover the wall and join flow (13 tests). Implementation
   decisions in
   [Front-end implementation notes](#front-end-implementation-notes-milestone-3-built-july-2026).
4. **CI** — ✅ done (July 2026). GitHub Actions running typecheck, build,
   and all three suites on master pushes and PRs: two parallel jobs, each
   with its own Postgres service container (Actions can't mount the initdb
   script, so the service creates `turtleherder_test` directly via
   `POSTGRES_DB`). Node 24 pinned via `engines` + `.nvmrc`; Playwright
   traces are uploaded as an artifact on failure. Branch protection on
   master requires both jobs green to merge a PR; admin direct pushes
   bypass (a repo setting, not visible in the repo).
5. **Deploy** — Railway, with **turtleherder.com pointed at it from day one**
   so the team's saved links (join links especially) never change. Before
   repointing: verify nobody still depends on the old PHP site there. Seed the
   real team; the captain onboards everyone by texting join links.

**Post-launch** (in order):

6. **Multi-team keyring** — one browser holding several teams, designed in
   [its own section](#multi-team-keyring-designed-july-2026-build-in-milestone-6):
   the `session_player` join table, join-links-add-keys semantics, the
   team-name switcher, sign-out, and the wall/PWA updates. Slotted before
   self-serve so the keyring is in place before self-serve creation makes
   second teams common.
7. **Self-serve teams** — a public create-team flow: team row, first captain,
   and that captain's join link issued entirely through the UI. Supersedes
   "seed/SQL only" for team *creation*; later captain changes may stay SQL
   until this milestone decides otherwise. Brings the first spam/abuse
   considerations.
8. **Landing page + tip jar** — the polish pass on the public page:
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
- **Multi-team switching** — ✅ resolved (July 2026): promoted to milestone 6
  as the multi-team keyring, designed in
  [its own section](#multi-team-keyring-designed-july-2026-build-in-milestone-6).
  Stopped being hypothetical: the original app's users really did play on
  overlapping teams (bocce and soccer), and it's players, not just captains.

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

## Decision log (front-end push interview)

| Decision | Choice | Notes |
| --- | --- | --- |
| CSS tooling | CSS Modules + token custom properties | Vite-native, zero new deps; tokens global in `main.css`, scoping per component |
| Wall location | Bounce to `/` on 401 | One canonical wall URL — where dead join links already redirect |
| 401 detection | Global QueryCache/MutationCache listener + typed `ApiError` | Any 401 anywhere walls immediately, including mid-session revocation |
| Cross-team bounce | Banner + "one team at a time" note + visible link — never a silent forward | The note echoes the visitor's own typed slug; leak-free. Direct landings on `/` still auto-forward (PWA start URL) |
| Fonts | Self-hosted `@fontsource` Inter + Merriweather | No external requests; PWA-friendly |
| Nav icons | `lucide-react` | Designed set, tree-shakes to ~1–2KB per icon |
| Service worker | None | Manifest + icons + standalone only, per REDESIGN.md; app is live-data |
| Manage-access table breakpoint | ≥1024px | REDESIGN.md self-contradicts (640 vs 1024); its decision log and the responsive section say 1024 |

## Decision log (multi-team keyring interview)

| Decision | Choice | Notes |
| --- | --- | --- |
| Mechanism | Keyring session: `session_player` join table; a join link **adds** a key | One httpOnly cookie unchanged; per-player revocation intact; shared rolling clock renews every key on any use |
| Same-team re-tap | Replaces that team's key only | `/me` stays unambiguous per team |
| Shared devices | Whole-keyring sign-out — the app's first | Lives in the switcher menu; new endpoint deletes session + clears cookie |
| Switcher | The team name becomes the switcher | Menu when the keyring holds >1; mobile gains a team-name header; single-team UI unchanged |
| Cross-team wall | "Not signed into “{slug}” on this device" + one link per keyring team | Supersedes milestone 3's "one team at a time" copy when this ships |
| PWA landing | One-time chooser on first multi-team launch, then remembered | The anchor moves on any team visit (= last-visited thereafter) |
| Roadmap slot | Milestone 6: after deploy, before self-serve | Launch team ships sooner; keyring ready before second teams are common |
| Rejected | Accounts / person entity; client-stored tokens; cookie-per-team; unified cross-team views | The person is never modeled — only what a browser holds |

## Decision log (CI interview)

| Decision | Choice | Notes |
| --- | --- | --- |
| Node version | 24, pinned | Matches the dev machine and is Active LTS; recorded as `engines: >=24` plus `.nvmrc`, which the workflow reads via `node-version-file` — one source of truth |
| Triggers | Push to master + all PRs | The conventional shape; avoids duplicate push/PR runs. Known cost: a feature branch gets no CI until a PR opens for it |
| Scope beyond the suites | typecheck + build included | Tests consume TypeScript source directly, so nothing else exercises `pnpm build` until deploy (milestone 5) — CI is the only pre-launch place build breakage can surface |
| Branch protection | Required checks (both jobs) to merge a PR; admin enforcement off | Direct admin pushes bypass, preserving the push-to-master workflow. A GitHub repo setting, not visible in the repo |
| Job layout (as-built) | Two parallel jobs, each with its own `postgres:17-alpine` service | Integration and e2e both truncate/reseed `turtleherder_test`; isolated databases beat sequencing. The service gets `POSTGRES_DB` directly because service containers start before checkout and can't mount `docker/create-test-db.sql` |

## Decision log (deploy interview)

| Decision | Choice | Notes |
| --- | --- | --- |
| Topology | One Railway service + Railway Postgres | Pre-decided in code: Hono serves `client/dist` with SPA fallback |
| Server runtime | esbuild bundle | Chosen over tsx-on-source; because no suite exercises the bundle, CI gains a boot-the-bundle smoke check |
| Migrations | Railway pre-deploy command | Failed migration aborts the deploy instead of crash-looping the service |
| Deploy trigger | Master push, gated on CI green | Railway wait-for-CI consumes the two required GitHub checks; Actions verifies, Railway ships |
| Service config | `railway.json` in the repo | Dashboard holds only secrets + domains |
| Production seeding | Parameterized `db:create-team` script | Never truncates; prints the captain's join link; dry run for milestone 7 self-serve |
| Demo team in prod | Yes — private bobcats sandbox | Join-link-gated, invisible otherwise; deploy verification never touches real data |
| DNS | Transfer Route 53 → Namecheap; ALIAS at apex | Route 53 can't point an apex at Railway; the registrar consolidation was wanted anyway. Transfer starts first (long pole) |
| Old PHP site | Judgment call — no log audit | Repointing DNS destroys nothing and reverses in minutes |
| Backups | Railway built-in, restore verified once | No extra machinery for a one-team app |
