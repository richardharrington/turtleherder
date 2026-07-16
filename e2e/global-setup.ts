// Migrates the test database and seeds a deterministic fixture team
// before every e2e run. With RESTART IDENTITY, ids are predictable:
// players Alice=1 / Bob=2 / Carol=3, games past=1 / future=2.
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
      "TRUNCATE team, player, game, attendance, session RESTART IDENTITY CASCADE",
    );
    await client.query(
      `INSERT INTO team (name, slug, min_players, min_quota_players,
                         quota_noun_singular, quota_noun_plural, timezone)
       VALUES ('Testcats', 'testcats', 7, 2, 'woman', 'women', 'America/New_York')`,
    );
    await client.query(
      `INSERT INTO player (team_id, name, counts_toward_minimum, is_captain, join_token)
       VALUES (1, 'Alice', true, true, 'e2e-alice-token'),
              (1, 'Bob', false, false, 'e2e-bob-token'),
              (1, 'Carol', true, false, 'e2e-carol-token')`,
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
    await client.query(
      `INSERT INTO session (id, player_id) VALUES ($1, 1)`,
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
