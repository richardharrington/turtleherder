# Handoff: Roster history (Roadmap milestone 5.5)

You are picking up **milestone 5.5 of the roadmap** in `DESIGN.md`: fixing the
roster-history bug inherited from the original PHP app. Read `DESIGN.md` in
full before anything else — especially the **"Roster history (designed July
2026, build in milestone 5.5)"** section, its decision-log table, and the
Schema section. It is the authoritative spec and decision log.

The design is **settled**. It came out of a long interview and the section
records not just the choices but the alternatives that were rejected and why.

## How Richard works

- He settles open questions via **/grill-me interviews**: present options,
  let him choose, and reveal your own recommendation only **after** he picks
  (then argue for it if you feel strongly).
- **Do not re-litigate anything in the Roster history section or its decision
  log** — the stint table, strict interval derivation, prune-on-departure,
  the guarded purge, the 24h lock, the past-tense report, or the decision not
  to historize `counts_toward_minimum`. Several of these were reversed at
  least once during the interview; the section explains why each landed where
  it did. Grill only on genuine *implementation-level* unknowns.
- Commit at the milestone boundary with a real message. This is one milestone,
  so one commit unless he says otherwise — he may want the lock split out,
  since it's independent. Ask before splitting.

## The bug, in one line

`games.ts:70` joins every current player to every game
(`JOIN player p ON p.team_id = g.team_id`), so past games render against
today's roster; and `players.ts:65` hard-deletes, cascading the player's
attendance history away entirely.

## What to build

1. **Migration.** `roster_membership` (`id`, `player_id` FK → `player`
   CASCADE, `joined_at timestamptz NOT NULL`, `left_at timestamptz NULL`),
   partial unique index on `player_id WHERE left_at IS NULL`, index on
   `player_id`. Backfill one stint per existing player with
   `joined_at = '-infinity'`, `left_at = NULL`. No `team_id` column —
   `player.team_id` stays authoritative.

2. **Roster derivation.** `PLAYER_STATUS_SQL` in `games.ts` gains a join to
   `roster_membership` with
   `m.joined_at <= g.starts_at AND (m.left_at IS NULL OR m.left_at > g.starts_at)`.
   Strictly this predicate — never a union with `attendance`. Note the join
   can multiply rows if a player somehow has overlapping stints; the partial
   unique index prevents the reachable case, but make the query robust.

3. **Player lifecycle in `players.ts`.**
   - `createPlayer` opens a stint (`joined_at = now()`) in the same
     transaction as the insert.
   - `deletePlayer` becomes a **soft close**: `left_at = now()` on the open
     stint, plus `DELETE FROM attendance WHERE player_id = $1 AND game_id IN
     (SELECT id FROM game WHERE starts_at >= $left_at)` — the exact
     complement of the roster predicate. One transaction.
   - Re-adding a player who has a closed stint opens a **new** stint rather
     than reopening the old one or creating a second `player` row.
   - New **purge**: captain-only, hard-deletes the `player` row, and
     **refuses (409) when any attendance row exists**.
   - `getPlayersForTeam` returns currently-active players only. Departed
     players are fetched separately for the "Former players" list (below).
   - New **add-back**: opens a *new stint on the existing `player` row*.
     Never creates a second row for the same person — that fork is the
     failure mode the whole stint table exists to prevent.
   - **Refuse to remove or purge the last active captain** (invariant:
     "≥ 1 active captain per team", so a future demote path is covered too).
     Without it, removing a solo captain locks the team out of manage-access
     — and "Add back" lives behind that page, so the mistake is unrecoverable
     from inside the app. Genuine cases are a SQL support request.

4. **Departure and auth** — read the Auth design section's "Milestone 5.5
   amends this" note before touching any of this.
   - Closing a stint **deletes that player's sessions**, in the same
     transaction — `DELETE FROM session WHERE player_id = $1`, matching
     `updateTokenAndKillSessions` (`access.ts:104`). **Leave a comment
     pointing at milestone 6**: once sessions become keyrings
     (`session_player`), this must become "detach *this player's key*", or it
     will sign the browser out of every team it holds. The keyring section
     records both call sites; don't try to pre-build for it, just make it
     findable.
   - `/join/<token>` (`findPlayerByJoinToken`, `access.ts:29`) and the
     session wall both require an **open stint**. A departed player gets a
     **distinct** response — `302 /?join=departed`, wall copy "You're no
     longer on the {team} roster. If that's a mistake, ask your captain to
     add you back." This is a deliberate, reasoned exception to the
     uniform-401 contract; the decision log explains why it doesn't weaken
     it. **Invalid tokens keep today's behavior** (`302 /?join=invalid`) —
     don't collapse the two.
   - **Leave `join_token` and `join_token_revoked_at` alone.** The token
     stays valid-but-inert so "Add back" revives the player's original magic
     link. Reusing `revoked_at` to mean "departed" was considered and
     rejected; the decision log says why.
   - `getAccessList` (`access.ts:43`) scopes to active players.

5. **Players page UI.** A collapsed **"Former players"** list below the
   roster, each row showing when they left plus an **"Add back"** action.
   Reuse the show/hide pattern already in `SchedulePage.tsx` /
   `GamesPage.tsx` (localStorage-persisted), rather than inventing a new
   one. This is the only route by which a captain can see and undo an
   accidental removal, so it isn't optional polish.

6. **Attendance lock in `attendance.ts`.** Reject writes when
   `now() > game.starts_at + 24h`, as one named constant. Server-enforced —
   the client must not be the only guard. Pick the error contract to match
   the existing one (`app.ts` and the auth decision log establish the
   pattern; a 409 seems more apt than a 403, but that's yours to decide).

7. **Past-game rendering.** `GameCard` branches on past vs. future:
   - Attendance controls read-only/absent on past games.
   - Report becomes past tense with **no quota clause**:
     "**Seven** players confirmed they were playing." Keep the grammar
     engine's conventions — numbers as words, `**bold**` markers, the
     singular/plural handling in `report.ts`.
   - Non-responders read "didn't respond" rather than "hasn't responded yet"
     (`GameCard.tsx:32`).
   - `SchedulePage.tsx:41` and `GamesPage.tsx:48` already compute past/future
     client-side; reuse rather than reinvent, and consider whether the
     past/locked determination belongs on the server payload instead, since
     the server is enforcing the lock anyway.

8. **Tests.** Extend `server/src/app.test.ts` (real `turtleherder_test`
   Postgres, `DATABASE_URL` set before dynamic import). The scenarios that
   matter most, all of which were reasoned about explicitly in the interview:
   - A, B, C play Jan 1; A leaves; D joins; Jan 3 game. Jan 1 must show
     A, B, C — **not** D — and Jan 3 must show B, C, D.
   - A's Jan 1 response survives A's departure.
   - A RSVPs to a June game, leaves in March: A appears on neither the June
     roster nor anywhere else, and the June row is gone.
   - A leaves March, rejoins May **via "Add back"**: one `player` row, two
     stints, same join token, and the June RSVP does **not** resurrect.
   - **A departed player's join link stops working** — `/join/<token>`
     redirects to `?join=departed`, *not* `?join=invalid` — and their live
     session is dead on the next request. Assert the two are distinguishable;
     a genuinely bad token must still get `?join=invalid`.
   - **The same link works again after "Add back"**, without regenerating.
   - A token revoked *deliberately* stays revoked across a leave-and-rejoin
     (the lost-phone case in the decision log). This is the regression test
     for the rejected `revoked_at` overload — it must not silently revive.
   - `getAccessList` omits departed players.
   - Removing the last active captain is refused; removing a captain when
     another active captain exists succeeds. Same for purge.
   - Attendance write rejected past `starts_at + 24h`; accepted at +23h.
   - Purge refuses on a player with history; succeeds on one without.
   - `report.ts` unit tests for the past-tense sentence.
   - The existing suites must stay green: seed (`seed.ts`),
     `create-team.ts`, and the e2e fixtures all insert players directly and
     will need stints.

## Likely grill-worthy implementation questions

Not exhaustive, and if the spec plus codebase makes an answer obvious, just
decide and note it — don't interview for its own sake. Genuinely open:
whether `getPlayersForTeam` grows an "include departed" mode or a second
function; where purge lives in the UI and what its confirmation says (it is
*not* the same control as remove); what the remove confirmation says now that
removal is reversible; whether the "Former players" list needs its own API
endpoint or rides on the existing players payload; the exact error contract
for a locked write; whether "is this game past/locked" ships on the API
payload or stays a client computation; whether the 24h constant lives in
`shared/`; how `ON DELETE CASCADE` from `player` to `roster_membership`
interacts with purge's guard; whether the session wall's membership check is
better as a join in the session lookup or a separate guard (it is on the hot
path for every authenticated request).

## Coordination

- Milestone 6 (multi-team keyring) touches `session`/`player` and is **not**
  yet built — you are ahead of it. Don't design around it, but do **not**
  quietly diverge from it either: the keyring section ends with an "Amended
  by milestone 5.5" list recording exactly where your work changes its
  assumptions (session-deletion becoming key-detachment, the middleware
  gaining a stint clause, `/join` gaining a rejection path). If you find a
  *further* collision while building, add it there rather than only fixing it
  locally.
- Untracked scratch files at the repo root (`notes.txt`, `Untitled *.txt`)
  are Richard's own working notes, **not** input for you. Don't read them and
  don't act on them; scope comes from DESIGN.md and this handoff.
- Docker Postgres via `pnpm db:up`; suites: `pnpm test` (unit +
  integration), e2e in `e2e/` (ports 3100/5199, workers: 1). Production is
  one real team on Railway; migrations run pre-deploy, so a bad migration
  aborts the deploy rather than crash-looping it.
