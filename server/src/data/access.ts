import { randomBytes } from "node:crypto";
import type { PlayerAccess } from "@turtleherder/shared";
import { pool } from "../db.js";

// 128-bit base64url, per DESIGN.md. Stored plaintext, deliberately:
// captains can always re-copy a player's current link.
export function generateJoinToken(): string {
  return randomBytes(16).toString("base64url");
}

interface AccessRow {
  id: number;
  name: string;
  join_token: string;
  join_token_revoked_at: Date | null;
}

function toPlayerAccess(row: AccessRow): PlayerAccess {
  return {
    playerId: row.id,
    name: row.name,
    // A revoked token stays in the row (so revokedAt is reportable) but is
    // never handed out — it's dead until a captain regenerates.
    joinToken: row.join_token_revoked_at ? null : row.join_token,
    revokedAt: row.join_token_revoked_at?.toISOString() ?? null,
  };
}

// A revoked token is null (indistinguishable from unknown — leaks nothing).
// A valid token whose player has no open stint is "departed": the token
// stays valid-but-inert so "Add back" revives the original link, and /join
// gives its rightful holder the distinct departed response.
export async function findPlayerByJoinToken(
  token: string,
): Promise<
  | { status: "ok"; playerId: number; teamSlug: string }
  | { status: "departed"; teamName: string }
  | null
> {
  const { rows } = await pool.query<{
    player_id: number;
    team_slug: string;
    team_name: string;
    active: boolean;
  }>(
    `SELECT p.id AS player_id, t.slug AS team_slug, t.name AS team_name,
            EXISTS (
              SELECT 1 FROM roster_membership m
              WHERE m.player_id = p.id AND m.left_at IS NULL
            ) AS active
     FROM player p
     JOIN team t ON t.id = p.team_id
     WHERE p.join_token = $1 AND p.join_token_revoked_at IS NULL`,
    [token],
  );
  const row = rows[0];
  if (!row) return null;
  if (!row.active) return { status: "departed", teamName: row.team_name };
  return { status: "ok", playerId: row.player_id, teamSlug: row.team_slug };
}

// Active players only: a departed player's live join link has no business
// on the manage-access page.
export async function getAccessList(teamId: number): Promise<PlayerAccess[]> {
  const { rows } = await pool.query<AccessRow>(
    `SELECT id, name, join_token, join_token_revoked_at
     FROM player p WHERE team_id = $1
       AND EXISTS (
         SELECT 1 FROM roster_membership m
         WHERE m.player_id = p.id AND m.left_at IS NULL
       )
     ORDER BY name ASC`,
    [teamId],
  );
  return rows.map(toPlayerAccess);
}

// Regenerate and revoke both kill the player's sessions in the same
// transaction — cutting one person's access is the whole point of auth.

export async function regenerateToken(
  teamId: number,
  playerId: number,
): Promise<PlayerAccess | null> {
  return updateTokenAndKillSessions(
    teamId,
    playerId,
    `UPDATE player SET join_token = $3, join_token_revoked_at = NULL
     WHERE id = $2 AND team_id = $1
     RETURNING id, name, join_token, join_token_revoked_at`,
    [generateJoinToken()],
  );
}

export async function revokeToken(
  teamId: number,
  playerId: number,
): Promise<PlayerAccess | null> {
  // COALESCE keeps the original revocation time on a repeat revoke.
  return updateTokenAndKillSessions(
    teamId,
    playerId,
    `UPDATE player
     SET join_token_revoked_at = COALESCE(join_token_revoked_at, now())
     WHERE id = $2 AND team_id = $1
     RETURNING id, name, join_token, join_token_revoked_at`,
  );
}

async function updateTokenAndKillSessions(
  teamId: number,
  playerId: number,
  updateSql: string,
  extraParams: unknown[] = [],
): Promise<PlayerAccess | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<AccessRow>(updateSql, [
      teamId,
      playerId,
      ...extraParams,
    ]);
    const row = rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    // Milestone 6 (keyring): when session.player_id becomes session_player,
    // this must become "detach this player's key" (DELETE FROM
    // session_player WHERE player_id = $1), NOT a delete of the sessions it
    // appears in — see the keyring section's "Amended by milestone 5.5".
    await client.query(`DELETE FROM session WHERE player_id = $1`, [playerId]);
    await client.query("COMMIT");
    return toPlayerAccess(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
