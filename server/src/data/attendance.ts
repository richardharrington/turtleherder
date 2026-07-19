import {
  isAttendanceLocked,
  type AttendanceStatus,
} from "@turtleherder/shared";
import { pool } from "../db.js";

export type SetAttendanceResult = "ok" | "not_found" | "locked";

// Records a player's response for a game. "not_found" when the player or
// game doesn't exist or doesn't belong to the given team; the guard
// subqueries keep one team's URL from touching another team's rows.
// "locked" once the game is past the grace period — a played game's record
// settles, and the client hiding its controls is not the guard.
// There is deliberately no way to delete a response: as in the original,
// you can't return to "hasn't responded yet".
export async function setAttendance(
  teamId: number,
  gameId: number,
  playerId: number,
  status: AttendanceStatus,
): Promise<SetAttendanceResult> {
  const game = await pool.query<{ starts_at: Date }>(
    `SELECT starts_at FROM game WHERE id = $1 AND team_id = $2`,
    [gameId, teamId],
  );
  if (!game.rows[0]) {
    return "not_found";
  }
  if (isAttendanceLocked(game.rows[0].starts_at.toISOString())) {
    return "locked";
  }
  const result = await pool.query(
    `INSERT INTO attendance (player_id, game_id, status)
     SELECT p.id, g.id, $4
     FROM player p, game g
     WHERE p.id = $1 AND p.team_id = $3
       AND g.id = $2 AND g.team_id = $3
     ON CONFLICT (player_id, game_id)
     DO UPDATE SET status = EXCLUDED.status`,
    [playerId, gameId, teamId, status],
  );
  return (result.rowCount ?? 0) > 0 ? "ok" : "not_found";
}
