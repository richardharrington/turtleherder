import type {
  AttendanceStatus,
  Game,
  GameInput,
  GameWithAttendance,
  PlayerGameStatus,
} from "@turtleherder/shared";
import { pool } from "../db.js";

interface GameRow {
  id: number;
  team_id: number;
  opponent_name: string | null;
  opponent_color: string | null;
  starts_at: Date;
}

interface PlayerStatusRow {
  game_id: number;
  player_id: number;
  name: string;
  counts_toward_minimum: boolean;
  status: AttendanceStatus | null; // null = no attendance row = no response
}

function toGame(row: GameRow): Game {
  return {
    id: row.id,
    teamId: row.team_id,
    opponentName: row.opponent_name,
    opponentColor: row.opponent_color,
    startsAt: row.starts_at.toISOString(),
  };
}

function toPlayerStatus(row: PlayerStatusRow): PlayerGameStatus {
  return {
    playerId: row.player_id,
    name: row.name,
    countsTowardMinimum: row.counts_toward_minimum,
    status: row.status,
  };
}

function assemble(
  gameRows: GameRow[],
  statusRows: PlayerStatusRow[],
): GameWithAttendance[] {
  const playersByGame = new Map<number, PlayerGameStatus[]>();
  for (const row of statusRows) {
    let list = playersByGame.get(row.game_id);
    if (!list) {
      list = [];
      playersByGame.set(row.game_id, list);
    }
    list.push(toPlayerStatus(row));
  }
  return gameRows.map((row) => ({
    ...toGame(row),
    players: playersByGame.get(row.id) ?? [],
  }));
}

// A game's roster is the players whose membership stint covers starts_at —
// strictly this interval predicate, never a union with attendance (see
// ai-specs/DESIGN.md's Roster history section). EXISTS rather than a join so a
// player with overlapping stints (unreachable, but the query shouldn't
// depend on that) still yields one row. The LEFT JOIN yields status null
// for players who haven't responded.
const PLAYER_STATUS_SQL = `
  SELECT g.id AS game_id, p.id AS player_id, p.name,
         p.counts_toward_minimum, a.status
  FROM game g
  JOIN player p ON p.team_id = g.team_id
  LEFT JOIN attendance a ON a.game_id = g.id AND a.player_id = p.id
  WHERE EXISTS (
    SELECT 1 FROM roster_membership m
    WHERE m.player_id = p.id
      AND m.joined_at <= g.starts_at
      AND (m.left_at IS NULL OR m.left_at > g.starts_at)
  )
`;

export async function getGamesWithAttendance(
  teamId: number,
): Promise<GameWithAttendance[]> {
  const games = await pool.query<GameRow>(
    `SELECT id, team_id, opponent_name, opponent_color, starts_at
     FROM game WHERE team_id = $1
     ORDER BY starts_at ASC`,
    [teamId],
  );
  const statuses = await pool.query<PlayerStatusRow>(
    `${PLAYER_STATUS_SQL} AND g.team_id = $1 ORDER BY p.name ASC`,
    [teamId],
  );
  return assemble(games.rows, statuses.rows);
}

export async function getGameWithAttendance(
  teamId: number,
  gameId: number,
): Promise<GameWithAttendance | null> {
  const games = await pool.query<GameRow>(
    `SELECT id, team_id, opponent_name, opponent_color, starts_at
     FROM game WHERE team_id = $1 AND id = $2`,
    [teamId, gameId],
  );
  if (games.rows.length === 0) {
    return null;
  }
  const statuses = await pool.query<PlayerStatusRow>(
    `${PLAYER_STATUS_SQL} AND g.team_id = $1 AND g.id = $2 ORDER BY p.name ASC`,
    [teamId, gameId],
  );
  return assemble(games.rows, statuses.rows)[0]!;
}

export async function createGame(
  teamId: number,
  input: GameInput,
): Promise<Game> {
  const { rows } = await pool.query<GameRow>(
    `INSERT INTO game (team_id, opponent_name, opponent_color, starts_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, team_id, opponent_name, opponent_color, starts_at`,
    [teamId, input.opponentName, input.opponentColor, input.startsAt],
  );
  return toGame(rows[0]!);
}

export async function updateGame(
  teamId: number,
  gameId: number,
  input: GameInput,
): Promise<Game | null> {
  const { rows } = await pool.query<GameRow>(
    `UPDATE game SET opponent_name = $3, opponent_color = $4, starts_at = $5
     WHERE id = $2 AND team_id = $1
     RETURNING id, team_id, opponent_name, opponent_color, starts_at`,
    [teamId, gameId, input.opponentName, input.opponentColor, input.startsAt],
  );
  const row = rows[0];
  return row ? toGame(row) : null;
}

// Attendance rows cascade via the FK (the original deleted them explicitly).
export async function deleteGame(
  teamId: number,
  gameId: number,
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM game WHERE id = $2 AND team_id = $1`,
    [teamId, gameId],
  );
  return (result.rowCount ?? 0) > 0;
}
