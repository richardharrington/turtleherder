// Migrates the test database and seeds deterministic fixture teams before
// every e2e run. Testcats has Alice=1 / Bob=2 / Carol=3 and games past=1 /
// future=2. Bocce Buddies supplies Alice's second-team join link; Otters is
// a real but unjoined third team for the uniform wall.
//
// The API is walled (see DESIGN.md's auth section), so this also creates a
// session for Alice and writes it to a Playwright storageState file; every
// test in app.spec.ts browses as signed-in Alice. auth.spec.ts opts out
// (empty storageState) to cover the wall and the join flow themselves.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import pg from "pg";
import { STORAGE_STATE, TEST_DATABASE_URL } from "./playwright.config.js";

const DAY = 24 * 60 * 60 * 1000;

const SESSION_ID = "e2e-alice-session";

export default async function globalSetup(): Promise<void> {
  await runner({
    databaseUrl: TEST_DATABASE_URL,
    dir: fileURLToPath(new URL("../server/migrations", import.meta.url)),
    direction: "up",
    migrationsTable: "pgmigrations",
    count: Infinity,
    log: () => {},
  });

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "TRUNCATE team, player, roster_membership, game, attendance, session RESTART IDENTITY CASCADE",
    );
    await client.query(
      `INSERT INTO team (name, slug, full_side, min_to_play, women_floor,
                         floor_type, quota_noun_singular, quota_noun_plural, timezone)
       VALUES ('Testcats', 'testcats', 7, 7, 2, 'play_down',
               'woman', 'women', 'America/New_York')`,
    );
    await client.query(
      `INSERT INTO player (team_id, name, counts_toward_minimum, is_captain, join_token)
       VALUES (1, 'Alice', true, true, 'e2e-alice-token'),
              (1, 'Bob', false, false, 'e2e-bob-token'),
              (1, 'Carol', true, false, 'e2e-carol-token')`,
    );
    // Game rosters derive from membership stints; '-infinity' keeps the
    // fixture players on the past game too.
    await client.query(
      `INSERT INTO roster_membership (player_id, joined_at)
       VALUES (1, '-infinity'), (2, '-infinity'), (3, '-infinity')`,
    );
    await client.query(
      `INSERT INTO game (team_id, opponent_name, opponent_color, starts_at)
       VALUES (1, 'Marmots', NULL, $1), (1, 'Wombats', 'red', $2)`,
      [new Date(Date.now() - 7 * DAY), new Date(Date.now() + 3 * DAY)],
    );
    // Carol's row on the played game is deliberate: departure pruning only
    // touches unplayed games, so it survives her removal and keeps the
    // permanent-purge guard exercisable end to end.
    await client.query(
      `INSERT INTO attendance (player_id, game_id, status)
       VALUES (1, 2, 'yes'), (3, 1, 'yes')`,
    );
    await client.query(
      `INSERT INTO team (name, slug, full_side, min_to_play, women_floor,
                         floor_type, quota_noun_singular, quota_noun_plural, timezone)
       VALUES ('Bocce Buddies', 'bocce', 4, 4, NULL, NULL,
               'woman', 'women', 'America/New_York'),
              ('Otters', 'otters', 7, 7, 2, 'play_down',
               'woman', 'women', 'America/New_York')`,
    );
    await client.query(
      `INSERT INTO player (team_id, name, counts_toward_minimum, is_captain, join_token)
       VALUES (2, 'Alice Bocce', false, true, 'e2e-bocce-alice-token'),
              (3, 'Olivia', true, true, 'e2e-otters-token')`,
    );
    await client.query(
      `INSERT INTO roster_membership (player_id, joined_at)
       VALUES (4, '-infinity'), (5, '-infinity')`,
    );
    await client.query(`INSERT INTO session (id) VALUES ($1)`, [SESSION_ID]);
    await client.query(
      `INSERT INTO session_player (session_id, player_id, team_id)
       VALUES ($1, 1, 1)`,
      [SESSION_ID],
    );
  } finally {
    await client.end();
  }

  mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  writeFileSync(
    STORAGE_STATE,
    JSON.stringify({
      cookies: [
        {
          name: "th_session",
          value: SESSION_ID,
          domain: "localhost",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    }),
  );
}
