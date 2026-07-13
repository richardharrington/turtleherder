// Migrates the test database and seeds a deterministic fixture team
// before every e2e run. With RESTART IDENTITY, ids are predictable:
// players Alice=1 / Bob=2 / Carol=3, games past=1 / future=2.

import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import pg from "pg";
import { TEST_DATABASE_URL } from "./playwright.config.js";

const DAY = 24 * 60 * 60 * 1000;

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
      "TRUNCATE team, player, game, attendance RESTART IDENTITY CASCADE",
    );
    await client.query(
      `INSERT INTO team (name, slug, min_players, min_quota_players,
                         quota_noun_singular, quota_noun_plural, timezone)
       VALUES ('Testcats', 'testcats', 7, 2, 'woman', 'women', 'America/New_York')`,
    );
    await client.query(
      `INSERT INTO player (team_id, name, counts_toward_minimum)
       VALUES (1, 'Alice', true), (1, 'Bob', false), (1, 'Carol', true)`,
    );
    await client.query(
      `INSERT INTO game (team_id, opponent_name, opponent_color, starts_at)
       VALUES (1, 'Marmots', NULL, $1), (1, 'Wombats', 'red', $2)`,
      [new Date(Date.now() - 7 * DAY), new Date(Date.now() + 3 * DAY)],
    );
    await client.query(
      `INSERT INTO attendance (player_id, game_id, status)
       VALUES (1, 2, 'yes')`,
    );
  } finally {
    await client.end();
  }
}
