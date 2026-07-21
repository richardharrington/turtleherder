import type { SessionTeam } from "@turtleherder/shared";
import { randomBytes } from "node:crypto";
import { pool } from "../db.js";

// Sessions last ~1 year, rolling: a session is valid while last_seen_at is
// within the TTL, and the middleware renews it (throttled) on every visit.
const SESSION_TTL = "365 days";

// A valid key joined to its player and team — everything the middleware
// needs to authorize one team-scoped request.
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

interface SessionTeamRow {
  team_id: number;
  team_slug: string;
  team_name: string;
  player_id: number;
  player_name: string;
}

// Adds a player key to an existing live session, or creates a fresh session
// when no usable id was supplied. The unique (session_id, team_id) constraint
// makes same-team joins replace only that team's key; re-tapping the same
// player's link is an idempotent update.
export async function createSession(
  playerId: number,
  existingSessionId?: string,
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let sessionId: string | null = null;
    if (existingSessionId) {
      const live = await client.query<{ id: string }>(
        `SELECT id FROM session
         WHERE id = $1 AND last_seen_at > now() - interval '${SESSION_TTL}'
         FOR UPDATE`,
        [existingSessionId],
      );
      sessionId = live.rows[0]?.id ?? null;
    }

    if (sessionId === null) {
      sessionId = randomBytes(32).toString("base64url");
      await client.query(`INSERT INTO session (id) VALUES ($1)`, [sessionId]);
    }

    const inserted = await client.query(
      `INSERT INTO session_player (session_id, player_id, team_id)
       SELECT $1, p.id, p.team_id FROM player p WHERE p.id = $2
       ON CONFLICT (session_id, team_id)
       DO UPDATE SET player_id = EXCLUDED.player_id`,
      [sessionId, playerId],
    );
    if ((inserted.rowCount ?? 0) === 0) {
      throw new Error(`player ${playerId} not found while creating session`);
    }

    await client.query("COMMIT");
    return sessionId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Auth requires an open roster stint as well as a live session. The team slug
// selects one key from the keyring, keeping /me unambiguous.
export async function getSessionAuth(
  sessionId: string,
  teamSlug: string,
): Promise<SessionAuth | null> {
  const { rows } = await pool.query<SessionAuthRow>(
    `SELECT s.id AS session_id, s.last_seen_at,
            p.id AS player_id, p.name AS player_name, p.is_captain,
            t.id AS team_id, t.slug AS team_slug
     FROM session s
     JOIN session_player sp ON sp.session_id = s.id
     JOIN player p ON p.id = sp.player_id AND p.team_id = sp.team_id
     JOIN team t ON t.id = sp.team_id
     WHERE s.id = $1 AND t.slug = $2
       AND s.last_seen_at > now() - interval '${SESSION_TTL}'
       AND EXISTS (
         SELECT 1 FROM roster_membership m
         WHERE m.player_id = p.id AND m.left_at IS NULL
       )`,
    [sessionId, teamSlug],
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

// Returns the active keys on one live keyring for the switcher, wall, and PWA
// chooser. Missing, expired, and zero-key sessions all produce an empty list.
export async function getSessionTeams(
  sessionId: string | undefined,
): Promise<SessionTeam[]> {
  if (!sessionId) return [];
  const { rows } = await pool.query<SessionTeamRow>(
    `SELECT t.id AS team_id, t.slug AS team_slug, t.name AS team_name,
            p.id AS player_id, p.name AS player_name
     FROM session s
     JOIN session_player sp ON sp.session_id = s.id
     JOIN player p ON p.id = sp.player_id AND p.team_id = sp.team_id
     JOIN team t ON t.id = sp.team_id
     WHERE s.id = $1 AND s.last_seen_at > now() - interval '${SESSION_TTL}'
       AND EXISTS (
         SELECT 1 FROM roster_membership m
         WHERE m.player_id = p.id AND m.left_at IS NULL
       )
     ORDER BY t.name, t.id`,
    [sessionId],
  );
  return rows.map((row) => ({
    teamId: row.team_id,
    slug: row.team_slug,
    name: row.team_name,
    playerId: row.player_id,
    playerName: row.player_name,
  }));
}

export async function touchSession(sessionId: string): Promise<void> {
  await pool.query(`UPDATE session SET last_seen_at = now() WHERE id = $1`, [
    sessionId,
  ]);
}

export async function deleteSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await pool.query(`DELETE FROM session WHERE id = $1`, [sessionId]);
}

// Expired rows are swept opportunistically on every /join — no scheduler.
export async function pruneExpiredSessions(): Promise<void> {
  await pool.query(
    `DELETE FROM session WHERE last_seen_at <= now() - interval '${SESSION_TTL}'`,
  );
}
