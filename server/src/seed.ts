// Development seed: wipes all data and recreates the demo "bobcats" team,
// mirroring the example team on the original turtleherder.com.
//
// Because it opens with a TRUNCATE, it refuses to run anywhere that isn't
// obviously a development database. Real teams are created by create-team.ts,
// which only ever inserts.

import { generateJoinToken } from "./data/access.js";
import { pool } from "./db.js";

const DAY = 24 * 60 * 60 * 1000;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function databaseHost(url: string): string | null {
  try {
    // Strips the brackets IPv6 authorities carry, so ::1 compares cleanly.
    return new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return null;
  }
}

// NODE_ENV catches running *in* production. The host check catches the
// likelier accident: running from a laptop with DATABASE_URL aimed at the
// production database, where NODE_ENV is unset and the first guard waves you
// straight through to the TRUNCATE.
if (process.env.NODE_ENV === "production") {
  fail(
    "Refusing to run the dev seed with NODE_ENV=production: it TRUNCATEs every table.\n" +
      "Create a real team with `pnpm db:create-team` instead.",
  );
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail("DATABASE_URL is not set");

const host = databaseHost(databaseUrl);
if (process.env.ALLOW_REMOTE_SEED !== "1" && (host === null || !LOCAL_HOSTS.has(host))) {
  fail(
    `Refusing to run the dev seed against ${host === null ? "an unparseable DATABASE_URL" : `'${host}'`}: ` +
      "it TRUNCATEs every table, and this is not a local database.\n" +
      "Create a real team with `pnpm db:create-team` instead.\n" +
      "If you really mean it (a scratch database elsewhere), set ALLOW_REMOTE_SEED=1.",
  );
}

function daysFromNow(days: number, hour: number, minute = 0): Date {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const client = await pool.connect();

try {
  await client.query("BEGIN");

  await client.query(
    "TRUNCATE team, player, roster_membership, game, attendance, session RESTART IDENTITY CASCADE",
  );

  const teamResult = await client.query<{ id: number }>(
    `INSERT INTO team (name, slug, min_players, min_quota_players,
                       quota_noun_singular, quota_noun_plural, timezone)
     VALUES ('Bobcats', 'bobcats', 7, 2, 'woman', 'women', 'America/New_York')
     RETURNING id`,
  );
  const teamId = teamResult.rows[0]!.id;

  // Alison is the team's captain; her join link is printed below so a dev
  // can sign in the way a real captain would.
  const players: Array<
    [name: string, countsTowardMinimum: boolean, isCaptain: boolean]
  > = [
    ["Alison Bechdel", true, true],
    ["Ben Katchor", false, false],
    ["Carla Speed McNeil", true, false],
    ["Dan Clowes", false, false],
    ["Eleanor Davis", true, false],
    ["Frank King", false, false],
    ["Gene Yang", false, false],
    ["Hope Larson", true, false],
    ["Ivan Brunetti", false, false],
    ["Jaime Hernandez", false, false],
  ];
  const playerIds: number[] = [];
  let captainJoinToken = "";
  for (const [name, counts, isCaptain] of players) {
    const joinToken = generateJoinToken();
    if (isCaptain && !captainJoinToken) captainJoinToken = joinToken;
    const res = await client.query<{ id: number }>(
      `INSERT INTO player (team_id, name, counts_toward_minimum, is_captain, join_token)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [teamId, name, counts, isCaptain, joinToken],
    );
    playerIds.push(res.rows[0]!.id);
    // '-infinity' (the backfill sentinel) keeps everyone on the seeded
    // past games; games render their roster from these stints.
    await client.query(
      `INSERT INTO roster_membership (player_id, joined_at)
       VALUES ($1, '-infinity')`,
      [res.rows[0]!.id],
    );
  }

  const games: Array<
    [opponentName: string | null, opponentColor: string | null, startsAt: Date]
  > = [
    ["Wombats", "red", daysFromNow(-14, 18, 30)],
    ["Marmots", null, daysFromNow(-7, 19, 0)],
    ["Ocelots", "blue", daysFromNow(3, 18, 30)],
    [null, null, daysFromNow(10, 0, 0)], // bye week
    ["Pangolins", "orange", daysFromNow(17, 20, 0)],
  ];
  const gameIds: number[] = [];
  for (const [opponentName, opponentColor, startsAt] of games) {
    const res = await client.query<{ id: number }>(
      `INSERT INTO game (team_id, opponent_name, opponent_color, starts_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [teamId, opponentName, opponentColor, startsAt],
    );
    gameIds.push(res.rows[0]!.id);
  }

  // A realistic spread of responses for the next real game (Ocelots):
  // some yes, a no, a not_sure, and the rest silent (no rows at all).
  const ocelotsId = gameIds[2]!;
  const responses: Array<[playerIndex: number, status: string]> = [
    [0, "yes"],
    [1, "yes"],
    [2, "yes"],
    [3, "no"],
    [4, "not_sure"],
    [5, "yes"],
  ];
  for (const [playerIndex, status] of responses) {
    await client.query(
      `INSERT INTO attendance (player_id, game_id, status) VALUES ($1, $2, $3)`,
      [playerIds[playerIndex], ocelotsId, status],
    );
  }

  await client.query("COMMIT");
  console.log(
    `Seeded team 'bobcats' with ${players.length} players, ${games.length} games ` +
      `(1 bye), and ${responses.length} attendance responses.`,
  );
  // The cookie is scoped to localhost (ports don't matter), so this link
  // signs you in for the Vite dev server too.
  console.log(
    `Captain Alison Bechdel's join link: ` +
      `http://localhost:${process.env.PORT ?? 3000}/join/${captainJoinToken}`,
  );
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
  await pool.end();
}
