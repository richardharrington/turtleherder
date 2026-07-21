# Handoff: Multi-team keyring (Roadmap milestone 6)

You are picking up **milestone 6 of the roadmap** in `DESIGN.md`: replacing
the one-player-per-session model with a keyring that can hold a player
identity per team. Read `DESIGN.md` in full before touching code — especially:

1. **"Multi-team keyring (designed July 2026, build in milestone 6)"** — the
   authoritative spec, including its two amendment lists ("Amended by
   milestone 5.5" and "Amended by milestone 5.8"). Both amendments shipped
   *before* this milestone and changed code this section originally assumed;
   the amendment lists tell you what's actually in the repo now versus what
   the original interview pictured.
2. The **"Decision log (multi-team keyring interview)"** table.
3. The **Auth design** section and its "Milestone 5.5 amends this" note, for
   the full shape of the current one-player-per-session model you're
   replacing.

The design is **settled**. Do not re-litigate the mechanism (keyring via
`session_player`, additive `/join`, shared rolling clock, per-player
revocation, whole-keyring sign-out, team-name-as-switcher, last-visited PWA
landing) or the rejected alternatives (accounts/person entity, client-stored
tokens, cookie-per-team, unified cross-team views).

Do not read `notes.txt`, `Untitled*.txt`, or `league-rules-questions.md` at
the repo root — private scratch files, not agent input.

## How Richard works

- He settles open questions via **/grill-me interviews**: present options,
  let him choose, and reveal your own recommendation only **after** he
  picks (then argue for it if you feel strongly). Include an explicit
  "Other — type something" option in every `AskUserQuestion` — he's asked
  for this twice now; don't make him break out of the tool to add context.
- Grill only genuine implementation-level unknowns (see below). Everything
  in the keyring section and its decision log is closed.
- Commit at reasonable sub-boundaries when he says to (e.g. "schema +
  session model", "join/detach rewrite", "switcher + sign-out UI",
  "wall + PWA chooser").

## What this milestone is (and isn't)

Full-stack: migration, session model, `access.ts`/`sessions.ts` rewrites,
new sign-out endpoint, and client switcher/wall/PWA-chooser UI. It does
**not** include self-serve team creation (milestone 7) or the coed-rules
cluster (still deferred, tracked separately in DESIGN.md).

## The bug this fixes, in one line

A session holds exactly one `player_id`. Tapping a second team's join link
overwrites it, silently signing the browser out of the first team — real
for anyone on two teams with overlapping seasons (the design section's
bocce-and-soccer example).

## What to build

1. **Migration.** New `session_player` join table: `session_id` FK →
   `session` CASCADE, `player_id` FK → `player` CASCADE, unique on
   `(session_id, player_id)`, and a **partial unique index on
   `(session_id)` scoped per team** — in practice this means uniqueness on
   `(session_id, team_id)` where `team_id` comes from `player`, since "one
   key per team per session" is the invariant, not "one key per session."
   Decide the cleanest way to enforce that (a `team_id` column on
   `session_player` denormalized from `player.team_id` and indexed, vs. a
   trigger, vs. enforcing it only in application code with a test) — this
   is a genuine implementation question, not a re-litigation of the design.
   Backfill: one `session_player` row per existing `session.player_id`.
   Drop `session.player_id` once the backfill and all call sites move.

2. **Session model (`server/src/data/sessions.ts`).**
   - `createSession` becomes **add-or-reuse**: given a session id (or none)
     and a player id, insert the session if it doesn't exist, then upsert
     into `session_player` — if that team already has a key on this
     session, replace it (the "same-team re-tap replaces that key" rule);
     otherwise add a new row. Same-session, same-player is a no-op.
   - `getSessionAuth` keyed on `(sessionId, teamSlug)` now joins through
     `session_player` instead of `session.player_id` directly. It keeps the
     roster-stint clause added by 5.5 (`EXISTS ... roster_membership ...
     left_at IS NULL`) — the design section's "middleware gains a clause"
     amendment, already true in the current code (`sessions.ts:53-56`) and
     must survive the rewrite unchanged.
   - `touchSession` (rolling clock) stays keyed on `session.id` alone — it's
     already the "one shared clock for the whole keyring" the design calls
     for, since `last_seen_at` lives on `session`, not per-key. No change
     needed here beyond confirming it still compiles against the new shape.
   - New: a function to list every team a session currently holds a key
     for (for the switcher menu and the PWA chooser) — team id, slug, name,
     player name, per team.
   - New: whole-keyring sign-out — delete the `session` row (cascades
     `session_player`) and let the caller clear the cookie.

3. **Join route (`app.ts`'s `/join/:token` handler).** Currently:
   `setSessionCookie(c, await createSession(found.playerId))` unconditionally
   creates a fresh session. Rewrite to read the existing `th_session` cookie
   first: if present and still a live session row, add-or-replace this
   team's key on it (no new cookie needed); if absent or dead, create a new
   session with this one key and set the cookie. `pruneExpiredSessions`
   stays as-is (deletes whole expired sessions; `session_player` cascades).

4. **`access.ts` detach rewrite.** `updateTokenAndKillSessions`
   (`access.ts:134-166`) has a comment at line 153 flagging exactly this:
   change
   ```sql
   DELETE FROM session WHERE player_id = $1
   ```
   to
   ```sql
   DELETE FROM session_player WHERE player_id = $1
   ```
   This is the trap the design section calls out by name: the
   faithful-looking rewrite (deleting every session that ever held this
   player) is wrong because it signs the browser out of every *other* team
   on the keyring too. Only this one player's key comes off.

5. **Sign-out endpoint.** New route, something like
   `POST /api/session/sign-out` (outside `/api/teams/:slug`, since it isn't
   team-scoped) — deletes the session row for the current `th_session`
   cookie and clears the cookie. No auth beyond "cookie names a real
   session"; signing out a session that's already dead is a no-op success.

6. **Switcher UI (`TeamLayout.tsx`).** The team name (currently static text
   at `styles.teamName`, line 106, plus the mobile header) becomes
   interactive: tapping/clicking it opens a menu listing every team the
   keyring holds a key for (from the new "list my teams" endpoint) plus
   **Sign out**. A single-team keyring shows no visible change (design
   section: "single-team users see no change") — decide whether that means
   the affordance is hidden entirely for a keyring of size 1, or present
   but trivial (a menu with one team + sign-out); this is a genuine
   grill-worthy UI question.

7. **Wall copy (`WallPage.tsx`).** The current "one team at a time" copy
   (lines 84-94: "You can only be signed into one team at a time... Go to
   {team} →") is generalized per the design section: "You're not signed
   into "{slug}" on this device — use the join link that team's captain
   sent you," with **one link per keyring team** rather than the single
   `sessionQuery.data.name` link. This needs the new "list my teams"
   endpoint (or equivalent) called from a signed-in-but-wrong-team state,
   not just the single `lastTeamSlug` lookup it does today. Keep the
   existing `?join=departed` / `?join=invalid` branches untouched — this
   change is scoped to the `from`-param branch only (lines 82-95).

8. **PWA landing.** `TeamLayout.tsx` already persists `lastTeamSlug` to
   `localStorage` on every successful team load (lines 82-86) and
   `WallPage.tsx` already auto-forwards a direct "/" landing to it (lines
   32-46) — this is simpler than the design section's prose implies, since
   the "last-visited" behavior is *already built* (it just happens to be
   the only behavior, because today's keyring-of-one has nothing to choose
   between). What's new: a **one-time chooser** the first time a session's
   keyring holds more than one team, shown at "/" instead of the silent
   forward. After the chooser is answered once, revert to the existing
   last-visited forward — "remembered, then moves with any team visit" is
   already the mechanism; only the first-run interstitial is new. Decide
   where "have I shown the chooser already" is tracked (localStorage flag
   vs. inferring from `lastTeamSlug` already being set) — genuine
   implementation question.

## Tests

- Server integration (`server/src/app.test.ts`, real
  `turtleherder_test` Postgres): a session holding keys on two different
  teams reads correctly for each via `getSessionAuth`; joining a second
  team's link doesn't touch the first team's key; re-tapping the same
  team's link replaces only that key; regenerate/revoke detaches one key
  and leaves the others live (the exact regression the design section
  warns about — assert the *other* team's session survives); sign-out
  deletes every key at once; a session with zero keys behaves like no
  session; the roster-stint clause still blocks a departed player's key
  even though it's sitting on an otherwise-valid session.
- Playwright (`e2e/`, ports 3100/5199, workers: 1): current fixture is a
  single "Testcats" team seeded by `global-setup.ts` (players Alice/Bob/
  Carol, Alice is captain and pre-authenticated via `storageState`). This
  milestone needs a **second seeded team** to exercise cross-team
  behavior — extend global setup (or add a dedicated fixture) so a test
  can join Alice into a second team without losing her Testcats session,
  then assert both team pages work, the switcher lists both, sign-out
  clears both, and the wall's cross-team copy names the right team when
  she's bounced from a third, unjoined one.
- `pnpm test`, `pnpm typecheck`, `pnpm build` — should stay green outside
  the touched files.
- `pnpm db:up` for local Postgres; `db:create-team` still works for
  provisioning a real second team in production if you need one to smoke
  test against.

## Likely grill-worthy implementation questions

Not exhaustive — decide and note where the codebase makes the answer
obvious, don't interview for its own sake. Genuinely open: the exact shape
of "one key per team per session" enforcement (schema constraint vs. app
logic); the sign-out endpoint's route and method naming; whether the
"list my teams" data rides on a new endpoint or is folded into an existing
one (`/api/teams/:slug/me`'s response, or something session-scoped and
slug-less); how the switcher menu looks on mobile vs. desktop and whether
it reuses any existing disclosure primitive from milestone 5.8; where the
first-run PWA chooser tracks "already shown"; whether dropping
`session.player_id` happens in the same migration as adding
`session_player` or a follow-up once all call sites are confirmed moved.

## Coordination

- Two prior milestones (5.5, 5.8) shipped in the gap between this
  section's design and its build, and both left "amended by" notes in the
  keyring section listing exactly what changed underneath it (the stint
  clause, the detach-not-delete trap, `exchangeJoinToken`'s rename and
  atomic usage-stamping, `join_token_used_at`). Treat those notes as more
  current than the section's main prose where they conflict.
- If you find a *further* collision between what's actually in the repo
  and what the design section assumes, add a note to the section rather
  than silently diverging — the pattern the last two milestones used.
- Untracked scratch files at the repo root (`notes.txt`, `Untitled*.txt`,
  `league-rules-questions.md`) are Richard's own working notes, not input
  for you.
- Docker Postgres via `pnpm db:up`; suites: `pnpm test` (unit +
  integration), `pnpm test:e2e` (Playwright, workers: 1). Production is one
  real team on Railway; migrations run pre-deploy, so a bad migration
  aborts the deploy rather than crash-looping it.
