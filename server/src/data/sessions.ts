import { randomBytes } from "node:crypto";
import { pool } from "../db.js";

// Sessions last ~1 year, rolling: a session is valid while last_seen_at is
// within the TTL, and the middleware renews it (throttled) on every visit.
const SESSION_TTL = "365 days";

// A valid session joined to its player and team — everything the
// middleware needs to authorize a team-scoped request.
export interface SessionAuth {
  sessionId: string;
  lastSeenAt: Date;
  playerId: number;
  playerName: string;
  isCaptain: boolean;
  teamId: number;
  teamSlug: string;
}

interface SessionAuthRow {
  session_id: string;
  last_seen_at: Date;
  player_id: number;
  player_name: string;
  is_captain: boolean;
  team_id: number;
  team_slug: string;
}

export async function createSession(playerId: number): Promise<string> {
  const id = randomBytes(32).toString("base64url");
  await pool.query(`INSERT INTO session (id, player_id) VALUES ($1, $2)`, [
    id,
    playerId,
  ]);
  return id;
}

// Auth requires an open roster stint as well as a live session: closing a
// stint deletes the player's sessions, but the wall must not depend on that
// side effect alone (milestone 6's keyring middleware keeps this clause).
export async function getSessionAuth(
  sessionId: string,
): Promise<SessionAuth | null> {
  const { rows } = await pool.query<SessionAuthRow>(
    `SELECT s.id AS session_id, s.last_seen_at,
            p.id AS player_id, p.name AS player_name, p.is_captain,
            t.id AS team_id, t.slug AS team_slug
     FROM session s
     JOIN player p ON p.id = s.player_id
     JOIN team t ON t.id = p.team_id
     WHERE s.id = $1 AND s.last_seen_at > now() - interval '${SESSION_TTL}'
       AND EXISTS (
         SELECT 1 FROM roster_membership m
         WHERE m.player_id = p.id AND m.left_at IS NULL
       )`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.session_id,
    lastSeenAt: row.last_seen_at,
    playerId: row.player_id,
    playerName: row.player_name,
    isCaptain: row.is_captain,
    teamId: row.team_id,
    teamSlug: row.team_slug,
  };
}

export async function touchSession(sessionId: string): Promise<void> {
  await pool.query(`UPDATE session SET last_seen_at = now() WHERE id = $1`, [
    sessionId,
  ]);
}

// Expired rows are swept opportunistically on every /join — no scheduler.
export async function pruneExpiredSessions(): Promise<void> {
  await pool.query(
    `DELETE FROM session WHERE last_seen_at <= now() - interval '${SESSION_TTL}'`,
  );
}
