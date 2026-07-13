// API integration tests: the real Hono app against the real Postgres
// test database (turtleherder_test, created by docker/create-test-db.sql).
// DATABASE_URL must be set before app/db are imported, so those imports
// are dynamic.

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://turtleherder:turtleherder@localhost:5432/turtleherder_test";

import type { Game, GameWithAttendance, Player, Team } from "@turtleherder/shared";
import { runner } from "node-pg-migrate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { app } = await import("./app.js");
const { pool } = await import("./db.js");

let gameIds: number[] = [];
let playerIds: number[] = [];

beforeAll(async () => {
  await runner({
    databaseUrl: process.env.DATABASE_URL!,
    dir: new URL("../migrations", import.meta.url).pathname,
    direction: "up",
    migrationsTable: "pgmigrations",
    count: Infinity,
    log: () => {},
  });

  await pool.query(
    "TRUNCATE team, player, game, attendance RESTART IDENTITY CASCADE",
  );

  const team = await pool.query<{ id: number }>(
    `INSERT INTO team (name, slug, min_players, min_quota_players,
                       quota_noun_singular, quota_noun_plural, timezone)
     VALUES ('Testcats', 'testcats', 7, 2, 'woman', 'women', 'America/New_York')
     RETURNING id`,
  );
  const teamId = team.rows[0]!.id;

  const players = await pool.query<{ id: number }>(
    `INSERT INTO player (team_id, name, counts_toward_minimum)
     VALUES ($1, 'Alice', true), ($1, 'Bob', false), ($1, 'Carol', true)
     RETURNING id`,
    [teamId],
  );
  playerIds = players.rows.map((r) => r.id);

  const games = await pool.query<{ id: number }>(
    `INSERT INTO game (team_id, opponent_name, opponent_color, starts_at)
     VALUES ($1, 'Wombats', 'red', now() + interval '3 days'),
            ($1, NULL, NULL, now() + interval '10 days')
     RETURNING id`,
    [teamId],
  );
  gameIds = games.rows.map((r) => r.id);

  await pool.query(
    `INSERT INTO attendance (player_id, game_id, status) VALUES ($1, $2, 'yes')`,
    [playerIds[0], gameIds[0]],
  );
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/health", () => {
  it("responds ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("GET /api/teams/:slug", () => {
  it("returns the team", async () => {
    const res = await app.request("/api/teams/testcats");
    expect(res.status).toBe(200);
    const team = (await res.json()) as Team;
    expect(team.name).toBe("Testcats");
    expect(team.minPlayers).toBe(7);
    expect(team.quotaNounPlural).toBe("women");
  });

  it("404s for an unknown slug", async () => {
    const res = await app.request("/api/teams/nope");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/teams/:slug/games", () => {
  it("returns games in chronological order with every roster player", async () => {
    const res = await app.request("/api/teams/testcats/games");
    expect(res.status).toBe(200);
    const games = (await res.json()) as GameWithAttendance[];
    expect(games).toHaveLength(2);
    expect(games[0]!.opponentName).toBe("Wombats");
    expect(games[1]!.opponentName).toBeNull(); // bye week

    const wombats = games[0]!;
    expect(wombats.players.map((p) => p.name)).toEqual([
      "Alice",
      "Bob",
      "Carol",
    ]);
    expect(wombats.players[0]!.status).toBe("yes");
    expect(wombats.players[1]!.status).toBeNull(); // hasn't responded
  });

  it("404s for an unknown team", async () => {
    const res = await app.request("/api/teams/nope/games");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/teams/:slug/games/:gameId", () => {
  it("returns a single game", async () => {
    const res = await app.request(`/api/teams/testcats/games/${gameIds[0]}`);
    expect(res.status).toBe(200);
    const game = (await res.json()) as GameWithAttendance;
    expect(game.opponentName).toBe("Wombats");
    expect(game.players).toHaveLength(3);
  });

  it("404s for an unknown game id", async () => {
    const res = await app.request("/api/teams/testcats/games/999999");
    expect(res.status).toBe(404);
  });

  it("404s for a non-numeric game id", async () => {
    const res = await app.request("/api/teams/testcats/games/abc");
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/teams/:slug/games/:gameId/attendance/:playerId", () => {
  function put(gameId: number, playerId: number, body: unknown) {
    return app.request(
      `/api/teams/testcats/games/${gameId}/attendance/${playerId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  }

  it("creates a response and then updates it", async () => {
    const bob = playerIds[1]!;

    const created = await put(gameIds[0]!, bob, { status: "not_sure" });
    expect(created.status).toBe(200);

    const updated = await put(gameIds[0]!, bob, { status: "no" });
    expect(updated.status).toBe(200);

    const res = await app.request(`/api/teams/testcats/games/${gameIds[0]}`);
    const game = (await res.json()) as GameWithAttendance;
    const bobRow = game.players.find((p) => p.playerId === bob);
    expect(bobRow!.status).toBe("no");
  });

  it("rejects an invalid status", async () => {
    const res = await put(gameIds[0]!, playerIds[0]!, { status: "perhaps" });
    expect(res.status).toBe(400);
  });

  it("404s for a player that doesn't exist on this team", async () => {
    const res = await put(gameIds[0]!, 999999, { status: "yes" });
    expect(res.status).toBe(404);
  });
});

function jsonRequest(method: string, url: string, body: unknown) {
  return app.request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("player CRUD", () => {
  it("lists players alphabetically", async () => {
    const res = await app.request("/api/teams/testcats/players");
    expect(res.status).toBe(200);
    const players = (await res.json()) as Player[];
    expect(players.map((p) => p.name)).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("creates, updates, and deletes a player", async () => {
    const created = await jsonRequest("POST", "/api/teams/testcats/players", {
      name: "Dave",
      countsTowardMinimum: false,
    });
    expect(created.status).toBe(201);
    const dave = (await created.json()) as Player;
    expect(dave.name).toBe("Dave");

    const updated = await jsonRequest(
      "PUT",
      `/api/teams/testcats/players/${dave.id}`,
      { name: "Davina", countsTowardMinimum: true },
    );
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as Player).countsTowardMinimum).toBe(true);

    // New players appear under every game as "hasn't responded".
    const games = await app.request("/api/teams/testcats/games");
    const wombats = ((await games.json()) as GameWithAttendance[])[0]!;
    const davina = wombats.players.find((p) => p.playerId === dave.id);
    expect(davina).toMatchObject({ name: "Davina", status: null });

    const deleted = await app.request(
      `/api/teams/testcats/players/${dave.id}`,
      { method: "DELETE" },
    );
    expect(deleted.status).toBe(204);

    const list = await app.request("/api/teams/testcats/players");
    const names = ((await list.json()) as Player[]).map((p) => p.name);
    expect(names).not.toContain("Davina");
  });

  it("rejects a blank name", async () => {
    const res = await jsonRequest("POST", "/api/teams/testcats/players", {
      name: "   ",
      countsTowardMinimum: false,
    });
    expect(res.status).toBe(400);
  });

  it("404s when deleting a player from the wrong team", async () => {
    const res = await app.request("/api/teams/testcats/players/999999", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

describe("game CRUD", () => {
  it("creates, updates, and deletes a game", async () => {
    const created = await jsonRequest("POST", "/api/teams/testcats/games", {
      opponentName: "Ocelots",
      opponentColor: "blue",
      startsAt: "2026-08-01T22:30:00.000Z",
    });
    expect(created.status).toBe(201);
    const game = (await created.json()) as Game;
    expect(game.opponentName).toBe("Ocelots");

    const updated = await jsonRequest(
      "PUT",
      `/api/teams/testcats/games/${game.id}`,
      {
        opponentName: "Ocelots",
        opponentColor: "teal",
        startsAt: "2026-08-01T23:00:00.000Z",
      },
    );
    expect(updated.status).toBe(200);
    const updatedGame = (await updated.json()) as Game;
    expect(updatedGame.opponentColor).toBe("teal");
    expect(updatedGame.startsAt).toBe("2026-08-01T23:00:00.000Z");

    const deleted = await app.request(
      `/api/teams/testcats/games/${game.id}`,
      { method: "DELETE" },
    );
    expect(deleted.status).toBe(204);

    const res = await app.request(`/api/teams/testcats/games/${game.id}`);
    expect(res.status).toBe(404);
  });

  it("creates a bye week (null opponent)", async () => {
    const created = await jsonRequest("POST", "/api/teams/testcats/games", {
      opponentName: null,
      opponentColor: null,
      startsAt: "2026-08-08T22:30:00.000Z",
    });
    expect(created.status).toBe(201);
    const game = (await created.json()) as Game;
    expect(game.opponentName).toBeNull();
    await app.request(`/api/teams/testcats/games/${game.id}`, {
      method: "DELETE",
    });
  });

  it("rejects a malformed timestamp", async () => {
    const res = await jsonRequest("POST", "/api/teams/testcats/games", {
      opponentName: "Ocelots",
      opponentColor: null,
      startsAt: "next tuesday",
    });
    expect(res.status).toBe(400);
  });
});
