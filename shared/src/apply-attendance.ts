import type { AttendanceStatus, GameWithAttendance } from "./schemas.js";

// The optimistic-attendance cache transform (milestone 5.8): one player's
// answer applied to whatever shape the games cache holds — the schedule
// list or a single game. Untouched games and players keep their object
// identity so unrelated rows don't re-render, and unknown shapes pass
// through unchanged (the rollback path restores snapshots wholesale).

function applyToGame(
  game: GameWithAttendance,
  gameId: number,
  playerId: number,
  status: AttendanceStatus,
): GameWithAttendance {
  if (game.id !== gameId) return game;
  return {
    ...game,
    players: game.players.map((player) =>
      player.playerId === playerId ? { ...player, status } : player,
    ),
  };
}

export function applyAttendance<
  T extends GameWithAttendance | GameWithAttendance[] | undefined,
>(data: T, gameId: number, playerId: number, status: AttendanceStatus): T {
  if (data === undefined) return data;
  if (Array.isArray(data)) {
    return data.map((game) =>
      applyToGame(game, gameId, playerId, status),
    ) as T;
  }
  return applyToGame(
    data as GameWithAttendance,
    gameId,
    playerId,
    status,
  ) as T;
}
