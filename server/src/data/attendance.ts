import type { AttendanceStatus } from "@turtleherder/shared";
import { pool } from "../db.js";

// Records a player's response for a game. Returns false when the player
// or game doesn't exist or doesn't belong to the given team; the guard
// subqueries keep one team's URL from touching another team's rows.
// There is deliberately no way to delete a response: as in the original,
// you can't return to "hasn't responded yet".
export async function setAttendance(
  teamId: number,
  gameId: number,
  playerId: number,
  status: AttendanceStatus,
): Promise<boolean> {
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
  return (result.rowCount ?? 0) > 0;
}
