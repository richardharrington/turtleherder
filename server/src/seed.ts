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
    `INSERT INTO team (name, slug, full_side, min_to_play, men_ceiling,
                       women_floor, floor_type, keeper_scoping,
                       quota_noun_singular, quota_noun_plural,
                       setup_completed_at, timezone)
     VALUES ('Bobcats', 'bobcats', 7, 7, NULL, 2, 'play_down', 'included',
             'woman', 'women', now(), 'America/New_York')
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

  // One live fixture for each additional engine shape. Their confirmed
  // turnouts are acceptance-table cases, so joining each captain's team
  // demonstrates the cap-only, hard-floor, and shorthanded play-down paths.
  const engineFixtures = [
    {
      name: "Keeper Caps",
      slug: "keeper-caps",
      fullSide: 7,
      minToPlay: 4,
      menCeiling: 4,
      womenFloor: null,
      floorType: null,
      keeperScoping: "excluded",
      men: 8,
      women: 0,
    },
    {
      name: "Hard Floor",
      slug: "hard-floor",
      fullSide: 7,
      minToPlay: 5,
      menCeiling: 5,
      womenFloor: 1,
      floorType: "forfeit",
      keeperScoping: "included",
      men: 5,
      women: 0,
    },
    {
      name: "Play Down",
      slug: "play-down",
      fullSide: 7,
      minToPlay: 5,
      menCeiling: null,
      womenFloor: 2,
      floorType: "play_down",
      keeperScoping: "excluded",
      men: 6,
      women: 1,
    },
  ] as const;
  const engineCaptainLinks: Array<[name: string, slug: string, token: string]> = [];

  for (const [fixtureIndex, fixture] of engineFixtures.entries()) {
    const result = await client.query<{ id: number }>(
      `INSERT INTO team (name, slug, full_side, min_to_play, men_ceiling,
                         women_floor, floor_type, keeper_scoping,
                         quota_noun_singular, quota_noun_plural,
                         restricting_noun_singular, restricting_noun_plural,
                         setup_completed_at, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'woman', 'women',
               CASE WHEN $5 IS NULL THEN NULL ELSE 'man' END,
               CASE WHEN $5 IS NULL THEN NULL ELSE 'men' END,
               now(), 'America/New_York')
       RETURNING id`,
      [
        fixture.name,
        fixture.slug,
        fixture.fullSide,
        fixture.minToPlay,
        fixture.menCeiling,
        fixture.womenFloor,
        fixture.floorType,
        fixture.keeperScoping,
      ],
    );
    const fixtureTeamId = result.rows[0]!.id;
    const fixturePlayerIds: number[] = [];
    const categories = [
      ...Array<boolean>(fixture.men).fill(false),
      ...Array<boolean>(fixture.women).fill(true),
    ];
    for (const [playerIndex, counts] of categories.entries()) {
      const isCaptain = playerIndex === 0;
      const name = isCaptain
        ? `${fixture.name} Captain`
        : `${fixture.name} Player ${playerIndex + 1}`;
      const joinToken = generateJoinToken();
      const player = await client.query<{ id: number }>(
        `INSERT INTO player
           (team_id, name, counts_toward_minimum, is_captain, join_token)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [fixtureTeamId, name, counts, isCaptain, joinToken],
      );
      fixturePlayerIds.push(player.rows[0]!.id);
      await client.query(
        `INSERT INTO roster_membership (player_id, joined_at)
         VALUES ($1, '-infinity')`,
        [player.rows[0]!.id],
      );
      if (isCaptain) {
        engineCaptainLinks.push([name, fixture.slug, joinToken]);
      }
    }
    const fixtureGame = await client.query<{ id: number }>(
      `INSERT INTO game (team_id, opponent_name, opponent_color, starts_at)
       VALUES ($1, 'Engine Testers', NULL, $2)
       RETURNING id`,
      [fixtureTeamId, daysFromNow(5 + fixtureIndex, 19)],
    );
    for (const fixturePlayerId of fixturePlayerIds) {
      await client.query(
        `INSERT INTO attendance (player_id, game_id, status)
         VALUES ($1, $2, 'yes')`,
        [fixturePlayerId, fixtureGame.rows[0]!.id],
      );
    }
  }

  await client.query("COMMIT");
  console.log(
    `Seeded team 'bobcats' with ${players.length} players, ${games.length} games ` +
      `(1 bye), plus ${engineFixtures.length} coed-engine fixture teams.`,
  );
  // The cookie is scoped to localhost (ports don't matter), so this link
  // signs you in for the Vite dev server too.
  const origin = `http://localhost:${process.env.PORT ?? 3000}`;
  console.log(
    `Captain Alison Bechdel's join link: ${origin}/join/${captainJoinToken}`,
  );
  for (const [name, slug, token] of engineCaptainLinks) {
    console.log(`${name}'s (${slug}) join link: ${origin}/join/${token}`);
  }
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
  await pool.end();
}
