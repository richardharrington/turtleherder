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
  [Auth design](#auth-design). The flag is **mutable and never historized** —
  a change applies everywhere at once, including past games, which is safe
  only because past games don't report quota at all; see
  [Roster history](#roster-history-designed-july-2026-build-in-milestone-55).
  A player row is a `(person, team)` pair and is a **stable identity**: it
  outlives any single stretch of membership, so a player who leaves and
  rejoins keeps one row, one join token, and one unbroken history.
- **roster_membership** — `id`, `player_id` FK, `joined_at`, `left_at`
  (nullable; `NULL` = currently on the team). One row per **stint**; a
  player who leaves and rejoins has two. No `team_id` — `player.team_id`
  stays the single source of truth for team scoping, so every existing
  team-scoped query and auth guard is untouched. Partial unique index on
  `player_id WHERE left_at IS NULL` (at most one open stint). Added in
  milestone 5.5 to fix the roster-history bug inherited from the original;
  see [Roster history](#roster-history-designed-july-2026-build-in-milestone-55).
- **game** — `id`, `team_id` FK, `opponent_name` (nullable — `NULL` means bye week),
  `opponent_color` (nullable), `starts_at` (`timestamptz`).
  Times are true instants; the team's `timezone` is used for entry and display.
- **attendance** — `id`, `player_id` FK, `game_id` FK, `status` enum
  (`yes` / `no` / `not_sure`), unique on `(player_id, game_id)`.
  **Absence of a row means "hasn't responded."** Unlike the original, rows are *not*
  pre-created for every player × game; the schedule view LEFT JOINs the roster to
  render non-responders. This eliminates the original's insert-fanout on new
  players/games. Milestone 5.5 added two rules: writes are **rejected after
  `starts_at + 24h`** (a played game's record settles), and when a player's
  stint closes, their rows for games the stint no longer covers are deleted
  in the same transaction. Both are explained in
  [Roster history](#roster-history-designed-july-2026-build-in-milestone-55).
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

**Milestone 5.5 amends this.** Removing a player used to be a hard `DELETE`,
which cut access as a side effect of the row disappearing. Once removal became
a soft close, that side effect vanished — a removed player would have kept a
working link and a live session, which is precisely the ex-insider this threat
model exists to stop. So `/join/<token>` and the session wall are now gated on
an **open roster stint** as well as a valid session, and closing a stint
deletes that player's sessions. The token itself is left intact and inert; see
[Roster history](#roster-history-designed-july-2026-build-in-milestone-55) for
why `join_token_revoked_at` is deliberately *not* reused to express this.

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

**Amended by milestone 5.5 — read before building this.** 5.5 shipped first
and changed three things this section assumes. See
[Roster history](#roster-history-designed-july-2026-build-in-milestone-55).

- **"Delete that player's sessions" must become "detach that player's key."**
  Two places run `DELETE FROM session WHERE player_id = $1`: the pre-existing
  one in `updateTokenAndKillSessions` (`access.ts:104`, on regenerate/revoke)
  and the one 5.5 adds to the stint-close path in `players.ts` — needed there
  because soft close no longer deletes the `player` row, so the FK cascade
  that used to cut access silently stops happening.

  Dropping `session.player_id` makes both fail loudly rather than misbehave,
  which is the good news. The trap is the rewrite. The faithful-looking
  translation is **wrong**:

  ```sql
  -- WRONG: signs the browser out of every team on the keyring
  DELETE FROM session
   WHERE id IN (SELECT session_id FROM session_player WHERE player_id = $1);
  ```

  ```sql
  -- RIGHT: removes only this team's key
  DELETE FROM session_player WHERE player_id = $1;
  ```

  The first contradicts "revocation stays per-player… keys for other teams are
  untouched" above, and it reads like a correct port of the old behavior.
- **The middleware question gains a clause.** "Does this session hold a
  player on *this* team?" becomes "…a player **with an open roster stint** on
  this team?" Without it a departed player's key still passes the wall.
- **`/join` is no longer purely additive.** It must refuse to add a key for a
  player with no open stint, returning the distinct `?join=departed` response
  rather than the invalid-token one.
- **The wall's cross-team copy gains a third case.** This section rewrites the
  wall for keyrings ("not signed into {slug}… use the join link that team's
  captain sent you"); 5.5 adds "you're no longer on this roster," which is a
  different message with a different remedy. Both have to coexist.
- **Detaching on departure also keeps the switcher honest.** A key for a team
  the player has left would otherwise sit in the switcher menu and the PWA
  chooser, bouncing to the wall when picked. Detach removes the entry, so
  this needs no separate filtering — one more reason detach is the right verb.
- **No conflict with "no person entity."** `roster_membership` has no
  `team_id` and hangs off a per-team `player` row, so a person on two teams
  is still two unrelated players with independent stints. It looks like
  tension; it isn't.

**Amended by milestone 5.8 — read this too.** 5.8 also shipped before the
keyring and touched the same file. See
[Design refinement](#design-refinement-designed-july-2026-build-in-milestone-58).

- **`access.ts`'s token-validation function changed shape and name.**
  `findPlayerByJoinToken` (read-only) became `exchangeJoinToken`, which
  validates the token *and* stamps `player.join_token_used_at` in one
  UPDATE keyed on the token value — so a stale join racing a regeneration
  can't mark the replacement token. `/join`'s call site in `app.ts` looks
  slightly different, but the session-creation step right after it
  (`createSession(found.playerId)`) is untouched. The keyring's planned
  rewrite of that step — "add this key to the existing session, creating
  one if there is none" — drops in after `exchangeJoinToken` exactly as it
  would have after the old function: usage marking is atomic with token
  validation, not with session creation, so it doesn't care how many
  sessions or keys a browser ends up holding.
- **`updateTokenAndKillSessions` (the shared regenerate/revoke helper) is
  otherwise unchanged.** The 5.5 guidance above — `DELETE FROM
  session_player WHERE player_id = $1`, never `session` — still applies
  verbatim to its one call site.
- **`PlayerAccess` and `getAccessList`'s query gained `join_token_used_at`.**
  Any keyring-era rewrite of the access list or its SQL needs to carry that
  column forward, not restore the pre-5.8 shape from memory.
- **No conflict with "no person entity" here either.**
  `join_token_used_at` is scoped to `player`, exactly like `join_token` and
  `join_token_revoked_at` before it: a person holding keys on two teams
  still has two independent usage stamps on two independent rows.

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
  self-serve flow. Production holds **the real team and nothing else**: a
  sandbox for verifying a deploy or demoing is one `db:create-team` away
  whenever one is wanted, so no standing demo data has to be kept alive or
  explained. Deploy verification uses a throwaway team from that same
  script, dropped afterward, so it still never touches real data.
- **DNS:** the domain **transfers from Route 53 to Namecheap** (a
  consolidation wanted independently); Namecheap's ALIAS record points the
  apex at Railway, which Route 53 cannot do (its alias records only target
  AWS services). `www` gets a plain CNAME; both are Railway custom domains;
  bare `turtleherder.com` is canonical, enforced by a 301 in the app itself
  (Railway has no redirect feature, and a registrar "URL redirect record"
  isn't DNS at all — it hands a slice of the site to Namecheap's web server
  and needs its own cert). The redirect matches only the `www` host derived
  from `APP_ORIGIN`, never "any non-canonical host": Railway's healthchecks
  arrive with their own `Host`, and 301ing those would fail the deploy. The
  transfer (~up to a week) is the long pole, so it starts first; everything
  else proceeds in parallel against the `.up.railway.app` URL, and cutover
  happens when it lands.
- **Old PHP site:** "live but surely unused" — retiring it is a judgment
  call, made deliberately: repointing DNS destroys nothing (the old host
  and its MySQL data are untouched), so it's reversible in minutes if a
  forgotten user surfaces.
- **Backups:** deferred at build time (July 2026). The plan was Railway's
  built-in Postgres backups with one restore verified by hand — but they
  require Railway Pro ($20/mo), and the launch is a single team whose entire
  state is re-creatable from `db:create-team`. Not worth a standing bill
  before there's any revenue. **Revisit the moment there's a second team or a
  tip coming in** — at that point the data is no longer trivially
  reconstructible and Pro is likely wanted anyway. Accepted risk until then: a
  Postgres failure loses the one team, who re-adds their roster.
- **Cutover order:** deploy → verify on the Railway URL → create the real
  team → transfer completes → ALIAS/CNAME → re-verify on turtleherder.com →
  the captain texts everyone their join links.

## Roster history (designed July 2026, build in milestone 5.5)

Settled in a tenth design interview (July 2026), against a bug inherited
whole from the original: **every game showed the roster as it is now.**
`legacy/bobcats/index.php:328` calls one `printgame()` for past and future
alike, and the port reproduced it faithfully at `games.ts:70` —
`JOIN player p ON p.team_id = g.team_id`, i.e. every current player joined to
every game the team ever played. If A, B and C play on January 1, then A
leaves and D joins, the January 1 game retroactively claims D was there
(with no response recorded) and forgets A entirely. Worse, `deletePlayer`
hard-deleted the row and `attendance.player_id` cascaded, so A's January 1
"yes" wasn't merely hidden — it was destroyed.

**The fix is to model membership as intervals and derive each game's roster
from them.**

- **Stints, not flags.** `roster_membership` holds `(player_id, joined_at,
  left_at)`. A game's roster is every stint where
  `joined_at <= g.starts_at AND (left_at IS NULL OR left_at > g.starts_at)`.
  Dates directly on `player` would have expressed the same predicate — the
  membership table exists for exactly one reason, **multiple stints**. A
  seasonal league has people who sit out a season and return; under
  dates-on-player, a rejoin either erases the gap (reintroducing this very
  bug for that window) or forks the player into a second row with a second
  join token and split history.
- **Strict derivation — never a union with `attendance`.** An earlier draft
  rendered the roster as members-at-`starts_at` *plus* anyone holding an
  attendance row, to protect responses orphaned by a backdated `left_at`.
  That case is unreachable (nothing writes `left_at` to anything but
  `now()`), and the union breaks a routine one: a player who RSVPs "yes" to
  a June game and quits in March would appear on the June card as "will be
  playing," months after leaving.
- **Departure closes a stint and prunes forward RSVPs.** Removing a player
  sets `left_at = now()` and, in the same transaction, deletes their
  attendance rows for games where `starts_at >= left_at` — **the exact
  complement of the roster predicate**, so nothing is orphaned and nothing
  that would still render is destroyed. Only unplayed games are touched;
  history is unreachable by construction. A rejoining player therefore comes
  back as "hasn't responded," which is the honest state and matches the
  schema's own "absence of a row" rule.
- **Deleting a player is no longer how you remove one.** The normal path
  soft-closes the stint. A separate captain-only **purge** hard-deletes the
  row, and **refuses when any attendance row exists** — its purpose is the
  typo'd player who never played, and the guard makes the destructive path
  structurally unable to destroy history. If someone ever genuinely needs to
  erase a real member, that should be a conversation, not a button.
- **Departed players stay visible, and rejoining is a real route.** The
  players page grows a collapsed **"Former players"** list below the roster
  (the same show/hide pattern as past games), each row showing when they left
  and an **"Add back"** that opens a *new stint on the existing player row*.
  Without this, multi-stint is unreachable: `createPlayer` only ever makes a
  new `player`, so a captain re-adding someone next season would produce a
  second row, a second token, and history stranded on the first — exactly
  what choosing a stint table over dates-on-player was meant to prevent. It
  also makes an accidental removal visible and reversible, which the old hard
  delete never was.
- **Departure cuts access without killing the link.** Closing a stint deletes
  that player's sessions, and `/join/<token>` plus the session wall are gated
  on an **open stint**. A departed player gets a **distinct** response —
  `302 /?join=departed`, and the wall says "You're no longer on the {team}
  roster. If that's a mistake, ask your captain to add you back." This is a
  deliberate exception to the uniform-401 contract, which exists to prevent
  **enumeration**: signed-out, wrong-team, and unknown-slug look alike so
  nobody can probe which teams exist. A valid-but-departed token is a 128-bit
  secret, so only the person it was issued to ever sees this message, and it
  tells them nothing they don't know. The alternative traps them in a loop —
  the generic "ask your captain for a fresh link" is advice that cannot work,
  since the gate is the stint and not the token, so a captain could
  regenerate forever with no effect. Invalid tokens keep today's copy.
  The token row itself is left untouched, so "Add back" revives their
  original magic link and no one has to be re-texted. Crucially,
  `join_token_revoked_at` is **not** reused for this: it means "a captain
  deliberately killed this link" and nothing else. Overloading it would let a
  rejoin silently un-revoke a link that was killed for cause — a captain
  revokes a lost phone's link in March, the player leaves in April and returns
  in September, and clearing the stamp puts the compromised link back in play.
  `getAccessList` scopes to active players for the same reason: a departed
  player's live join link has no business on the manage-access page.
- **A team always has at least one active captain.** Removing, purging, or
  (if it ever ships) demoting the last remaining captain is **refused** —
  `is_captain` lives on `player`, so without this guard an accidental removal
  of a solo captain locks the team out of manage-access permanently, and the
  new "Add back" route is itself behind that page. The invariant is stated as
  "≥ 1 active captain per team" rather than "can't remove a captain", so it
  covers a future demote path for free. When a team genuinely needs its last
  captain gone, that is a **support request handled in SQL** — not a button,
  for the same reason purge refuses on history.
- **Backfill: one stint per existing player, `joined_at = '-infinity'`.**
  Join dates were never recorded, and inventing plausible ones would
  fabricate history; `-infinity` says "unknown, effectively always" and needs
  no special-casing, since `joined_at <= g.starts_at` handles it directly.
  Every existing player stays on every existing game — today's behavior,
  preserved for existing data. Safe because production holds one team,
  fully re-creatable from `db:create-team` (see the Backups decision).

**Past games become a different rendering, not the same one.** The report at
`report.ts` is written in anticipatory voice — "So far we have **seven**
players… we need **two** more" — which was already wrong on a game played in
March, independent of any roster question. So `GameCard` branches:

- **Attendance locks at `starts_at + 24h`**, one named constant, enforced
  server-side in `setAttendance` and reflected in the client controls. A
  grace period rather than `starts_at` itself, so someone who marked "not
  sure" and then played can still fix it; uniform 24h rather than
  end-of-day-in-team-timezone, which would hand a 10am game fourteen hours
  and a 9pm game three. No captain override — cheap to add later, since
  `is_captain` already exists.
- **The past report drops the quota clause entirely** and moves to past
  tense: "**Seven** players confirmed they were playing." "Confirmed" is
  doing deliberate work — the lock means a game where four played but two
  forgot to tap reads "**Two**" forever, so the sentence reports what was
  *recorded*, not who was there. Non-responders read "didn't respond."
- **Consequently `counts_toward_minimum` never needs historizing.** This was
  the sharpest question of the interview, because the flag can change for a
  real reason — a player transitions, and their quota eligibility changes
  with them. Freezing a per-game tally would have permanently embedded a
  prior categorization in the record; historizing per stint would have kept
  a per-player history of it, partly undoing this file's original decision to
  model the league rule and not identity. Dropping quota from past games
  dissolves both: the flag is read only for upcoming games, so there is
  nothing to freeze, nothing to drift, and no stale categorization retained
  anywhere. The grammar engine keeps its full voice where it means something.

**Rejected consciously:** a `game_id` FK on `player` (the intuitive first
reach — it forces one player row per game, so `attendance.player_id` stops
identifying a person); stored `(game_id, player_id)` roster snapshots
(reintroduces exactly the insert-fanout the Schema section eliminated for
`attendance`); a frozen per-game quota tally (needs a freeze point the app
has no notion of, and would sit contradicting the live roster above it);
`attendance.responded_at` to scope responses to the stint that earned them
(a whole column to compensate for keeping rows that pruning removes anyway);
`team_id` on `roster_membership` (two sources of truth for the thing this fix
exists to give one); an exclusion constraint over `tstzrange` (no UI writes
arbitrary stint dates, so overlapping *closed* stints aren't reachable — the
partial unique index catches the only realistic bug).

## Design overhaul (designed July 19 2026, build in milestone 5.75)

Settled in an eighth design interview and shipped in July 2026. Milestone
2's mobile-first design (`REDESIGN.md`) shipped in milestone 3 and **didn't
work out UX-wise**: the
schedule page led with a giant personal-question card, then gave every
player a ~150px three-button answer widget, so a full roster was several
screens of buttons and the state of the game — who's in, who's out, are we
at quorum — was nowhere. The legacy site, for all its 2010 clunk, was a
*report* you could scan in two seconds. This overhaul restores the legacy
information architecture with modern styling. Functionality, backend, PWA
shell, and routes are all kept; `REDESIGN.md`'s visual and interaction
specs are superseded (the file carries a banner saying so).

**Governing principle:** the schedule page is a **shared scoreboard, not a
survey form**. Everyone — captain or not — sees the same dense view;
role changes what actions are available, never what's visible. Answering
is edit-on-demand, not the page's default posture.

### Schedule page (phone-first)

- **Dense rows**: one line per player — small colored status dot, name
  (semibold), status phrase in neutral muted text ("will be playing",
  "isn't sure", "hasn't responded"), subtle chevron. Status colors:
  green yes / red no / orange not-sure / grey outline no-response. The
  words never carry the color; the dot does.
- **Row expansion**: tapping the row (phone; desktop also gets an explicit
  edit affordance) expands it in place. **One row open at a time** —
  opening one closes another. Expansion contains a short question plus
  three small buttons. The question is direct-address on your own row —
  "Bob, will you be playing?" — and third-person elsewhere: "Will Bob be
  playing?" (an echo of the legacy sentence's ceremony at 10% of the
  size).
- **Sticky game heading**: each game's heading (date · time · opponent)
  pins to the viewport top while scrolled inside that game's card, so the
  question's subject is always on screen — this is what lets the
  expansion question drop the legacy sentence's full restatement of
  date/opponent/time.
- **Answer buttons**: always semantically tinted (green Yes / red No /
  orange Not sure — tinted background + colored border/text at rest),
  solid fill when selected. Fixes milestone 3's everything-turns-green.
  On tap: selected state shows for a beat (~500ms), then the row
  auto-collapses; lasting feedback is the row's dot/phrase and the
  summary updating.
- **Roster report at the top of the card**, before the roster list — the
  answer before the detail. Grammar engine (`shared/src/report.ts`)
  output unchanged; only placement and styling change.
- **Compact status strip** at the top of the page: one small line —
  "You: no response yet for Saturday →" — that jumps to and expands your
  row in the next non-bye future game (same target the old
  personal-question card had; omitted when none). It **persists after
  answering** as a status readout ("You: playing Saturday ✓") and
  permanent one-tap path to change. This is the entire replacement for
  milestone 3's giant question card.
- **Past games** (attendance-locked since 5.5): collapsed to one line
  each — "Sun, Mar 7 vs Mad Max — 5 confirmed attendance" — expandable on
  tap to the full locked roster in past tense. Wording stays honest to
  the attendance lock: *confirmed*, never "played". Behind the existing
  past/future toggle (localStorage persistence unchanged).
- **Bye weeks**: "Bye week." rendering preserved, no roster.
- **Desktop**: same stacked cards in a single centered column (~640–720px)
  next to the sidebar. No multi-column game grid.
- The **single-game page** gets the same card treatment; its old
  personal-question card is likewise replaced by the strip + row pattern.

### Color

- **Green page, white cards**: the page background returns to green
  (flat or subtle gradient, descended from legacy `#b4dd90 → #83bf56`);
  content sits on white cards. Green is ambient, not decorative.
- **Borders**: the page/card contrast does the separating; borders stay
  minimal (hairlines within cards). Defined borders only where a surface
  sits on white.
- **Dark mode: follow the system** via `prefers-color-scheme`, no toggle
  UI. The dark palette needs real tuning during the build — neutral dark
  surfaces with green as accent; the interview's sketch (olive-tinted
  cards) was explicitly rejected by Richard as not good enough.
- Exact token values are a build-time concern; the interview's light
  sketch (page `#9ecb74→#7fb254`, ink `#22301c`, statuses `#2e8b2e` /
  `#c23c2e` / `#d9891f` / `#8b9284`) is a starting point, not a spec.

### Type

- **Body/UI**: humanist system stack —
  `Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", sans-serif`.
  No downloaded fonts: drop the Inter bundle and Merriweather (the serif
  headings are gone entirely).
- **Headings**: same family, weight 800 with tightened letter-spacing
  (~-0.025em). (Apple ships Seravek only to Bold, so 800 clamps/synthesizes
  there; the tight spacing is the visible cue on Apple devices.)

### Other surfaces

- **Nav**: structure unchanged (bottom tab bar on phone, sidebar on
  desktop; Access gated to captains) — restyled to the new palette/type.
  The keyring switcher (milestone 6) still lands in this structure.
- **Manage pages** (players, games + forms) and **access page**: phone
  layouts stay primary but each gets a **distinct desktop treatment** —
  these lists are table-shaped, so desktop renders them as real tables.
  Access keeps mobile tuned for the one-off "text this player their link
  now" flow.
- **Wall/chooser**: phone-first, restyled only.
- **Player form**: the quota checkbox is labeled with the category noun
  plus a helper line stating the team's rule — "Woman — the league
  requires at least two on the field" — replacing "Counts toward the
  women minimum". (On a hypothetical max-men team the same pattern reads
  "Man — the league allows at most five on the field at once".)

### Design-overhaul implementation notes (milestone 5.75, built July 2026)

The overhaul shipped as client-only work; `server/` and `shared/` were not
changed. Build-time choices and learnings:

- **As-built palette:** light mode uses a `#a8d889 → #78b75a` page gradient,
  white cards, and `#1d291a` ink. Status colors are `#24783a` yes,
  `#b93632` no, `#9a5a00` not-sure, and `#687166` no-response. Dark mode
  uses neutral `#1b201c` cards over a dark-green ambient page
  (`#19391f → #102719`), with lighter green only as accent — no olive card
  tint. Resting answer controls use separate semantic tints; selected
  controls use solid status color. The manifest and HTML theme color moved
  to the page green (`#78b75a`), while the existing PWA icon artwork stayed
  unchanged.
- **Fonts were removed rather than merely unused.** The Inter and
  Merriweather imports, packages, and lockfile entries are gone. Both body
  and headings use the settled humanist stack; headings are weight 800 with
  `-0.025em` tracking.
- **Sticky-heading mechanics:** each heading is `position: sticky; top: 0`
  inside its own game card, so the card's containing block naturally ends
  the pin. The old sticky past-games toggle had to become an ordinary
  in-flow control: two unrelated elements competing for `top: 0` obscured
  the game context, and the game heading is the one this design requires to
  remain visible.
- **Expansion state lives at page level**, keyed by `(gameId, playerId)`,
  which makes the one-open-row invariant apply across every card rather
  than merely within one game. The status strip sets that key and then
  smooth-scrolls the resulting row to the center of the viewport. The same
  mechanism is shared by the schedule and single-game pages.
- **The confirmation beat starts after a successful write**, not on initial
  tap. The chosen button remains solid while the mutation and query refresh
  complete, then a 500ms timer collapses the row. A failed write leaves the
  editor open and restores the server value, so an error cannot masquerade
  as a successful auto-collapse. The timer only closes the row it belongs
  to; it will not close a different row opened in the meantime.
- **Only locked past games use the collapsed one-liner.** A game in the
  milestone 5.5 24-hour grace window is already past-tense but remains fully
  expanded and editable. This preserves the explicit purpose of that grace
  period. Locked cards own their expanded/collapsed state locally and can be
  collapsed again after inspection; a locked game on the single-game route
  gets the same initial one-line treatment as it does on the schedule.
- **Responsive table breakpoint is 1024px.** Players, former players, games,
  and access use semantic `<table>` markup at desktop widths and retain the
  touch-oriented list/reveal flow below it. The schedule remains a single
  centered column capped at 720px beside the sidebar.
- The obsolete giant personal-question component was deleted rather than
  left as dead UI. Playwright coverage now checks strip jump-and-expand,
  the one-row invariant, successful-answer collapse and status
  refresh, and locked-past expansion. The full 13-test end-to-end suite,
  unit/integration tests, typecheck, and production build passed after the
  change.

### Deferred: the coed-rules cluster (grill part 2)

How the quota/coed rule is **stored** (typed rule object vs bare columns),
**calculated** (shorthanded model, min-to-start vs field size), and
**displayed** (report grammar, percent-rule extensibility) was deliberately
split out mid-interview — it's backend-touching logic work, not styling.
With 5.75 shipped, that second grill session is now unblocked; its roadmap
slot is decided there. Facts already established for that session:

- **Legacy analysis** (`legacy/bobcats/index.php:171-251`): two hardcoded
  minimums, `$min_players=7`, `$min_females=2`; `$females_needed`
  dominates `$players_needed` when larger. **No maximum of any kind** (no
  max total/men/women), no shorthanded logic — a stray comment names
  `max_players` as future user input but no such variable exists.
  Richard's memory of "backend computed max-men, UI displayed
  min-women-shorthanded" is not borne out; both halves were plain hard
  minimums. The new `shared/src/report.ts` is a faithful generalized port
  of the same model.
- **NY league survey** (Richard, July 2026): rules come in three
  statements — (1) max men on field, (2) min women on field, (3) min
  women *or play shorthanded*. (1) ≡ (3) mathematically (max-men =
  field-size − min-women, playing down as women fall short); many
  leagues stating (2) probably practice (3). All surveyed leagues say
  "women"/"females". Wrinkles: goalkeeper often excluded ("field
  players"); some leagues have min-to-start distinct from field size
  ("full team is 7, minimum 5 to start"); NYC Footy has percentage rules
  (50/50, female-majority FLIP).
- **Maximums are on-field-at-once rules, not attendance caps** — more
  Yeses than field spots means healthy sub rotation. Never block an
  answer; messaging must not imply anyone should stay home.
- Provisional choices made *before* the survey reframed the problem —
  the "small configurable kit", dropping maxTotal, saying nothing
  over-max — are **void**, to be re-decided in part 2. The
  player-checkbox relabel above stands regardless of model outcome.
- Config UI for any of this waits for self-serve (milestone 7); until
  then teams are populated by `db:create-team`, so part 2's scope is
  schema/script shape + calculation + display only.

### Decision log (design overhaul interview)

| Decision | Choice | Notes |
| --- | --- | --- |
| Page's stance toward visitors | Shared scoreboard, not survey form | Same density for captains and players; role gates actions only |
| Platform priority | Schedule & wall phone-first; manage + access pages distinct desktop layouts | Desktop = tables for list pages |
| Identity use | Compact status strip, persists after answering | Chosen over auto-expand / highlight / nothing |
| Row edit trigger | Whole row on phone; explicit affordance on desktop | One row open at a time |
| Expansion content | Sticky game heading + short question + small buttons | "Bob, will you be playing?" (self) / "Will Bob be playing?" (others); full legacy sentence retired |
| Report placement | Top of game card | Answer before detail |
| Row status rendering | Colored dot + neutral text | Words don't carry color |
| Button semantics | Always tinted green/red/orange; solid when selected | Fixes "No turns green"; Claude preferred selected-only color, overruled |
| After answering | ~500ms confirm, then auto-collapse | Row dot/phrase is the lasting feedback |
| Past games | One-line collapsed, expandable | "5 confirmed attendance" — honest about the lock |
| Palette | Green page, white cards | Borders minimal, contrast separates |
| Dark mode | Follow system, no toggle | Dark palette to be re-tuned in build; olive sketch rejected |
| Body font | Humanist system stack | Chosen over system-ui (Claude's pick), Inter, Verdana — compared via live artifact |
| Headings | Same family, 800, tight kerning | Apple clamps to Bold; spacing is the visible cue |
| Nav | Keep structure, restyle | Keyring switcher unaffected |
| Desktop schedule | Single centered column | Two-column grid rejected |
| Quota checkbox | Noun + rule helper text | Stands independent of rules-model outcome |
| Coed rules model | **Deferred to grill part 2** | Pre-survey choices void; facts recorded above |
| Docs | This section + `handoffs/design-overhaul.md`; REDESIGN.md banner | |
| Roadmap slot | 5.75, before keyring | Fractional per the 5.5 precedent |

## Design refinement (designed July 2026, build in milestone 5.8)

A live visual review of milestone 5.75 found that its schedule had recovered
most of the legacy PHP site's information density, but the management pages
still repeated large action buttons on every row, attendance state remained
too easy to miss, and several pieces of page chrome were heavier than the
data they served. The legacy PHP site informed this review only as a source
of ideas; it is not an implementation to preserve and imposes no
compatibility constraints.

**Governing principle:** data stays visible and actions stay quiet until the
row that owns them is opened. The expandable-row language introduced on the
schedule now applies consistently across the app.

This milestone is primarily client design work, with one deliberate backend
exception: durable tracking of whether the current join token has ever been
redeemed. It does not reopen the deferred coed-rules model.

### Schedule refinement

- The page title becomes **“{Team} Schedule”** and the future section becomes
  **“Upcoming games.”** The personal status control remains full-width on
  mobile but shrinks to content width on desktop. It uses an unambiguous
  abbreviated date (`Wed, Jul 22`, adding the year only outside the current
  calendar year), and only its status phrase carries semantic color:
  “You: **Playing** Wed, Jul 22 ✓”, “You: **No response** for Sat, Jul 25 →”.
- Past games move below all upcoming games. Their disclosure always shows a
  count (`Past games (0)`, `Past games (12)`) and retains the existing
  per-team localStorage preference. Upcoming games sort nearest-first; past
  games sort most-recent-first. A locked summary reads “Sun, Mar 7 vs Mad
  Max — 5 players confirmed” (singular-aware, and “No players confirmed” at
  zero). Each locked game still expands independently to its honest RSVP
  record; a game inside the 24-hour grace window remains fully visible and
  editable as in milestone 5.75.
- Game-card spacing increases from 16px to 24px on mobile and 28px on
  desktop. Sticky headings become predictable two-level headings: first
  `Wed, Jul 22 · 2:06 pm`, then `vs Opponent`; opponent color is tertiary
  muted text. Current-year dates omit the year, other years include it, and
  long opponent names wrap without competing with date/time.
- The tiny attendance dots and repeated desktop pencil/Edit affordances are
  removed. The whole summary row remains the 44px-or-larger edit target at
  every width, with one disclosure chevron, keyboard Enter/Space support,
  focus treatment, and `aria-expanded`.
- Status is carried by short, semantically colored words, with the wording
  still sufficient without color. Upcoming: **Playing** (green), **Not
  playing** (red), **Not sure** (orange), **No response** (muted gray).
  Locked past: **Confirmed**, **Declined**, **Was unsure**, **No response**.
  Names remain neutral and semibold. Mobile keeps name + status on one line:
  the name ellipsizes first, the status never truncates, and only at an
  exceptionally narrow width may status fall to a second line. Desktop uses
  aligned name/status columns and avoids truncation where space permits.
- Attendance becomes fully optimistic because it is a small, frequent,
  reversible enum edit. On tap, the selected answer, colored phrase, roster
  report, and personal chip all update immediately. A 500ms minimum
  confirmation clock begins at the tap. The row collapses only when both
  that clock and the successful response have completed — i.e. at
  `max(tap + 500ms, server success)`. Failure rolls every optimistic surface
  back, keeps the editor open, and shows a retryable inline error.
- Schedule and management expansions use restrained spatial motion: about
  160–180ms ease-out to open, a slightly faster ease-in to close, content
  fade plus chevron rotation, no bounce, and no initial-load animation.
  `prefers-reduced-motion` makes them instant.

### Inline management model

Players and Games no longer use permanent action buttons or dedicated form
pages. The list/table itself is the complete workspace.

- The entire collapsed summary row opens its inline form; no nested Edit
  button. Only one row or Add draft is open per page. Clicking another row,
  collapsing, opening Add, or navigating away from a **dirty** form replaces
  its action area with an inline discard confirmation. Untouched forms close
  freely; Cancel explicitly discards. Refresh/tab close uses the browser's
  standard unsaved-changes warning.
- Add is the final row inside the active list/table (`＋ Add player`, `＋ Add
  game`), not a large external button. It expands to the same blank form.
  The current React app's `/players/new`, `/players/:id/edit`, `/games/new`,
  and `/games/:id/edit` routes and standalone form pages are removed; add and
  edit expansion is local UI state. The shareable `/games/:gameId` route is
  unrelated and stays.
- Management mutations are deliberately not optimistic. The form remains
  visible, relevant controls disable, and labels say Saving/Adding/Removing
  while waiting. On success, `Saved ✓` or `Added ✓` remains for about 500ms,
  then the row collapses and server-backed summaries update. Failure
  preserves values and context with an inline, retryable error. There are no
  modals, native confirm dialogs, toasts, or overflow menus.
- A separated action footer spans the expanded form: text Cancel on the left
  and one compact green Save/Add button on the right, both with 44px targets.
  Validation and request errors sit immediately above it. Destructive text
  appears below, not as Save's peer. Tapping it opens an inline confirmation
  that names the record, explains consequences, preserves unsaved fields,
  and disables Save until resolved.
- Desktop retains real semantic tables; an expansion is a full-width row
  beneath its summary. Mobile retains touch-oriented lists. Mobile fields
  stack. Desktop Player forms put Name and Category side by side. Desktop
  Game forms put Opponent and Color side by side with native
  `datetime-local` full-width below. Form footers span all columns.

**Players.** The title is simply **Players**. A collapsed row shows Player
and Category: quota players use the title-cased configured singular noun
(e.g. `Woman`); non-quota players temporarily show an em dash. This is a
truthful bridge, not a final category model: `countsTowardMinimum: false`
does not imply “Man.” Dominant-group nouns belong to the already-deferred
coed-rules work and will replace the dash later. The complete name + quota
form expands inline. Ordinary Remove remains available to everyone under the
existing trust model and uses inline confirmation with the milestone 5.5
history/add-back explanation.

The captain-only disclosure always says `Former players (n)`. Former rows
show name and departure date, then expand only to **Add back to roster** and
**Delete permanently** — inactive details are not editable. Add back requires
inline confirmation that the player's existing personal link immediately
works again; success briefly says `Added back ✓` and moves the row to the
active list. Permanent deletion moves here from active-player editing, is
preceded by explicit irreversible confirmation, and retains all server
protections: captain-only, refuses attendance history, and cannot remove the
last active captain.

**Games.** The title is simply **Games**. Mobile collapsed rows match the
schedule's date-first identity. Desktop columns are **Date & time | Opponent
| Color | disclosure**, with Bye week in the opponent column. The complete
form expands inline. Delete uses inline confirmation and retains its current
consequences. Past-management behavior and its persisted visibility remain;
the visual treatment follows the same quiet row pattern.

### Access refinement and current-token usage

The title becomes **Access**. Mobile active rows use a stable two-level
summary that leaves Copy directly available without opening the row:

```text
My Second Guy                    Copy  ›
Never opened
```

Name/state occupy the flexible left column; Copy remains a labeled 44px
target and does not toggle expansion. Desktop columns are **Player | Status |
Copy | disclosure**. A successful copy says `Copied!` for about two seconds;
failure says `Copy failed`, while expanding always exposes the selectable
full URL.

An expanded active row shows the full URL and a nested **Manage link**
disclosure. Regenerate is neutral text and Revoke is red text; neither is a
permanent button. Each uses an inline confirmation that names the player and
explains link/session consequences. Successful regeneration leaves the row
open, closes Manage link, highlights the new URL, says `New link generated
✓`, and offers **Copy new link** without touching the clipboard
unexpectedly. Successful revocation says `Access revoked ✓` for about 500ms,
then collapses to `Revoked · opened` or `Revoked · never opened`; failure
keeps confirmation and error open. Expanding a revoked row shows revocation
date and the direct recovery action **Generate a new link** (not hidden under
Manage link).

To make “Never opened” truthful, add nullable
`player.join_token_used_at timestamptz`. It means **the first successful
redemption of the current token**, not recent app activity and not proof
that someone acted on the captain's latest text. A valid active-token
exchange sets it once (`COALESCE` semantics); subsequent exchanges preserve
the first timestamp. Regeneration resets it to `NULL`; revocation preserves
it. Existing rows receive no backfill. `PlayerAccess` gains a nullable ISO
field (named `joinTokenUsedAt` unless implementation finds a clearer
contract name), and the access query returns it. Marking usage must belong to
the successful current-token exchange and must not accidentally mark a
replacement token during a regeneration race.

### Visual calibration

- Keep the humanist system stack and tight tracking on actual headings only.
  Reduce both weight saturation and size: roughly 25px/800 mobile and
  29px/800 desktop page titles; 19–21px/800 section headings; 18–19px/700
  game headings; 16px/600 names; 600 navigation/actions; 400 body/status;
  700 report emphasis. Use available real system weights rather than
  synthetic 750-style intermediates.
- Light mode moves from the broad diagonal field toward a modern vertical
  descendant of the legacy green atmosphere: softer at top, calmer below,
  no repeating bands or dramatic stripe. `#b4dd96 → #86c264` is a browser-
  tuning starting point, not a blind final value; update HTML/manifest theme
  color to the chosen representative green. Dark mode's neutral cards over
  deep green remain in their current direction.
- Preserve card shape, restrained shadows, hairline dividers, single-column
  schedule, desktop sidebar, and fixed opaque mobile bottom navigation.
  Existing safe-area and bottom padding stay. WCAG contrast and 44px targets
  remain floors.

### Testing and acceptance

This milestone changes interaction structure and one auth fact, so tests are
part of the spec rather than post-hoc selector repair.

- **Server integration:** new/current token starts null; first successful
  active redemption sets usage; repeated redemption preserves the first
  value; regeneration resets it; revocation preserves it; invalid, revoked,
  and departed links do not mark usage; access response returns the field.
  Exercise the current-token race safety if it is isolated in a testable
  data operation.
- **Playwright:** inline player edit + create; one-open-at-a-time; dirty
  discard on row switch/navigation; inline remove confirmation; former
  add-back and guarded permanent deletion; inline game edit + create +
  delete; no obsolete form-route navigation; direct Access Copy feedback;
  Never opened → Opened after a real join redemption; regeneration reset/new
  URL flow; revocation success state. Preserve existing auth/wall, lock,
  localStorage, and PWA flows.
- **Optimistic attendance e2e:** delay the PUT response and assert button,
  phrase, report, and personal chip update before it resolves; assert the row
  cannot collapse before both 500ms and success; force a failure and assert
  complete rollback plus open retry state. Avoid brittle exact-timer tests:
  prove the lower bound and eventual state with generous margins.
- Cover past disclosure count/order/wording and locked expansion. Exercise at
  least one mobile list and desktop table flow, keyboard expansion, and
  reduced-motion rendering. Visual details are reviewed at phone, tablet,
  wide desktop, and dark mode; do not introduce screenshot snapshots unless
  they prove stable enough to maintain.
- **Unit tests:** do not create a client unit-test harness merely to test CSS
  or React wiring. Add focused unit tests only if implementation extracts a
  genuinely branchy pure helper (for example compact current-year date
  formatting or optimistic cache transformation). Existing report/date
  units remain green. Run `pnpm test`, typecheck, production build, and the
  full Playwright suite.

### Design-refinement implementation notes (milestone 5.8, built July 2026)

Shipped as four commits — token-use fact, inline management, Access,
schedule/visual calibration — plus this documentation pass. Build-time
decisions and learnings:

- **Token usage is marked by the exchange itself, atomically.** The old
  `findPlayerByJoinToken` SELECT became `exchangeJoinToken`: one UPDATE
  that validates the token and `COALESCE`s `join_token_used_at` in the same
  statement, keyed on the token value. A join racing a captain's
  regeneration therefore cannot stamp the replacement token — the stale
  token no longer matches and the join falls through to the invalid
  redirect, which is what a regenerated-away link deserves. Departed
  detection is a read-only fallback SELECT, so a departed join marks
  nothing. Regenerate clears the stamp in its own UPDATE; revoke leaves it.
- **The router moved to `createBrowserRouter`.** Blocking in-app navigation
  away from a dirty draft needs `useBlocker`, which requires a data router.
  Unmatched paths — including the removed `/players/new`-style form routes —
  fall through to the wall, which already forwards signed-in visitors to
  their team.
- **One shared primitive set** (`client/src/components/disclosure.tsx`)
  carries the whole row language: `useDisclosurePage` (one open draft,
  pending-discard state, `beforeunload`, the navigation blocker),
  `Expander` (a `grid-template-rows: 0fr → 1fr` transition; children stay
  mounted through the close beat, and the inner overflow clip is released
  ~200ms after opening so `position: sticky` game headings can still pin),
  `summaryProps` (whole-row activation that ignores clicks/keys arriving
  from interactive children — this is what lets Access keep Copy inside the
  summary), `ConfirmAction`, and `FormShell`. The schedule's roster rows
  use the same Expander/Chevron, so all motion obeys one reduced-motion
  rule.
- **Management pages render the list or the table, never both.** 5.75 kept
  both DOM variants and hid one with CSS; with inline forms that would
  mount two copies of the open draft fighting over dirty state, so a
  `matchMedia` hook (`useIsDesktop`, 1024px) picks one. Desktop expansion
  is a real second `<tr>`; its zero-height row carries the divider border
  so an open form sits inside the record's borders.
- **Optimistic attendance lives in two pieces**: `applyAttendance`
  (shared, unit-tested) rewrites whatever shape a `["games", slug]` cache
  holds — schedule list or single game — preserving identity of untouched
  entries; the mutation snapshots every matching cache in `onMutate` and
  restores them wholesale on error, so phrase, report, and personal chip
  can never roll back separately. The collapse gate awaits a 500ms promise
  started at the tap *after* server success, and a per-row tap counter
  ensures only the latest tap's success collapses the row.
- **`formatShortDate` compares wall-clock years in the team's timezone**,
  not UTC, so a New Year's Eve game doesn't grow a year label early.
- **The e2e fixture gained a past-game attendance row for Carol.** Removal
  prunes forward RSVPs by design, so a player whose only response was on
  an upcoming game purges cleanly after removal — the has-history purge
  guard is only reachable end-to-end through played-game attendance.
- **As-built palette/type:** light page `#b4dd96 → #86c264`, vertical, no
  bands; HTML/manifest theme color `#86c264`; dark mode untouched. Status
  colors as text measure ≥ 4.65:1 on both card surfaces in both modes.
  Weights: 800 page/section headings, 700 game headings and report
  emphasis, 600 names/nav/actions/labels, 400 body — the 650s are gone.
- **Games management kept its own persisted past toggle** but restyled as
  the same counted quiet disclosure; the upcoming list always renders so
  the Add row exists even with zero upcoming games. The full Playwright
  suite grew from 13 to 21 tests.

### Decision log (design-refinement interview)

| Decision | Choice | Notes |
| --- | --- | --- |
| Governing interaction | Dense rows; actions appear on expansion | Extends the schedule's successful edit-on-demand model |
| Player/game editing | Complete inline form, one open | No modal or intermediate Edit link |
| Creation | Final Add row expands inline at every width | Same model as editing |
| Form routes | Remove dedicated new/edit routes | No users/links require compatibility; single presentation |
| Dirty drafts | One draft; inline discard confirmation | No hidden multi-row drafts |
| Save behavior | Wait for server; 500ms success beat, collapse | Management is not optimistic |
| Destructive behavior | Restrained text + inline confirmation | No native dialogs, menus, or modal |
| Player summary | Name + configured quota noun / temporary dash | Dominant noun remains deferred |
| Permanent player deletion | Former players only | Captain-only; history/last-captain guards remain |
| Add back | Inline confirmation | Explicitly warns existing link revives |
| Game summary | Date/time first everywhere | Desktop table splits date/opponent/color |
| Attendance marker | Colored short phrase; no dot | Color is redundant with words |
| Attendance rendering | Fully optimistic with rollback | Collapse at max(tap + 500ms, server success) |
| Game heading | Short date/time first; opponent second | Current year omitted; long names wrap independently |
| Past placement/order | Below upcoming; newest past first | Count always visible; preference persists |
| Past summary | “5 players confirmed” | Honest RSVP wording, singular-aware |
| Status chip | Full mobile/content-width desktop; short date | Status phrase alone carries color |
| Access routine action | Copy in collapsed row | `Copied!` feedback; full URL on expansion |
| Token usage | Current token ever opened | Durable first-use timestamp, reset on regenerate, no backfill |
| Access rare actions | Nested Manage link | Revoked recovery remains direct |
| Typography | Smaller calibrated 800/700/600/400 hierarchy | Avoid synthetic intermediate weights |
| Light page | Softer vertical legacy-descended green | Legacy is inspiration only; no repeating bands |
| Motion | 160–180ms height/fade + chevron | Instant under reduced motion |
| Mobile nav | Keep fixed opaque bar | Existing safe-area/content clearance stays |
| Roadmap/docs | Milestone 5.8 + handoff | Before keyring milestone 6 |

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
   the standalone [`REDESIGN.md`](REDESIGN.md), not here. **Its visual/UX
   specs were later superseded by the design overhaul (milestone 5.75)** —
   the shipped UX didn't hold up; see
   [that section](#design-overhaul-designed-july-19-2026-build-in-milestone-575).
   Scope: the **full
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
5. **Deploy** — ✅ done (July 2026). Live on Railway at turtleherder.com from
   day one, so the team's saved links never change: esbuild-bundled server,
   pre-deploy migrations, CI-gated auto-deploy, `db:create-team` for the real
   team, per-host TLS. Three as-built surprises the design hadn't seen: (a) DNS
   lived at **Rackspace via Laughing Squid**, not Route 53 — the "Route 53
   can't ALIAS an apex" reasoning was moot, and Namecheap's ALIAS did the job;
   (b) the domain carried **live email** (MX at Rackspace) that a nameserver
   move would have silently dropped — the whole zone, not just the A record,
   had to be inventoried and replicated first, so "repointing DNS destroys
   nothing" held for an A record but not for this; (c) the transfer took **~15
   minutes, not the predicted week**, so it was never the long pole and Railway
   provisioning became the critical path (certs lagged ~7h, then self-resolved).
   Also added, unplanned: a `www`→apex 301 in the app, since `www` was a second
   Railway custom domain serving the app as a co-equal origin (see Deploy
   section). Backups deliberately deferred — see the Backups decision.

**Post-launch** (in order):

**5.5 — Roster history** — ✅ done (July 2026). Repair work, not a feature,
which is why it takes a fractional slot rather than renumbering 6–8 (their
section anchors embed milestone numbers). Fixes the one bug carried whole
from the original: every game rendered against the *current* roster, and
removing a player destroyed their attendance history via cascade. Designed in
[its own section](#roster-history-designed-july-2026-build-in-milestone-55):
the `roster_membership` stint table, strict interval-derived rosters,
soft-close-and-prune on departure, a guarded captain purge, the
`starts_at + 24h` attendance lock, and past games rendering in past tense with
no quota clause. Slotted ahead of the keyring because it is a schema change to
tables the keyring also touches, and because every day the app runs, more games
accumulate a roster that will read wrong later. Build-time decisions in the
[roster history build decision log](#decision-log-roster-history-build-interview);
one question it surfaced (captain-only removal) went to the Parking lot.
Shipped as two commits — the stint work, then the independent attendance
lock.

**5.75 — Design overhaul** — ✅ done (July 2026). Milestone 3 shipped
`REDESIGN.md`'s UX and it failed in use: the schedule read as a survey form
(giant buttons, no scannable game state) where the legacy page was a
two-second report. The replacement restores that information density with
dense dot-status rows, edit-on-demand expansion, report-first cards, a
compact identity strip, green-page/white-card palette, humanist system
fonts, and system-following dark mode. It remained strictly client-only:
no schema, API, or route changes. Designed and documented, including
as-built implementation decisions, in
[its own section](#design-overhaul-designed-july-19-2026-build-in-milestone-575);
the original implementation handoff remains in `handoffs/design-overhaul.md`.
It shipped before the keyring so milestone 6's switcher UI will be built
once, in the new language. The **coed-rules cluster** (rule
storage/calculation/display) was split out as backend-logic work — see the
deferred subsection; its roadmap slot is decided after a second grill
session, post-5.75.

**5.8 — Design refinement** — ✅ done (July 2026). A live
mobile/desktop/dark-mode critique of 5.75 kept its scoreboard architecture
but made actions quieter: short colored attendance phrases (now fully
optimistic with wholesale rollback), compact two-level game identity, more
card separation, and fully inline row editing/creation on Players and
Games through a shared disclosure/form primitive set. Access became
copy-first and gained durable current-token “Opened” state via one small
migration/API addition (`player.join_token_used_at`, marked atomically by
the join exchange). Dedicated player/game form routes are gone; management
keeps semantic desktop tables and mobile lists, now rendered exclusively
per breakpoint. Full behavior, visual calibration, test requirements, and
decision log are in
[its own section](#design-refinement-designed-july-2026-build-in-milestone-58);
as-built decisions in
[its implementation notes](#design-refinement-implementation-notes-milestone-58-built-july-2026);
the original implementation handoff remains in
`handoffs/design-refinement.md`. Slotted before keyring because it changed
the Access surface and current session-token code that milestone 6 will
subsequently restructure.

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
- **Captain-only removal** — surfaced while building milestone 5.5 (July
  2026). Removal became reversible, but the undo ("Add back") is
  captain-gated, so a non-captain can remove a player they cannot restore —
  an asymmetry the old hard delete didn't have (it was unrecoverable for
  everyone). Removal today stays on the trust model ("anyone inside the wall
  manages the roster"), unchanged from the original app. Explore making
  removal itself captain-only; a natural moment is milestone 7 (self-serve),
  when strangers' teams raise the stakes on intra-team mischief.
- **Coed rules model (grill part 2)** — deliberately unslotted (July 19
  2026). How the quota/coed rule is stored, calculated (shorthanded,
  min-to-start), and displayed; facts and void provisional choices recorded
  in the design overhaul section's deferred subsection. Milestone 5.75 has
  now shipped, so the grill is unblocked; pick the slot there (candidates:
  its own milestone before keyring's build, or bundled with self-serve where
  its config UI lives).
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

## Decision log (roster history interview)

| Decision | Choice | Notes |
| --- | --- | --- |
| Membership modeling | `roster_membership` stint table, no `team_id` | Player stays a `(person, team)` pair; the table buys exactly one thing — multiple stints. `player.team_id` remains the sole team-scoping source, so no query or auth guard changes |
| Roster derivation | Strict interval predicate, never unioned with `attendance` | The union case it would rescue (backdated `left_at`) is unreachable; the case it breaks (RSVP then quit) is routine |
| Removing a player | Soft-close `left_at = now()` + delete attendance where `starts_at >= left_at` | Delete predicate is the exact complement of the roster predicate: no orphans, nothing still-renderable destroyed, only unplayed games touched |
| Hard delete | Captain-only purge, refuses if any attendance row exists | For the typo'd player who never played; the guard makes the destructive path unable to destroy history |
| Rejoining | Collapsed "Former players" list on the players page, "Add back" opens a new stint on the **existing** row | Without a re-add route, multi-stint is unreachable and `createPlayer` silently forks the identity — the exact outcome the stint table was chosen to prevent. Also makes an accidental removal visible and reversible |
| Departure + auth | Delete sessions; leave the token intact; gate `/join` and the session wall on an open stint | "Add back" revives their original link, so nobody is re-texted |
| Departed-link copy | Distinct `302 /?join=departed` + "You're no longer on the {team} roster… ask your captain to add you back" | Deliberate exception to uniform-401, which guards against *enumeration*; a valid-but-departed token is a 128-bit secret, so only its rightful holder sees this. The generic copy is advice that cannot work — regenerating can't fix a stint gate |
| Why not reuse `join_token_revoked_at` | Rejected — it means "a captain deliberately killed this link", one fact per field | Overloading it lets a rejoin silently un-revoke a link killed for cause (lost phone in March, rejoin in September). Cheaper (no auth-layer change) but unresolvable once the two facts share a column |
| Manage-access scope | `getAccessList` returns active players only | A departed player's live join link doesn't belong on the captain's page |
| Last captain | Refuse to remove, purge, or demote the last active captain; stated as "≥ 1 active captain per team" | `is_captain` is on `player`; removing a solo captain locks the team out of manage-access, and "Add back" lives behind that page. Genuine cases are a SQL support request |
| Overlap protection | Partial unique index on `player_id WHERE left_at IS NULL` | No UI writes arbitrary stint dates, so overlapping closed stints aren't reachable; exclusion constraint + `btree_gist` not worth it |
| Backfill | One stint per player, `joined_at = '-infinity'` | Join dates were never recorded; sentinel needs no special-casing and preserves today's behavior for existing data |
| Attendance lock | Rejected after `starts_at + 24h`, no captain override | Grace period so "not sure" then played can be fixed; uniform 24h beats end-of-day (which gives a 10am game 14h and a 9pm game 3h). "When the next game starts" rejected: the season's last game would never lock |
| Past-game report | Past tense, no quota clause: "**Seven** players confirmed they were playing" | "Confirmed" reports what was recorded, not who attended — the lock makes under-counts permanent |
| Quota historization | None — `counts_toward_minimum` stays mutable and unhistorized | Dropping quota from past games dissolves the question. Freezing a tally would embed a prior categorization permanently; per-stint history would retain one per player — both partly undo "model the league rule, not identity" |
| Rejected | `game_id` FK on `player`; stored roster snapshots; frozen quota tally; `attendance.responded_at`; `team_id` on `roster_membership`; `tstzrange` exclusion constraint | See the section's Rejected paragraph for why each fails |

## Decision log (roster history build interview)

Implementation-level decisions settled while building milestone 5.5
(July 2026); the design itself is in the
[Roster history section](#roster-history-designed-july-2026-build-in-milestone-55)
and its decision log above.

| Decision | Choice | Notes |
| --- | --- | --- |
| Former players API | Separate endpoint: `GET …/players/former` (`formerPlayerSchema` = player + `leftAt`) | Existing `/players` payload and every caller stay untouched; the collapsed list fetches on its own query key |
| Former-players surface | Captains only — the list, "Add back", and purge (server-enforced 403s) | "Add back" re-arms a join link already delivered to the departed person's phone with no captain step after, unlike add-player where a captain must copy and text the token. Same class of action as regenerate/revoke |
| Purge UI | "Delete permanently" danger-zone on the player edit page | Not adjacent to Remove on the roster row (two destructive buttons with subtly different meanings), and reachable without removing first |
| Past/locked source | Client computes both from `shared/game-time.ts` (`isGamePast`, `isAttendanceLocked`, `ATTENDANCE_LOCK_HOURS`) | Matches the existing client-side past/future sectioning; the server enforces the lock with the same constant, so device-clock skew can only mislead the rendering, never the record |
| Grace window rendering | Tense flips at `starts_at`; controls stay live until the lock | The only combination that honors the grace period's purpose ("not sure", then played, then fixed it). The personal-question card hides once a game starts — its "will you be coming" is anticipatory voice |
| Remove confirmation | "Remove {name} from the roster? Their game history stays, and a captain can add them back later." | The dialog is the one moment to teach that removal changed meaning; "a captain can" (not "you can") stays true for non-captain removers |
| Error contracts | 409 + `{"error": …}`: `"attendance locked"`, `"last captain"`, `"player has history"`, `"player is active"` | Matches the existing terse error-body pattern; client `ApiError` now carries the server's error string, since purge's two 409s need distinguishing |
| Departed wall copy | Server appends `&team=<name>` to `/?join=departed` | The wall has no session to ask; only the token's rightful holder can trigger the redirect, so naming the team leaks nothing |
| Stint check on the hot path | A clause inside `getSessionAuth`'s existing query, not a second guard | One round trip on every authenticated request; the keyring middleware keeps the clause |

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
| Demo team in prod | No — none | Reversed while building milestone 5: `db:create-team` conjures a sandbox on demand, so a permanent seeded one earns nothing it doesn't cost. Deploy verification uses a throwaway team from the same script and still never touches real data |
| DNS | Transfer Route 53 → Namecheap; ALIAS at apex | Route 53 can't point an apex at Railway; the registrar consolidation was wanted anyway. Transfer starts first (long pole) |
| Old PHP site | Judgment call — no log audit | Repointing DNS destroys nothing and reverses in minutes |
| Backups | Deferred at build — none yet | Reversed while building milestone 5: Railway's built-in backups need Pro ($20/mo); one team, fully re-creatable from `db:create-team`, no revenue yet. Revisit at the first second-team or tip |
