import type {
  AttendanceStatus,
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
    id: row.id,
    teamId: row.team_id,
    opponentName: row.opponent_name,
    opponentColor: row.opponent_color,
    startsAt: row.starts_at.toISOString(),
    players: playersByGame.get(row.id) ?? [],
  }));
}

// Every roster player appears under every game; the LEFT JOIN yields
// status null for players who haven't responded.
const PLAYER_STATUS_SQL = `
  SELECT g.id AS game_id, p.id AS player_id, p.name,
         p.counts_toward_minimum, a.status
  FROM game g
  JOIN player p ON p.team_id = g.team_id
  LEFT JOIN attendance a ON a.game_id = g.id AND a.player_id = p.id
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
    `${PLAYER_STATUS_SQL} WHERE g.team_id = $1 ORDER BY p.name ASC`,
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
    `${PLAYER_STATUS_SQL} WHERE g.team_id = $1 AND g.id = $2 ORDER BY p.name ASC`,
    [teamId, gameId],
  );
  return assemble(games.rows, statuses.rows)[0]!;
}
