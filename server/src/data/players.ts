import type { FormerPlayer, Player, PlayerInput } from "@turtleherder/shared";
import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { generateJoinToken } from "./access.js";

interface PlayerRow {
  id: number;
  team_id: number;
  name: string;
  counts_toward_minimum: boolean;
}

function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    countsTowardMinimum: row.counts_toward_minimum,
  };
}

const OPEN_STINT_SQL = `SELECT 1 FROM roster_membership m
   WHERE m.player_id = p.id AND m.left_at IS NULL`;

// The current roster: players with an open membership stint. Departed
// players come from getFormerPlayers instead.
export async function getPlayersForTeam(teamId: number): Promise<Player[]> {
  const { rows } = await pool.query<PlayerRow>(
    `SELECT id, team_id, name, counts_toward_minimum
     FROM player p WHERE team_id = $1
       AND EXISTS (${OPEN_STINT_SQL})
     ORDER BY name ASC`,
    [teamId],
  );
  return rows.map(toPlayer);
}

// The captains-only "Former players" list: every player whose last stint is
// closed, with when it closed. The max() collapses multi-stint history to
// the most recent departure.
export async function getFormerPlayers(
  teamId: number,
): Promise<FormerPlayer[]> {
  const { rows } = await pool.query<PlayerRow & { left_at: Date }>(
    `SELECT p.id, p.team_id, p.name, p.counts_toward_minimum, s.left_at
     FROM player p
     JOIN LATERAL (
       SELECT max(m.left_at) AS left_at FROM roster_membership m
       WHERE m.player_id = p.id
     ) s ON s.left_at IS NOT NULL
     WHERE p.team_id = $1
       AND NOT EXISTS (${OPEN_STINT_SQL})
     ORDER BY p.name ASC`,
    [teamId],
  );
  return rows.map((row) => ({
    ...toPlayer(row),
    leftAt: row.left_at.toISOString(),
  }));
}

export async function createPlayer(
  teamId: number,
  input: PlayerInput,
): Promise<Player> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<PlayerRow>(
      `INSERT INTO player (team_id, name, counts_toward_minimum, join_token)
       VALUES ($1, $2, $3, $4)
       RETURNING id, team_id, name, counts_toward_minimum`,
      [teamId, input.name, input.countsTowardMinimum, generateJoinToken()],
    );
    const row = rows[0]!;
    await client.query(
      `INSERT INTO roster_membership (player_id, joined_at) VALUES ($1, now())`,
      [row.id],
    );
    await client.query("COMMIT");
    return toPlayer(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updatePlayer(
  teamId: number,
  playerId: number,
  input: PlayerInput,
): Promise<Player | null> {
  const { rows } = await pool.query<PlayerRow>(
    `UPDATE player SET name = $3, counts_toward_minimum = $4
     WHERE id = $2 AND team_id = $1
     RETURNING id, team_id, name, counts_toward_minimum`,
    [teamId, playerId, input.name, input.countsTowardMinimum],
  );
  const row = rows[0];
  return row ? toPlayer(row) : null;
}

// Serializes roster changes for one team, so concurrent removals can't both
// slip past the last-captain check.
async function lockTeam(client: PoolClient, teamId: number): Promise<void> {
  await client.query(`SELECT id FROM team WHERE id = $1 FOR UPDATE`, [teamId]);
}

// Is anyone *else* an active captain? The invariant is "≥ 1 active captain
// per team": without it, removing a solo captain locks the team out of
// manage-access — and "Add back" lives behind that page.
async function hasAnotherActiveCaptain(
  client: PoolClient,
  teamId: number,
  playerId: number,
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM player p
     WHERE p.team_id = $1 AND p.is_captain AND p.id <> $2
       AND EXISTS (${OPEN_STINT_SQL})
     LIMIT 1`,
    [teamId, playerId],
  );
  return rows.length > 0;
}

export type RemovePlayerResult = "removed" | "not_found" | "last_captain";

// Removing a player is a soft close, not a delete: the open stint gets
// left_at = now(), their attendance rows for games that stint no longer
// covers (starts_at >= left_at — the exact complement of the roster
// predicate) are pruned, and their sessions die. History for played games
// is untouched, and "Add back" can reverse the whole thing.
export async function removePlayer(
  teamId: number,
  playerId: number,
): Promise<RemovePlayerResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockTeam(client, teamId);
    const target = await client.query<{ is_captain: boolean }>(
      `SELECT p.is_captain FROM player p
       WHERE p.id = $2 AND p.team_id = $1
         AND EXISTS (${OPEN_STINT_SQL})`,
      [teamId, playerId],
    );
    if (!target.rows[0]) {
      await client.query("ROLLBACK");
      return "not_found";
    }
    if (
      target.rows[0].is_captain &&
      !(await hasAnotherActiveCaptain(client, teamId, playerId))
    ) {
      await client.query("ROLLBACK");
      return "last_captain";
    }

    const closed = await client.query<{ left_at: Date }>(
      `UPDATE roster_membership SET left_at = now()
       WHERE player_id = $1 AND left_at IS NULL
       RETURNING left_at`,
      [playerId],
    );
    await client.query(
      `DELETE FROM attendance
       WHERE player_id = $1
         AND game_id IN (SELECT id FROM game WHERE starts_at >= $2)`,
      [playerId, closed.rows[0]!.left_at],
    );
    // Departure cuts access: the soft close no longer deletes the player
    // row, so the FK cascade that used to kill sessions doesn't happen.
    // Milestone 6 (keyring): when session.player_id becomes session_player,
    // this must become "detach this player's key" (DELETE FROM
    // session_player WHERE player_id = $1), NOT a delete of the sessions it
    // appears in — see the keyring section's "Amended by milestone 5.5".
    await client.query(`DELETE FROM session WHERE player_id = $1`, [playerId]);
    await client.query("COMMIT");
    return "removed";
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type AddBackResult =
  | { outcome: "added"; player: Player }
  | { outcome: "not_found" }
  | { outcome: "already_active" };

// "Add back" opens a new stint on the existing player row — never a second
// row for the same person. Their join token was left intact at departure,
// so their original magic link starts working again.
export async function addBackPlayer(
  teamId: number,
  playerId: number,
): Promise<AddBackResult> {
  const { rows } = await pool.query<PlayerRow>(
    `SELECT id, team_id, name, counts_toward_minimum
     FROM player WHERE id = $2 AND team_id = $1`,
    [teamId, playerId],
  );
  const row = rows[0];
  if (!row) {
    return { outcome: "not_found" };
  }
  try {
    const inserted = await pool.query(
      `INSERT INTO roster_membership (player_id, joined_at)
       SELECT $1, now()
       WHERE NOT EXISTS (
         SELECT 1 FROM roster_membership WHERE player_id = $1 AND left_at IS NULL
       )`,
      [playerId],
    );
    if ((inserted.rowCount ?? 0) === 0) {
      return { outcome: "already_active" };
    }
  } catch (err) {
    // A racing add-back hit the one-open-stint partial unique index.
    if ((err as { code?: string }).code === "23505") {
      return { outcome: "already_active" };
    }
    throw err;
  }
  return { outcome: "added", player: toPlayer(row) };
}

export type PurgePlayerResult =
  | "purged"
  | "not_found"
  | "has_history"
  | "last_captain";

// The hard delete, for the typo'd player who never played. Refusing while
// any attendance row exists makes the destructive path structurally unable
// to destroy history; genuine erasure of a real member is a support
// conversation, not a button.
export async function purgePlayer(
  teamId: number,
  playerId: number,
): Promise<PurgePlayerResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockTeam(client, teamId);
    const target = await client.query<{ is_captain: boolean; active: boolean }>(
      `SELECT p.is_captain, EXISTS (${OPEN_STINT_SQL}) AS active
       FROM player p WHERE p.id = $2 AND p.team_id = $1`,
      [teamId, playerId],
    );
    const row = target.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return "not_found";
    }
    const history = await client.query(
      `SELECT 1 FROM attendance WHERE player_id = $1 LIMIT 1`,
      [playerId],
    );
    if (history.rows.length > 0) {
      await client.query("ROLLBACK");
      return "has_history";
    }
    if (
      row.is_captain &&
      row.active &&
      !(await hasAnotherActiveCaptain(client, teamId, playerId))
    ) {
      await client.query("ROLLBACK");
      return "last_captain";
    }
    // Stints and sessions cascade via their FKs; attendance is empty by the
    // guard above.
    await client.query(`DELETE FROM player WHERE id = $2 AND team_id = $1`, [
      teamId,
      playerId,
    ]);
    await client.query("COMMIT");
    return "purged";
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
