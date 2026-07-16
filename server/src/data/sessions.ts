import { randomBytes } from "node:crypto";
import { pool } from "../db.js";

// Sessions last ~1 year, rolling: a session is valid while last_seen_at is
// within the TTL.
const SESSION_TTL = "365 days";

export async function createSession(playerId: number): Promise<string> {
  const id = randomBytes(32).toString("base64url");
  await pool.query(`INSERT INTO session (id, player_id) VALUES ($1, $2)`, [
    id,
    playerId,
  ]);
  return id;
}

// Expired rows are swept opportunistically on every /join — no scheduler.
export async function pruneExpiredSessions(): Promise<void> {
  await pool.query(
    `DELETE FROM session WHERE last_seen_at <= now() - interval '${SESSION_TTL}'`,
  );
}
