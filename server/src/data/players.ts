import type { Player, PlayerInput } from "@turtleherder/shared";
import { pool } from "../db.js";

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

export async function getPlayersForTeam(teamId: number): Promise<Player[]> {
  const { rows } = await pool.query<PlayerRow>(
    `SELECT id, team_id, name, counts_toward_minimum
     FROM player WHERE team_id = $1
     ORDER BY name ASC`,
    [teamId],
  );
  return rows.map(toPlayer);
}

export async function createPlayer(
  teamId: number,
  input: PlayerInput,
): Promise<Player> {
  const { rows } = await pool.query<PlayerRow>(
    `INSERT INTO player (team_id, name, counts_toward_minimum)
     VALUES ($1, $2, $3)
     RETURNING id, team_id, name, counts_toward_minimum`,
    [teamId, input.name, input.countsTowardMinimum],
  );
  return toPlayer(rows[0]!);
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

// Attendance rows cascade via the FK (the original deleted them explicitly).
export async function deletePlayer(
  teamId: number,
  playerId: number,
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM player WHERE id = $2 AND team_id = $1`,
    [teamId, playerId],
  );
  return (result.rowCount ?? 0) > 0;
}
