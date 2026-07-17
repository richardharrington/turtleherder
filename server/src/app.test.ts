// API integration tests: the real Hono app against the real Postgres
// test database (turtleherder_test, created by docker/create-test-db.sql).
// DATABASE_URL must be set before app/db are imported, so those imports
// are dynamic.

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://turtleherder:turtleherder@localhost:5432/turtleherder_test";

// app.ts reads this at import time to derive the canonical host. Deliberately
// not the real domain: these tests shouldn't bake in a production fact.
process.env.APP_ORIGIN = "https://turtleherder.example";

import type {
  Game,
  GameWithAttendance,
  Me,
  Player,
  PlayerAccess,
  Team,
} from "@turtleherder/shared";
import { runner } from "node-pg-migrate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { app } = await import("./app.js");
const { pool } = await import("./db.js");

let gameIds: number[] = [];
let playerIds: number[] = [];
let zedId = 0; // a player on the *other* team

// Everyone below authenticates as Alice (a captain of testcats) unless a
// test passes a different cookie. null = signed out.
const ALICE = "th_session=alice-session";
const BOB = "th_session=bob-session"; // not a captain
const ZED = "th_session=zed-session"; // valid session, different team

function get(url: string, cookie: string | null = ALICE) {
  return app.request(url, {
    headers: cookie ? { cookie } : {},
  });
}

function jsonRequest(
  method: string,
  url: string,
  body: unknown,
  cookie: string | null = ALICE,
) {
  return app.request(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

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
    "TRUNCATE team, player, game, attendance, session RESTART IDENTITY CASCADE",
  );

  const team = await pool.query<{ id: number }>(
    `INSERT INTO team (name, slug, min_players, min_quota_players,
                       quota_noun_singular, quota_noun_plural, timezone)
     VALUES ('Testcats', 'testcats', 7, 2, 'woman', 'women', 'America/New_York')
     RETURNING id`,
  );
  const teamId = team.rows[0]!.id;

  const players = await pool.query<{ id: number }>(
    `INSERT INTO player (team_id, name, counts_toward_minimum, is_captain, join_token)
     VALUES ($1, 'Alice', true, true, 'alice-token'),
            ($1, 'Bob', false, false, 'bob-token'),
            ($1, 'Carol', true, false, 'carol-token')
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

  // A second team, to prove sessions don't cross the wall between teams.
  const otherTeam = await pool.query<{ id: number }>(
    `INSERT INTO team (name, slug, min_players, min_quota_players,
                       quota_noun_singular, quota_noun_plural, timezone)
     VALUES ('Othercats', 'othercats', 7, 2, 'woman', 'women', 'America/New_York')
     RETURNING id`,
  );
  const zed = await pool.query<{ id: number }>(
    `INSERT INTO player (team_id, name, counts_toward_minimum, is_captain, join_token)
     VALUES ($1, 'Zed', false, true, 'zed-token') RETURNING id`,
    [otherTeam.rows[0]!.id],
  );
  zedId = zed.rows[0]!.id;

  await pool.query(
    `INSERT INTO session (id, player_id)
     VALUES ('alice-session', $1), ('bob-session', $2), ('zed-session', $3)`,
    [playerIds[0], playerIds[1], zedId],
  );
});

afterAll(async () => {
  await pool.end();
});

describe("canonical host redirect", () => {
  it("301s www to the canonical origin, keeping path and query", async () => {
    const res = await app.request(
      "https://www.turtleherder.example/testcats/games/3?tab=roster",
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      "https://turtleherder.example/testcats/games/3?tab=roster",
    );
  });

  it("redirects www before the wall, so it never 401s a signed-out visitor", async () => {
    const res = await app.request(
      "https://www.turtleherder.example/api/teams/testcats",
    );
    expect(res.status).toBe(301);
  });

  it("leaves the canonical host alone", async () => {
    const res = await app.request("https://turtleherder.example/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  // Railway's healthchecks arrive with a Host header of their own. Redirecting
  // those would fail the healthcheck and take the deploy down with it.
  it("leaves an unrecognized host alone rather than redirecting it", async () => {
    const res = await app.request("http://healthcheck.railway.app/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("GET /api/health", () => {
  it("responds ok without a session", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("the wall", () => {
  it("401s every team-scoped endpoint without a cookie", async () => {
    for (const url of [
      "/api/teams/testcats",
      "/api/teams/testcats/games",
      "/api/teams/testcats/players",
      "/api/teams/testcats/me",
      "/api/teams/testcats/access",
    ]) {
      const res = await get(url, null);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("401s writes without a cookie", async () => {
    const res = await jsonRequest(
      "PUT",
      `/api/teams/testcats/games/${gameIds[0]}/attendance/${playerIds[0]}`,
      { status: "yes" },
      null,
    );
    expect(res.status).toBe(401);
  });

  it("401s a session id that doesn't exist", async () => {
    const res = await get("/api/teams/testcats", "th_session=made-up");
    expect(res.status).toBe(401);
  });

  it("401s a valid session from a different team", async () => {
    const res = await get("/api/teams/testcats", ZED);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("401s an unknown slug even with a valid session (no enumeration)", async () => {
    const res = await get("/api/teams/nope");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("401s an expired session", async () => {
    await pool.query(
      `INSERT INTO session (id, player_id, created_at, last_seen_at)
       VALUES ('expired-session', $1, now() - interval '400 days',
               now() - interval '400 days')`,
      [playerIds[0]],
    );
    const res = await get("/api/teams/testcats", "th_session=expired-session");
    expect(res.status).toBe(401);
  });
});

describe("GET /join/:token", () => {
  it("exchanges a valid token for a session cookie and redirects home", async () => {
    const res = await app.request("/join/carol-token");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/testcats");

    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain("th_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");

    // The cookie it set is a working session for the team's API.
    const sessionId = /th_session=([^;]+)/.exec(setCookie)![1]!;
    const api = await get("/api/teams/testcats", `th_session=${sessionId}`);
    expect(api.status).toBe(200);
  });

  it("redirects an unknown token to /?join=invalid without a cookie", async () => {
    const res = await app.request("/join/no-such-token");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/?join=invalid");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("prunes expired sessions as a side effect", async () => {
    await pool.query(
      `INSERT INTO session (id, player_id, created_at, last_seen_at)
       VALUES ('prune-me', $1, now() - interval '400 days',
               now() - interval '400 days')`,
      [playerIds[0]],
    );
    await app.request("/join/no-such-token");
    const { rows } = await pool.query(
      `SELECT 1 FROM session WHERE id = 'prune-me'`,
    );
    expect(rows).toHaveLength(0);
  });
});

describe("rolling session renewal", () => {
  it("touches the session and re-issues the cookie when the throttle has lapsed", async () => {
    await pool.query(
      `INSERT INTO session (id, player_id, last_seen_at)
       VALUES ('stale-session', $1, now() - interval '2 hours')`,
      [playerIds[0]],
    );
    const res = await get("/api/teams/testcats", "th_session=stale-session");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("th_session=stale-session");

    const { rows } = await pool.query<{ recent: boolean }>(
      `SELECT last_seen_at > now() - interval '1 minute' AS recent
       FROM session WHERE id = 'stale-session'`,
    );
    expect(rows[0]!.recent).toBe(true);
  });

  it("skips the write and cookie inside the throttle window", async () => {
    const res = await get("/api/teams/testcats"); // alice-session, seen just now
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("GET /api/teams/:slug/me", () => {
  it("returns the signed-in captain", async () => {
    const res = await get("/api/teams/testcats/me");
    expect(res.status).toBe(200);
    expect((await res.json()) as Me).toEqual({
      playerId: playerIds[0],
      name: "Alice",
      isCaptain: true,
    });
  });

  it("returns a non-captain as such", async () => {
    const res = await get("/api/teams/testcats/me", BOB);
    expect(((await res.json()) as Me).isCaptain).toBe(false);
  });
});

describe("GET /api/teams/:slug", () => {
  it("returns the team", async () => {
    const res = await get("/api/teams/testcats");
    expect(res.status).toBe(200);
    const team = (await res.json()) as Team;
    expect(team.name).toBe("Testcats");
    expect(team.minPlayers).toBe(7);
    expect(team.quotaNounPlural).toBe("women");
  });
});

describe("GET /api/teams/:slug/games", () => {
  it("returns games in chronological order with every roster player", async () => {
    const res = await get("/api/teams/testcats/games");
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
});

describe("GET /api/teams/:slug/games/:gameId", () => {
  it("returns a single game", async () => {
    const res = await get(`/api/teams/testcats/games/${gameIds[0]}`);
    expect(res.status).toBe(200);
    const game = (await res.json()) as GameWithAttendance;
    expect(game.opponentName).toBe("Wombats");
    expect(game.players).toHaveLength(3);
  });

  it("404s for an unknown game id", async () => {
    const res = await get("/api/teams/testcats/games/999999");
    expect(res.status).toBe(404);
  });

  it("404s for a non-numeric game id", async () => {
    const res = await get("/api/teams/testcats/games/abc");
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/teams/:slug/games/:gameId/attendance/:playerId", () => {
  function put(gameId: number, playerId: number, body: unknown) {
    return jsonRequest(
      "PUT",
      `/api/teams/testcats/games/${gameId}/attendance/${playerId}`,
      body,
    );
  }

  it("creates a response and then updates it", async () => {
    const bob = playerIds[1]!;

    const created = await put(gameIds[0]!, bob, { status: "not_sure" });
    expect(created.status).toBe(200);

    const updated = await put(gameIds[0]!, bob, { status: "no" });
    expect(updated.status).toBe(200);

    const res = await get(`/api/teams/testcats/games/${gameIds[0]}`);
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

describe("player CRUD", () => {
  it("lists players alphabetically", async () => {
    const res = await get("/api/teams/testcats/players");
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
    const games = await get("/api/teams/testcats/games");
    const wombats = ((await games.json()) as GameWithAttendance[])[0]!;
    const davina = wombats.players.find((p) => p.playerId === dave.id);
    expect(davina).toMatchObject({ name: "Davina", status: null });

    // New players get a join token automatically.
    const access = await get("/api/teams/testcats/access");
    const davinaAccess = ((await access.json()) as PlayerAccess[]).find(
      (a) => a.playerId === dave.id,
    );
    expect(davinaAccess!.joinToken).toBeTruthy();

    const deleted = await app.request(
      `/api/teams/testcats/players/${dave.id}`,
      { method: "DELETE", headers: { cookie: ALICE } },
    );
    expect(deleted.status).toBe(204);

    const list = await get("/api/teams/testcats/players");
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
      headers: { cookie: ALICE },
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
      { method: "DELETE", headers: { cookie: ALICE } },
    );
    expect(deleted.status).toBe(204);

    const res = await get(`/api/teams/testcats/games/${game.id}`);
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
      headers: { cookie: ALICE },
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

// Runs last: regenerating/revoking kills sessions other suites rely on.
describe("access management (captains only)", () => {
  it("403s a non-captain on every access endpoint", async () => {
    const list = await get("/api/teams/testcats/access", BOB);
    expect(list.status).toBe(403);
    expect(await list.json()).toEqual({ error: "forbidden" });

    for (const verb of ["regenerate-token", "revoke-token"]) {
      const res = await app.request(
        `/api/teams/testcats/players/${playerIds[2]}/${verb}`,
        { method: "POST", headers: { cookie: BOB } },
      );
      expect(res.status).toBe(403);
    }
  });

  it("lists every player's current join link, alphabetically", async () => {
    const res = await get("/api/teams/testcats/access");
    expect(res.status).toBe(200);
    const access = (await res.json()) as PlayerAccess[];
    expect(access.map((a) => a.name)).toEqual(["Alice", "Bob", "Carol"]);
    expect(access.map((a) => a.joinToken)).toEqual([
      "alice-token",
      "bob-token",
      "carol-token",
    ]);
    expect(access.every((a) => a.revokedAt === null)).toBe(true);
  });

  it("regenerates a token and kills the player's sessions", async () => {
    const res = await app.request(
      `/api/teams/testcats/players/${playerIds[1]}/regenerate-token`,
      { method: "POST", headers: { cookie: ALICE } },
    );
    expect(res.status).toBe(200);
    const access = (await res.json()) as PlayerAccess;
    expect(access.joinToken).toBeTruthy();
    expect(access.joinToken).not.toBe("bob-token");
    expect(access.revokedAt).toBeNull();

    // The old link is dead, the new one works.
    const oldJoin = await app.request("/join/bob-token");
    expect(oldJoin.headers.get("location")).toBe("/?join=invalid");
    const newJoin = await app.request(`/join/${access.joinToken}`);
    expect(newJoin.headers.get("location")).toBe("/testcats");

    // Bob's existing session was killed.
    const asBob = await get("/api/teams/testcats", BOB);
    expect(asBob.status).toBe(401);
  });

  it("revokes a token and kills the player's sessions", async () => {
    const res = await app.request(
      `/api/teams/testcats/players/${playerIds[2]}/revoke-token`,
      { method: "POST", headers: { cookie: ALICE } },
    );
    expect(res.status).toBe(200);
    const access = (await res.json()) as PlayerAccess;
    expect(access.joinToken).toBeNull();
    expect(access.revokedAt).not.toBeNull();

    const join = await app.request("/join/carol-token");
    expect(join.headers.get("location")).toBe("/?join=invalid");

    // The access list withholds the revoked token too.
    const list = await get("/api/teams/testcats/access");
    const carol = ((await list.json()) as PlayerAccess[]).find(
      (a) => a.playerId === playerIds[2],
    );
    expect(carol!.joinToken).toBeNull();

    // A repeat revoke keeps the original revocation time.
    const again = await app.request(
      `/api/teams/testcats/players/${playerIds[2]}/revoke-token`,
      { method: "POST", headers: { cookie: ALICE } },
    );
    expect(((await again.json()) as PlayerAccess).revokedAt).toBe(
      access.revokedAt,
    );
  });

  it("regenerating a revoked player restores access", async () => {
    const res = await app.request(
      `/api/teams/testcats/players/${playerIds[2]}/regenerate-token`,
      { method: "POST", headers: { cookie: ALICE } },
    );
    const access = (await res.json()) as PlayerAccess;
    expect(access.joinToken).toBeTruthy();
    expect(access.revokedAt).toBeNull();

    const join = await app.request(`/join/${access.joinToken}`);
    expect(join.headers.get("location")).toBe("/testcats");
  });

  it("404s for a player on another team", async () => {
    const res = await app.request(
      `/api/teams/testcats/players/${zedId}/regenerate-token`,
      { method: "POST", headers: { cookie: ALICE } },
    );
    expect(res.status).toBe(404);
  });
});
