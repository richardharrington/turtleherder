# Turtleherder v2 — Design

A rewrite of the original PHP turtleherder as a React + Node app in TypeScript, backed by
Postgres. This document records the decisions made during the design interview
(July 2026) and is the spec for the first version. A follow-up interview settled
the [auth design](#auth-design-agreed-not-yet-built), to be built before deployment.

## Goal

A **feature-complete copy of the original app**, shipped for real use. The legacy PHP in
`legacy/` is the reference for behavior. Deliberately deferred to later versions:

- Authentication / access control — designed (see below) but not yet built;
  required before real deployment
- Improved calendar/date picking beyond the platform default
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
  rule) without modeling gender identity.
- **game** — `id`, `team_id` FK, `opponent_name` (nullable — `NULL` means bye week),
  `opponent_color` (nullable), `starts_at` (`timestamptz`).
  Times are true instants; the team's `timezone` is used for entry and display.
- **attendance** — `id`, `player_id` FK, `game_id` FK, `status` enum
  (`yes` / `no` / `not_sure`), unique on `(player_id, game_id)`.
  **Absence of a row means "hasn't responded."** Unlike the original, rows are *not*
  pre-created for every player × game; the schedule view LEFT JOINs the roster to
  render non-responders. This eliminates the original's insert-fanout on new
  players/games.

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

REST under `/api`, team-scoped by slug. Roughly:

- `GET /api/teams/:slug` — team with settings
- `GET /api/teams/:slug/games` — games with attendance + roster report data
- `GET /api/teams/:slug/games/:id` — single game (backs the shareable page)
- `POST/PUT/DELETE` on games and players
- `PUT /api/teams/:slug/games/:gameId/attendance/:playerId` — upsert status

Exact shapes to be defined as zod schemas in `shared` during implementation.

## UX fidelity

- **Faithful recreation of the original look**: `legacy/bobcats/css/main.css` ported —
  green gradient, centered white card, purple links, color-coded statuses
  (green = coming, red = not coming, orange = not sure, black = no response).
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

## Auth design (agreed, not yet built)

Settled in a second design interview (July 2026). To be implemented as its own
milestone before any real deployment. Guiding constraint: the app's entire value
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

**The personal question (in scope for the auth milestone):** the one place the
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

**Schema additions when built:** `player.join_token` (unique),
`player.is_captain`, and a `session` table (`id`, `player_id`, `created_at`,
`last_seen_at`).

## Decision log (from the interview)

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
| Styling | Faithful port of original CSS | 2010 look on purpose |
| Testing | Unit + API integration + Playwright e2e | |
| Dev env | Docker Compose Postgres + pnpm | |
| Legacy PHP | Moved to `legacy/`, kept as reference spec | Delete whenever |
