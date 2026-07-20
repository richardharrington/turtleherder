import { describe, expect, it } from "vitest";
import { applyAttendance } from "./apply-attendance.js";
import type { GameWithAttendance } from "./schemas.js";

function game(id: number): GameWithAttendance {
  return {
    id,
    teamId: 1,
    opponentName: `Team ${id}`,
    opponentColor: null,
    startsAt: "2026-07-22T18:00:00.000Z",
    players: [
      { playerId: 1, name: "Alice", countsTowardMinimum: true, status: "yes" },
      { playerId: 2, name: "Bob", countsTowardMinimum: false, status: null },
    ],
  };
}

describe("applyAttendance", () => {
  it("updates only the targeted player in the targeted game", () => {
    const games = [game(1), game(2)];
    const next = applyAttendance(games, 2, 2, "not_sure");

    expect(next[1]!.players[1]!.status).toBe("not_sure");
    expect(next[1]!.players[0]!.status).toBe("yes");
    expect(next[0]!.players[1]!.status).toBeNull();
  });

  it("preserves object identity for untouched games and players", () => {
    const games = [game(1), game(2)];
    const next = applyAttendance(games, 2, 2, "no");

    expect(next[0]).toBe(games[0]);
    expect(next[1]).not.toBe(games[1]);
    expect(next[1]!.players[0]).toBe(games[1]!.players[0]);
  });

  it("handles the single-game cache shape", () => {
    const single = game(7);
    const next = applyAttendance(single, 7, 1, "no");
    expect(next.players[0]!.status).toBe("no");
    // A different game id is a no-op — the single-game page may hold a
    // game the mutation doesn't concern.
    expect(applyAttendance(single, 8, 1, "no")).toBe(single);
  });

  it("passes undefined through for never-fetched caches", () => {
    expect(applyAttendance(undefined, 1, 1, "yes")).toBeUndefined();
  });
});
