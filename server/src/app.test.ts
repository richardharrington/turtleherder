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
  FormerPlayer,
  Game,
  GameWithAttendance,
  Me,
  Player,
  PlayerAccess,
  SessionTeam,
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

async function insertSession(
  id: string,
  playerId: number,
  timestamps?: { createdAt: Date; lastSeenAt: Date },
): Promise<void> {
  await pool.query(
    `INSERT INTO session (id, created_at, last_seen_at)
     VALUES ($1, COALESCE($2, now()), COALESCE($3, now()))`,
    [id, timestamps?.createdAt ?? null, timestamps?.lastSeenAt ?? null],
  );
  await pool.query(
    `INSERT INTO session_player (session_id, player_id, team_id)
     SELECT $1, p.id, p.team_id FROM player p WHERE p.id = $2`,
    [id, playerId],
  );
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
    "TRUNCATE team, player, roster_membership, game, attendance, session RESTART IDENTITY CASCADE",
  );

  const team = await pool.query<{ id: number }>(
    `INSERT INTO team (name, slug, full_side, min_to_play, women_floor,
                       floor_type, quota_noun_singular, quota_noun_plural, timezone)
     VALUES ('Testcats', 'testcats', 7, 7, 2, 'play_down',
             'woman', 'women', 'America/New_York')
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
  // Rosters derive from membership stints; '-infinity' (the backfill
  // sentinel) keeps the fixture players on every fixture game.
  await pool.query(
    `INSERT INTO roster_membership (player_id, joined_at)
     SELECT id, '-infinity' FROM player`,
  );

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
    `INSERT INTO team (name, slug, full_side, min_to_play, women_floor,
                       floor_type, quota_noun_singular, quota_noun_plural, timezone)
     VALUES ('Othercats', 'othercats', 7, 7, 2, 'play_down',
             'woman', 'women', 'America/New_York')
     RETURNING id`,
  );
  const zed = await pool.query<{ id: number }>(
    `INSERT INTO player (team_id, name, counts_toward_minimum, is_captain, join_token)
     VALUES ($1, 'Zed', false, true, 'zed-token') RETURNING id`,
    [otherTeam.rows[0]!.id],
  );
  zedId = zed.rows[0]!.id;
  await pool.query(
    `INSERT INTO roster_membership (player_id, joined_at)
     VALUES ($1, '-infinity')`,
    [zedId],
  );

  // These SQL fixtures model teams born before the setup lifecycle. Public
  // signup below deliberately creates its team with this stamp null.
  await pool.query(`UPDATE team SET setup_completed_at = now()`);

  await insertSession("alice-session", playerIds[0]!);
  await insertSession("bob-session", playerIds[1]!);
  await insertSession("zed-session", zedId);
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

describe("public team creation and settings", () => {
  const input = {
    name: "Sunset Rovers",
    slug: "sunset-rovers",
    timezone: "America/Los_Angeles",
    captain: "Sam Rivera",
    website: "",
  };
  let creatorCookie = "";

  it("creates an in-setup team, captain, open stint, and signed-in key", async () => {
    const res = await jsonRequest("POST", "/api/teams", input, null);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { slug: string; captainJoinUrl: string };
    expect(body.slug).toBe("sunset-rovers");
    expect(body.captainJoinUrl).toMatch(
      /^https:\/\/turtleherder\.example\/join\/[A-Za-z0-9_-]+$/,
    );
    creatorCookie = res.headers.get("set-cookie")!.split(";")[0]!;

    const teamRes = await get("/api/teams/sunset-rovers", creatorCookie);
    expect(teamRes.status).toBe(200);
    expect((await teamRes.json()) as Team).toMatchObject({
      name: "Sunset Rovers",
      slug: "sunset-rovers",
      fullSide: null,
      minToPlay: null,
      womenFloor: null,
      quotaNounSingular: null,
      quotaNounPlural: null,
      restrictingNounSingular: null,
      restrictingNounPlural: null,
      setupCompletedAt: null,
    });
    const me = await get("/api/teams/sunset-rovers/me", creatorCookie);
    expect(await me.json()).toMatchObject({ name: "Sam Rivera", isCaptain: true });
    const stint = await pool.query(
      `SELECT 1 FROM roster_membership m
       JOIN player p ON p.id = m.player_id
       JOIN team t ON t.id = p.team_id
       WHERE t.slug = 'sunset-rovers' AND m.left_at IS NULL`,
    );
    expect(stint.rows).toHaveLength(1);
  });

  it("blocks player links and games until rules are completed, then stamps setup", async () => {
    const blockedPlayer = await jsonRequest(
      "POST",
      "/api/teams/sunset-rovers/players",
      { name: "Taylor", countsTowardMinimum: false },
      creatorCookie,
    );
    expect(blockedPlayer.status).toBe(409);
    expect(await blockedPlayer.json()).toEqual({ error: "team setup incomplete" });

    const blockedGame = await jsonRequest(
      "POST",
      "/api/teams/sunset-rovers/games",
      { opponentName: "Moonrise", opponentColor: null, startsAt: "2026-08-01T19:00:00.000Z" },
      creatorCookie,
    );
    expect(blockedGame.status).toBe(409);

    const completed = await jsonRequest(
      "PUT",
      "/api/teams/sunset-rovers/rules",
      {
        fullSide: 7,
        minToPlay: 5,
        menCeiling: null,
        womenFloor: null,
        floorType: null,
        keeperScoping: "included",
        quotaNounSingular: null,
        quotaNounPlural: null,
        restrictingNounSingular: null,
        restrictingNounPlural: null,
      },
      creatorCookie,
    );
    expect(completed.status).toBe(200);
    expect((await completed.json()) as Team).toMatchObject({
      fullSide: 7,
      minToPlay: 5,
      setupCompletedAt: expect.any(String),
    });

    const player = await jsonRequest(
      "POST",
      "/api/teams/sunset-rovers/players",
      { name: "Taylor", countsTowardMinimum: false },
      creatorCookie,
    );
    expect(player.status).toBe(201);
  });

  it("stores all four rule-shape fields and both noun pairs", async () => {
    const updated = await jsonRequest(
      "PUT",
      "/api/teams/sunset-rovers/rules",
      {
        fullSide: 7,
        minToPlay: 5,
        menCeiling: 5,
        womenFloor: 1,
        floorType: "forfeit",
        keeperScoping: "excluded",
        quotaNounSingular: "woman",
        quotaNounPlural: "women",
        restrictingNounSingular: "man",
        restrictingNounPlural: "men",
      },
      creatorCookie,
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()) as Team).toMatchObject({
      menCeiling: 5,
      womenFloor: 1,
      floorType: "forfeit",
      keeperScoping: "excluded",
      restrictingNounSingular: "man",
      restrictingNounPlural: "men",
    });
  });

  it("adds another created team to an existing keyring", async () => {
    const existingSessionId = creatorCookie.split("=")[1]!;
    const res = await jsonRequest(
      "POST",
      "/api/teams",
      { ...input, name: "Sunset Reserves", slug: "sunset-reserves" },
      creatorCookie,
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toContain(`th_session=${existingSessionId}`);
    const original = await get("/api/teams/sunset-rovers", creatorCookie);
    const reserves = await get("/api/teams/sunset-reserves", creatorCookie);
    expect(original.status).toBe(200);
    expect(reserves.status).toBe(200);
  });

  it("reports collisions only on submit and rejects reserved slugs", async () => {
    const collision = await jsonRequest("POST", "/api/teams", input, null);
    expect(collision.status).toBe(409);
    expect(await collision.json()).toEqual({ error: "slug taken" });

    const reserved = await jsonRequest(
      "POST",
      "/api/teams",
      { ...input, name: "API Team", slug: "api" },
      null,
    );
    expect(reserved.status).toBe(400);
  });

  it("silently discards a honeypot submission", async () => {
    const res = await jsonRequest(
      "POST",
      "/api/teams",
      { ...input, name: "Bot Team", slug: "bot-team", website: "https://spam.example" },
      null,
    );
    expect(res.status).toBe(204);
    const row = await pool.query(`SELECT 1 FROM team WHERE slug = 'bot-team'`);
    expect(row.rows).toHaveLength(0);
  });

  it("lets captains edit name/timezone but not slug, and 403s teammates", async () => {
    const updated = await jsonRequest(
      "PUT",
      "/api/teams/sunset-rovers/settings",
      { name: "Sunset United", timezone: "UTC" },
      creatorCookie,
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()) as Team).toMatchObject({
      name: "Sunset United",
      timezone: "UTC",
      slug: "sunset-rovers",
    });

    const forbidden = await jsonRequest(
      "PUT",
      "/api/teams/testcats/settings",
      { name: "Nope", timezone: "UTC" },
      BOB,
    );
    expect(forbidden.status).toBe(403);

    const forbiddenRules = await jsonRequest(
      "PUT",
      "/api/teams/testcats/rules",
      {
        fullSide: 7,
        minToPlay: 5,
        menCeiling: null,
        womenFloor: null,
        floorType: null,
        keeperScoping: "included",
        quotaNounSingular: null,
        quotaNounPlural: null,
        restrictingNounSingular: null,
        restrictingNounPlural: null,
      },
      BOB,
    );
    expect(forbiddenRules.status).toBe(403);
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
    const expiredAt = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    await insertSession("expired-session", playerIds[0]!, {
      createdAt: expiredAt,
      lastSeenAt: expiredAt,
    });
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
    const expiredAt = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    await insertSession("prune-me", playerIds[0]!, {
      createdAt: expiredAt,
      lastSeenAt: expiredAt,
    });
    await app.request("/join/no-such-token");
    const { rows } = await pool.query(
      `SELECT 1 FROM session WHERE id = 'prune-me'`,
    );
    expect(rows).toHaveLength(0);
  });
});

describe("rolling session renewal", () => {
  it("touches the session and re-issues the cookie when the throttle has lapsed", async () => {
    const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await insertSession("stale-session", playerIds[0]!, {
      createdAt: staleAt,
      lastSeenAt: staleAt,
    });
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

describe("multi-team keyring", () => {
  const KEYRING = "th_session=keyring-session";
  let alphaId = 0;
  let alphaOtherId = 0;
  let betaId = 0;

  beforeAll(async () => {
    const teams = await pool.query<{ id: number; slug: string }>(
      `INSERT INTO team (name, slug, full_side, min_to_play, women_floor,
                         floor_type, quota_noun_singular, quota_noun_plural, timezone)
       VALUES ('Alpha Club', 'alpha-club', 1, 1, NULL, NULL,
               NULL, NULL, 'UTC'),
              ('Beta Club', 'beta-club', 1, 1, NULL, NULL,
               NULL, NULL, 'UTC')
       RETURNING id, slug`,
    );
    const alphaTeamId = teams.rows.find((row) => row.slug === "alpha-club")!.id;
    const betaTeamId = teams.rows.find((row) => row.slug === "beta-club")!.id;
    const players = await pool.query<{ id: number; join_token: string }>(
      `INSERT INTO player
         (team_id, name, counts_toward_minimum, is_captain, join_token)
       VALUES ($1, 'Alpha Person', false, true, 'alpha-key-token'),
              ($1, 'Alpha Alternate', false, false, 'alpha-alternate-token'),
              ($2, 'Beta Person', false, true, 'beta-key-token')
       RETURNING id, join_token`,
      [alphaTeamId, betaTeamId],
    );
    alphaId = players.rows.find((row) => row.join_token === "alpha-key-token")!.id;
    alphaOtherId = players.rows.find(
      (row) => row.join_token === "alpha-alternate-token",
    )!.id;
    betaId = players.rows.find((row) => row.join_token === "beta-key-token")!.id;
    await pool.query(
      `INSERT INTO roster_membership (player_id, joined_at)
       VALUES ($1, '-infinity'), ($2, '-infinity'), ($3, '-infinity')`,
      [alphaId, alphaOtherId, betaId],
    );
    await insertSession("keyring-session", alphaId);
  });

  it("enforces one honest player key per team in the database", async () => {
    await expect(
      pool.query(
        `INSERT INTO session_player (session_id, player_id, team_id)
         SELECT 'keyring-session', p.id, p.team_id FROM player p WHERE p.id = $1`,
        [alphaOtherId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await pool.query(`INSERT INTO session (id) VALUES ('constraint-session')`);
    const alphaTeamId = (
      await pool.query<{ team_id: number }>(
        `SELECT team_id FROM player WHERE id = $1`,
        [alphaId],
      )
    ).rows[0]!.team_id;
    await expect(
      pool.query(
        `INSERT INTO session_player (session_id, player_id, team_id)
         VALUES ('constraint-session', $1, $2)`,
        [betaId, alphaTeamId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("adds a second team's key to the existing session without replacing its cookie", async () => {
    const joined = await app.request("/join/beta-key-token", {
      headers: { cookie: KEYRING },
    });
    expect(joined.headers.get("location")).toBe("/beta-club");
    expect(joined.headers.get("set-cookie")).toBeNull();

    expect((await get("/api/teams/alpha-club", KEYRING)).status).toBe(200);
    expect((await get("/api/teams/beta-club", KEYRING)).status).toBe(200);
    const count = await pool.query<{ count: string }>(
      `SELECT count(*) FROM session_player WHERE session_id = 'keyring-session'`,
    );
    expect(Number(count.rows[0]!.count)).toBe(2);
  });

  it("re-tapping a same-team link replaces only that team's key", async () => {
    await app.request("/join/alpha-alternate-token", {
      headers: { cookie: KEYRING },
    });
    const alphaMe = await get("/api/teams/alpha-club/me", KEYRING);
    expect((await alphaMe.json()) as Me).toMatchObject({
      playerId: alphaOtherId,
      name: "Alpha Alternate",
    });
    const betaMe = await get("/api/teams/beta-club/me", KEYRING);
    expect((await betaMe.json()) as Me).toMatchObject({
      playerId: betaId,
      name: "Beta Person",
    });

    // Restore the captain key for the revocation test below; Beta remains.
    await app.request("/join/alpha-key-token", { headers: { cookie: KEYRING } });
    expect((await get("/api/teams/beta-club", KEYRING)).status).toBe(200);
  });

  it("lists every team and player identity held by the keyring", async () => {
    const res = await get("/api/session/teams", KEYRING);
    expect(res.status).toBe(200);
    expect((await res.json()) as SessionTeam[]).toEqual([
      {
        teamId: expect.any(Number),
        slug: "alpha-club",
        name: "Alpha Club",
        playerId: alphaId,
        playerName: "Alpha Person",
      },
      {
        teamId: expect.any(Number),
        slug: "beta-club",
        name: "Beta Club",
        playerId: betaId,
        playerName: "Beta Person",
      },
    ]);
  });

  it("revocation detaches one key and leaves the other team live", async () => {
    const revoked = await app.request(
      `/api/teams/beta-club/players/${betaId}/revoke-token`,
      { method: "POST", headers: { cookie: KEYRING } },
    );
    expect(revoked.status).toBe(200);
    expect((await get("/api/teams/beta-club", KEYRING)).status).toBe(401);
    expect((await get("/api/teams/alpha-club", KEYRING)).status).toBe(200);
    expect((await get("/api/session/teams", KEYRING)).status).toBe(200);
  });

  it("treats a live session with zero keys like no session", async () => {
    await pool.query(`INSERT INTO session (id) VALUES ('empty-keyring')`);
    expect(
      (await get("/api/teams/alpha-club", "th_session=empty-keyring")).status,
    ).toBe(401);
    const listed = await get(
      "/api/session/teams",
      "th_session=empty-keyring",
    );
    expect(await listed.json()).toEqual([]);
  });

  it("signs out the whole keyring and is idempotent for a dead session", async () => {
    await insertSession("signout-keyring", alphaId);
    await pool.query(
      `INSERT INTO session_player (session_id, player_id, team_id)
       SELECT 'signout-keyring', p.id, p.team_id FROM player p WHERE p.id = $1`,
      [betaId],
    );
    const cookie = "th_session=signout-keyring";
    const signedOut = await app.request("/api/session/sign-out", {
      method: "POST",
      headers: { cookie },
    });
    expect(signedOut.status).toBe(204);
    expect(signedOut.headers.get("set-cookie")).toContain("th_session=");
    expect(signedOut.headers.get("set-cookie")).toContain("Max-Age=0");
    const gone = await pool.query(
      `SELECT 1 FROM session WHERE id = 'signout-keyring'`,
    );
    expect(gone.rows).toHaveLength(0);

    const again = await app.request("/api/session/sign-out", {
      method: "POST",
      headers: { cookie },
    });
    expect(again.status).toBe(204);
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
    expect(team.fullSide).toBe(7);
    expect(team.minToPlay).toBe(7);
    expect(team.womenFloor).toBe(2);
    expect(team.floorType).toBe("play_down");
    expect(team.keeperScoping).toBe("included");
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

// ---- Roster history (milestone 5.5) ----
// A dedicated team so departures here can't disturb the testcats fixtures
// the other suites rely on. Bea (captain) does the API calls; Ann is the
// player who leaves. Tests in this block build on one another in order.
describe("roster history", () => {
  const BEA = "th_session=hist-bea-session";
  const CAL = "th_session=hist-cal-session"; // active non-captain
  const ANN = "th_session=hist-ann-session";
  let annId = 0;
  let beaId = 0;
  let calId = 0;
  let pastGameId = 0;
  let futureGameId = 0;

  beforeAll(async () => {
    const team = await pool.query<{ id: number }>(
      `INSERT INTO team (name, slug, full_side, min_to_play, women_floor,
                         floor_type, quota_noun_singular, quota_noun_plural, timezone)
       VALUES ('Histcats', 'histcats', 7, 7, 2, 'play_down',
               'woman', 'women', 'America/New_York')
       RETURNING id`,
    );
    const teamId = team.rows[0]!.id;
    await pool.query(`UPDATE team SET setup_completed_at = now() WHERE id = $1`, [teamId]);
    const players = await pool.query<{ id: number }>(
      `INSERT INTO player (team_id, name, counts_toward_minimum, is_captain, join_token)
       VALUES ($1, 'Ann', true, false, 'ann-token'),
              ($1, 'Bea', false, true, 'bea-token'),
              ($1, 'Cal', false, false, 'cal-token')
       RETURNING id`,
      [teamId],
    );
    [annId, beaId, calId] = players.rows.map((r) => r.id) as [
      number,
      number,
      number,
    ];
    await pool.query(
      `INSERT INTO roster_membership (player_id, joined_at)
       VALUES ($1, '-infinity'), ($2, '-infinity'), ($3, '-infinity')`,
      [annId, beaId, calId],
    );
    const games = await pool.query<{ id: number }>(
      `INSERT INTO game (team_id, opponent_name, opponent_color, starts_at)
       VALUES ($1, 'Januaries', NULL, now() - interval '2 days'),
              ($1, 'Junebugs', NULL, now() + interval '2 days')
       RETURNING id`,
      [teamId],
    );
    [pastGameId, futureGameId] = games.rows.map((r) => r.id) as [
      number,
      number,
    ];
    // Ann's responses: one on a played game (history that must survive her
    // departure) and one on an upcoming game (the RSVP-then-quit case).
    // Inserted via SQL so the attendance lock can't reject the past row.
    await pool.query(
      `INSERT INTO attendance (player_id, game_id, status)
       VALUES ($1, $2, 'yes'), ($1, $3, 'yes')`,
      [annId, pastGameId, futureGameId],
    );
    await insertSession("hist-bea-session", beaId);
    await insertSession("hist-cal-session", calId);
    await insertSession("hist-ann-session", annId);
    // Ann's browser also holds an unrelated Othercats key. Her departure
    // must detach Histcats without deleting this whole keyring.
    await pool.query(
      `INSERT INTO session_player (session_id, player_id, team_id)
       SELECT 'hist-ann-session', p.id, p.team_id FROM player p WHERE p.id = $1`,
      [zedId],
    );
  });

  async function gameRoster(gameId: number): Promise<GameWithAttendance> {
    const res = await get(`/api/teams/histcats/games/${gameId}`, BEA);
    expect(res.status).toBe(200);
    return (await res.json()) as GameWithAttendance;
  }

  it("soft-removes a player: history survives, forward RSVPs are pruned, and only that key detaches", async () => {
    const removed = await app.request(`/api/teams/histcats/players/${annId}`, {
      method: "DELETE",
      headers: { cookie: BEA },
    });
    expect(removed.status).toBe(204);

    // The played game still shows Ann, with her response intact.
    const past = await gameRoster(pastGameId);
    expect(past.players.map((p) => p.name)).toEqual(["Ann", "Bea", "Cal"]);
    expect(past.players.find((p) => p.playerId === annId)!.status).toBe("yes");

    // The upcoming game no longer shows her, and her RSVP row is gone —
    // not merely hidden.
    const future = await gameRoster(futureGameId);
    expect(future.players.map((p) => p.name)).toEqual(["Bea", "Cal"]);
    const orphans = await pool.query(
      `SELECT 1 FROM attendance WHERE player_id = $1 AND game_id = $2`,
      [annId, futureGameId],
    );
    expect(orphans.rows).toHaveLength(0);

    // Her Histcats key is gone, but the same browser remains signed into the
    // unrelated team on its keyring.
    const asAnn = await get("/api/teams/histcats", ANN);
    expect(asAnn.status).toBe(401);
    expect((await get("/api/teams/othercats", ANN)).status).toBe(200);

    // Even if a stale key somehow remains, the roster-stint clause is an
    // independent guard and still blocks it.
    await pool.query(
      `INSERT INTO session_player (session_id, player_id, team_id)
       SELECT 'hist-ann-session', p.id, p.team_id FROM player p WHERE p.id = $1`,
      [annId],
    );
    expect((await get("/api/teams/histcats", ANN)).status).toBe(401);
    await pool.query(
      `DELETE FROM session_player
       WHERE session_id = 'hist-ann-session' AND player_id = $1`,
      [annId],
    );

    // The player row itself survives — this was not a delete.
    const row = await pool.query(`SELECT 1 FROM player WHERE id = $1`, [annId]);
    expect(row.rows).toHaveLength(1);
  });

  it("puts a new player on future games only, not the played ones", async () => {
    const created = await jsonRequest(
      "POST",
      "/api/teams/histcats/players",
      { name: "Dee", countsTowardMinimum: false },
      BEA,
    );
    expect(created.status).toBe(201);

    const past = await gameRoster(pastGameId);
    expect(past.players.map((p) => p.name)).toEqual(["Ann", "Bea", "Cal"]);
    const future = await gameRoster(futureGameId);
    expect(future.players.map((p) => p.name)).toEqual(["Bea", "Cal", "Dee"]);
    expect(future.players.find((p) => p.name === "Dee")!.status).toBeNull();
  });

  it("gives a departed player's join link the distinct departed redirect", async () => {
    const res = await app.request("/join/ann-token");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "/?join=departed&team=Histcats",
    );
    expect(res.headers.get("set-cookie")).toBeNull();

    // A genuinely bad token still gets the invalid redirect — the two
    // must stay distinguishable.
    const invalid = await app.request("/join/no-such-token");
    expect(invalid.headers.get("location")).toBe("/?join=invalid");
  });

  it("omits departed players from the access list", async () => {
    const res = await get("/api/teams/histcats/access", BEA);
    expect(res.status).toBe(200);
    const names = ((await res.json()) as PlayerAccess[]).map((a) => a.name);
    expect(names).toEqual(["Bea", "Cal", "Dee"]);
  });

  it("lists former players for captains and 403s everyone else", async () => {
    const res = await get("/api/teams/histcats/players/former", BEA);
    expect(res.status).toBe(200);
    const former = (await res.json()) as FormerPlayer[];
    expect(former).toHaveLength(1);
    expect(former[0]!.name).toBe("Ann");
    expect(Date.parse(former[0]!.leftAt)).toBeGreaterThan(
      Date.now() - 60_000,
    );

    const asCal = await get("/api/teams/histcats/players/former", CAL);
    expect(asCal.status).toBe(403);
    const addBack = await app.request(
      `/api/teams/histcats/players/${annId}/add-back`,
      { method: "POST", headers: { cookie: CAL } },
    );
    expect(addBack.status).toBe(403);
    const purge = await app.request(
      `/api/teams/histcats/players/${annId}/purge`,
      { method: "POST", headers: { cookie: CAL } },
    );
    expect(purge.status).toBe(403);
  });

  it("adds a player back: same row, same token, new stint, no resurrected RSVP", async () => {
    const res = await app.request(
      `/api/teams/histcats/players/${annId}/add-back`,
      { method: "POST", headers: { cookie: BEA } },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as Player).id).toBe(annId);

    // One player row, two stints, exactly one open.
    const stints = await pool.query<{ left_at: Date | null }>(
      `SELECT left_at FROM roster_membership WHERE player_id = $1`,
      [annId],
    );
    expect(stints.rows).toHaveLength(2);
    expect(stints.rows.filter((r) => r.left_at === null)).toHaveLength(1);

    // Back on the roster, off the former list.
    const players = await get("/api/teams/histcats/players", BEA);
    expect(((await players.json()) as Player[]).map((p) => p.name)).toEqual([
      "Ann",
      "Bea",
      "Cal",
      "Dee",
    ]);
    const former = await get("/api/teams/histcats/players/former", BEA);
    expect((await former.json()) as FormerPlayer[]).toHaveLength(0);

    // Her original link works again, without regenerating.
    const join = await app.request("/join/ann-token");
    expect(join.status).toBe(302);
    expect(join.headers.get("location")).toBe("/histcats");

    // The pruned June RSVP stays gone: she's back as "hasn't responded".
    const future = await gameRoster(futureGameId);
    expect(future.players.find((p) => p.playerId === annId)!.status).toBeNull();
    // And the played game kept her original response all along.
    const past = await gameRoster(pastGameId);
    expect(past.players.find((p) => p.playerId === annId)!.status).toBe("yes");
  });

  it("409s an add-back for a player who is already active", async () => {
    const res = await app.request(
      `/api/teams/histcats/players/${annId}/add-back`,
      { method: "POST", headers: { cookie: BEA } },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "player is active" });
  });

  it("keeps a deliberately revoked token revoked across a leave and rejoin", async () => {
    // The lost-phone case: a captain revoked Cal's link for cause…
    const revoked = await app.request(
      `/api/teams/histcats/players/${calId}/revoke-token`,
      { method: "POST", headers: { cookie: BEA } },
    );
    expect(revoked.status).toBe(200);
    const revokedAt = ((await revoked.json()) as PlayerAccess).revokedAt;
    expect(revokedAt).not.toBeNull();

    // …then Cal leaves and is added back months later.
    const removed = await app.request(
      `/api/teams/histcats/players/${calId}`,
      { method: "DELETE", headers: { cookie: BEA } },
    );
    expect(removed.status).toBe(204);
    const addedBack = await app.request(
      `/api/teams/histcats/players/${calId}/add-back`,
      { method: "POST", headers: { cookie: BEA } },
    );
    expect(addedBack.status).toBe(200);

    // The rejoin must not silently put the compromised link back in play:
    // still invalid (not departed), stamp untouched.
    const join = await app.request("/join/cal-token");
    expect(join.headers.get("location")).toBe("/?join=invalid");
    const { rows } = await pool.query<{ join_token_revoked_at: Date }>(
      `SELECT join_token_revoked_at FROM player WHERE id = $1`,
      [calId],
    );
    expect(rows[0]!.join_token_revoked_at.toISOString()).toBe(revokedAt);
  });
});

// The "≥ 1 active captain per team" invariant and the guarded purge, on
// their own team since they reshape the roster as they go.
describe("captain guards and purge", () => {
  const PRIYA = "th_session=cap-priya-session";
  const QUINN = "th_session=cap-quinn-session";
  let teamId = 0;
  let priyaId = 0;
  let quinnId = 0;
  let playedGameId = 0;

  beforeAll(async () => {
    const team = await pool.query<{ id: number }>(
      `INSERT INTO team (name, slug, full_side, min_to_play, women_floor,
                         floor_type, quota_noun_singular, quota_noun_plural, timezone)
       VALUES ('Capcats', 'capcats', 7, 7, 2, 'play_down',
               'woman', 'women', 'America/New_York')
       RETURNING id`,
    );
    teamId = team.rows[0]!.id;
    await pool.query(`UPDATE team SET setup_completed_at = now() WHERE id = $1`, [teamId]);
    const players = await pool.query<{ id: number }>(
      `INSERT INTO player (team_id, name, counts_toward_minimum, is_captain, join_token)
       VALUES ($1, 'Priya', true, true, 'priya-token'),
              ($1, 'Quinn', false, false, 'quinn-token')
       RETURNING id`,
      [teamId],
    );
    [priyaId, quinnId] = players.rows.map((r) => r.id) as [number, number];
    await pool.query(
      `INSERT INTO roster_membership (player_id, joined_at)
       VALUES ($1, '-infinity'), ($2, '-infinity')`,
      [priyaId, quinnId],
    );
    const game = await pool.query<{ id: number }>(
      `INSERT INTO game (team_id, opponent_name, opponent_color, starts_at)
       VALUES ($1, 'Bygones', NULL, now() - interval '5 days')
       RETURNING id`,
      [teamId],
    );
    playedGameId = game.rows[0]!.id;
    await insertSession("cap-priya-session", priyaId);
    await insertSession("cap-quinn-session", quinnId);
  });

  it("refuses to remove, purge, or demote the last active captain", async () => {
    const removed = await app.request(
      `/api/teams/capcats/players/${priyaId}`,
      { method: "DELETE", headers: { cookie: PRIYA } },
    );
    expect(removed.status).toBe(409);
    expect(await removed.json()).toEqual({ error: "last captain" });

    // Priya has no attendance, so only the captain guard can be what
    // refuses the purge.
    const purged = await app.request(
      `/api/teams/capcats/players/${priyaId}/purge`,
      { method: "POST", headers: { cookie: PRIYA } },
    );
    expect(purged.status).toBe(409);
    expect(await purged.json()).toEqual({ error: "last captain" });

    const demoted = await app.request(
      `/api/teams/capcats/players/${priyaId}/demote`,
      { method: "POST", headers: { cookie: PRIYA } },
    );
    expect(demoted.status).toBe(409);
    expect(await demoted.json()).toEqual({ error: "last captain" });
  });

  it("allows peer promotion and demotion, including self-demotion", async () => {
    const promoted = await app.request(
      `/api/teams/capcats/players/${quinnId}/promote`,
      { method: "POST", headers: { cookie: PRIYA } },
    );
    expect(promoted.status).toBe(204);

    const selfDemoted = await app.request(
      `/api/teams/capcats/players/${priyaId}/demote`,
      { method: "POST", headers: { cookie: PRIYA } },
    );
    expect(selfDemoted.status).toBe(204);
    const asPriya = await get("/api/teams/capcats/access", PRIYA);
    expect(asPriya.status).toBe(403);

    const restored = await app.request(
      `/api/teams/capcats/players/${priyaId}/promote`,
      { method: "POST", headers: { cookie: QUINN } },
    );
    expect(restored.status).toBe(204);
  });

  it("removes a captain once another active captain exists", async () => {
    const removed = await app.request(
      `/api/teams/capcats/players/${priyaId}`,
      { method: "DELETE", headers: { cookie: QUINN } },
    );
    expect(removed.status).toBe(204);
  });

  it("refuses to purge a player with history, and purges one without", async () => {
    // A player who responded to a played game: purge must refuse.
    const withHistory = await jsonRequest(
      "POST",
      "/api/teams/capcats/players",
      { name: "Vera", countsTowardMinimum: false },
      QUINN,
    );
    const vera = (await withHistory.json()) as Player;
    await pool.query(
      `INSERT INTO attendance (player_id, game_id, status)
       VALUES ($1, $2, 'yes')`,
      [vera.id, playedGameId],
    );
    const refused = await app.request(
      `/api/teams/capcats/players/${vera.id}/purge`,
      { method: "POST", headers: { cookie: QUINN } },
    );
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "player has history" });

    // The typo'd player who never played: purge erases the row entirely.
    const typo = await jsonRequest(
      "POST",
      "/api/teams/capcats/players",
      { name: "Tpyo", countsTowardMinimum: false },
      QUINN,
    );
    const tpyo = (await typo.json()) as Player;
    const purged = await app.request(
      `/api/teams/capcats/players/${tpyo.id}/purge`,
      { method: "POST", headers: { cookie: QUINN } },
    );
    expect(purged.status).toBe(204);
    const gone = await pool.query(`SELECT 1 FROM player WHERE id = $1`, [
      tpyo.id,
    ]);
    expect(gone.rows).toHaveLength(0);
    const stints = await pool.query(
      `SELECT 1 FROM roster_membership WHERE player_id = $1`,
      [tpyo.id],
    );
    expect(stints.rows).toHaveLength(0);
  });
});

describe("attendance lock", () => {
  let lockedGameId = 0;
  let graceGameId = 0;

  beforeAll(async () => {
    const teamId = (
      await pool.query<{ id: number }>(
        `SELECT id FROM team WHERE slug = 'testcats'`,
      )
    ).rows[0]!.id;
    const games = await pool.query<{ id: number }>(
      `INSERT INTO game (team_id, opponent_name, opponent_color, starts_at)
       VALUES ($1, 'Longagos', NULL, now() - interval '25 hours'),
              ($1, 'Recents', NULL, now() - interval '23 hours')
       RETURNING id`,
      [teamId],
    );
    [lockedGameId, graceGameId] = games.rows.map((r) => r.id) as [
      number,
      number,
    ];
  });

  it("409s a write once starts_at + 24h has passed", async () => {
    const res = await jsonRequest(
      "PUT",
      `/api/teams/testcats/games/${lockedGameId}/attendance/${playerIds[1]}`,
      { status: "yes" },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "attendance locked" });
    const rows = await pool.query(
      `SELECT 1 FROM attendance WHERE player_id = $1 AND game_id = $2`,
      [playerIds[1], lockedGameId],
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("accepts a write inside the grace window (started, not yet locked)", async () => {
    const res = await jsonRequest(
      "PUT",
      `/api/teams/testcats/games/${graceGameId}/attendance/${playerIds[1]}`,
      { status: "yes" },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "yes" });
  });
});

// Runs last: regenerating/revoking kills sessions other suites rely on.
describe("access management (captains only)", () => {
  it("403s a non-captain on every access endpoint", async () => {
    const list = await get("/api/teams/testcats/access", BOB);
    expect(list.status).toBe(403);
    expect(await list.json()).toEqual({ error: "forbidden" });

    for (const verb of ["regenerate-token", "revoke-token", "promote", "demote"]) {
      const res = await app.request(
        `/api/teams/testcats/players/${playerIds[2]}/${verb}`,
        { method: "POST", headers: { cookie: BOB } },
      );
      expect(res.status).toBe(403);
    }

    const remove = await app.request(
      `/api/teams/testcats/players/${playerIds[2]}`,
      { method: "DELETE", headers: { cookie: BOB } },
    );
    expect(remove.status).toBe(403);
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

  it("regenerates a token and detaches the player's session keys", async () => {
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

  it("revokes a token and detaches the player's session keys", async () => {
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

// ---- Join-token usage (milestone 5.8) ----
// "Never opened / Opened" on the access page is backed by
// player.join_token_used_at: the first successful redemption of the
// *current* token. A dedicated team so joins/regenerations here can't
// disturb other fixtures. Tests in this block build on one another in order.
describe("join-token usage", () => {
  const UMA = "th_session=tok-uma-session"; // captain
  let umaId = 0;
  let vicId = 0;
  let wesId = 0;

  beforeAll(async () => {
    const team = await pool.query<{ id: number }>(
      `INSERT INTO team (name, slug, full_side, min_to_play, women_floor,
                         floor_type, quota_noun_singular, quota_noun_plural, timezone)
       VALUES ('Tokencats', 'tokencats', 7, 7, 2, 'play_down',
               'woman', 'women', 'America/New_York')
       RETURNING id`,
    );
    const teamId = team.rows[0]!.id;
    const players = await pool.query<{ id: number }>(
      `INSERT INTO player (team_id, name, counts_toward_minimum, is_captain, join_token)
       VALUES ($1, 'Uma', true, true, 'uma-token'),
              ($1, 'Vic', false, false, 'vic-token'),
              ($1, 'Wes', false, false, 'wes-token')
       RETURNING id`,
      [teamId],
    );
    [umaId, vicId, wesId] = players.rows.map((r) => r.id) as [
      number,
      number,
      number,
    ];
    await pool.query(
      `INSERT INTO roster_membership (player_id, joined_at)
       VALUES ($1, '-infinity'), ($2, '-infinity'), ($3, '-infinity')`,
      [umaId, vicId, wesId],
    );
    await insertSession("tok-uma-session", umaId);
  });

  async function accessFor(playerId: number): Promise<PlayerAccess> {
    const res = await get("/api/teams/tokencats/access", UMA);
    expect(res.status).toBe(200);
    const row = ((await res.json()) as PlayerAccess[]).find(
      (a) => a.playerId === playerId,
    );
    expect(row).toBeDefined();
    return row!;
  }

  it("starts every never-redeemed token at null", async () => {
    const res = await get("/api/teams/tokencats/access", UMA);
    const access = (await res.json()) as PlayerAccess[];
    expect(access).toHaveLength(3);
    expect(access.every((a) => a.joinTokenUsedAt === null)).toBe(true);
  });

  it("sets usage on the first successful redemption and keeps it on repeats", async () => {
    const join = await app.request("/join/vic-token");
    expect(join.headers.get("location")).toBe("/tokencats");
    const first = (await accessFor(vicId)).joinTokenUsedAt;
    expect(first).not.toBeNull();

    // A second redemption of the same link preserves the first timestamp.
    const again = await app.request("/join/vic-token");
    expect(again.headers.get("location")).toBe("/tokencats");
    expect((await accessFor(vicId)).joinTokenUsedAt).toBe(first);
  });

  it("does not mark usage for an invalid token", async () => {
    await app.request("/join/no-such-token");
    expect((await accessFor(wesId)).joinTokenUsedAt).toBeNull();
  });

  it("does not mark usage for a revoked token, and revocation preserves prior usage", async () => {
    // Wes never opened his link; revoking and then hitting it marks nothing.
    await app.request(`/api/teams/tokencats/players/${wesId}/revoke-token`, {
      method: "POST",
      headers: { cookie: UMA },
    });
    const deadJoin = await app.request("/join/wes-token");
    expect(deadJoin.headers.get("location")).toBe("/?join=invalid");
    expect((await accessFor(wesId)).joinTokenUsedAt).toBeNull();

    // Vic *had* opened his; revoking keeps that fact on the row.
    const before = (await accessFor(vicId)).joinTokenUsedAt;
    await app.request(`/api/teams/tokencats/players/${vicId}/revoke-token`, {
      method: "POST",
      headers: { cookie: UMA },
    });
    const vic = await accessFor(vicId);
    expect(vic.joinToken).toBeNull();
    expect(vic.joinTokenUsedAt).toBe(before);
  });

  it("resets usage on regeneration; the new link starts unopened", async () => {
    const res = await app.request(
      `/api/teams/tokencats/players/${vicId}/regenerate-token`,
      { method: "POST", headers: { cookie: UMA } },
    );
    const access = (await res.json()) as PlayerAccess;
    expect(access.joinTokenUsedAt).toBeNull();
    expect((await accessFor(vicId)).joinTokenUsedAt).toBeNull();

    // Opening the new link marks it fresh.
    await app.request(`/join/${access.joinToken}`);
    expect((await accessFor(vicId)).joinTokenUsedAt).not.toBeNull();
  });

  it("never marks a replacement token from a stale-token join (regeneration race)", async () => {
    // The exchange validates and marks in one statement keyed on the token
    // itself, so the observable contract is: a token that has been
    // regenerated away redeems as invalid and leaves the new token unopened.
    const res = await app.request(
      `/api/teams/tokencats/players/${vicId}/regenerate-token`,
      { method: "POST", headers: { cookie: UMA } },
    );
    const fresh = (await res.json()) as PlayerAccess;
    expect(fresh.joinTokenUsedAt).toBeNull();

    const staleJoin = await app.request("/join/vic-token");
    expect(staleJoin.headers.get("location")).toBe("/?join=invalid");
    expect(staleJoin.headers.get("set-cookie")).toBeNull();
    expect((await accessFor(vicId)).joinTokenUsedAt).toBeNull();
  });

  it("does not mark usage for a departed player's token", async () => {
    const removed = await app.request(
      `/api/teams/tokencats/players/${wesId}`,
      { method: "DELETE", headers: { cookie: UMA } },
    );
    expect(removed.status).toBe(204);
    // Re-arm Wes's link so the departed (not revoked) path is exercised.
    await pool.query(
      `UPDATE player SET join_token_revoked_at = NULL WHERE id = $1`,
      [wesId],
    );

    const join = await app.request("/join/wes-token");
    expect(join.headers.get("location")).toBe(
      "/?join=departed&team=Tokencats",
    );
    const { rows } = await pool.query<{ join_token_used_at: Date | null }>(
      `SELECT join_token_used_at FROM player WHERE id = $1`,
      [wesId],
    );
    expect(rows[0]!.join_token_used_at).toBeNull();
  });
});
