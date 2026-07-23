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
  is_captain: boolean;
  join_token: string;
  join_token_revoked_at: Date | null;
  join_token_used_at: Date | null;
}

function toPlayerAccess(row: AccessRow): PlayerAccess {
  return {
    playerId: row.id,
    name: row.name,
    isCaptain: row.is_captain,
    // A revoked token stays in the row (so revokedAt is reportable) but is
    // never handed out — it's dead until a captain regenerates.
    joinToken: row.join_token_revoked_at ? null : row.join_token,
    revokedAt: row.join_token_revoked_at?.toISOString() ?? null,
    joinTokenUsedAt: row.join_token_used_at?.toISOString() ?? null,
  };
}

// A revoked token is null (indistinguishable from unknown — leaks nothing).
// A valid token whose player has no open stint is "departed": the token
// stays valid-but-inert so "Add back" revives the original link, and /join
// gives its rightful holder the distinct departed response.
//
// A successful exchange also records the token's first use, and does it in
// the same statement that validates the token: the UPDATE's WHERE re-checks
// `join_token = $1`, so a join racing a captain's regeneration can never
// stamp the *replacement* token — the stale token simply no longer matches
// and the join falls through to the invalid redirect, which is what a
// regenerated-away link deserves. Departed/revoked/invalid tokens never
// reach the UPDATE and mark nothing.
export async function exchangeJoinToken(
  token: string,
): Promise<
  | { status: "ok"; playerId: number; teamSlug: string }
  | { status: "departed"; teamName: string }
  | null
> {
  const { rows } = await pool.query<{ player_id: number; team_slug: string }>(
    `UPDATE player p
     SET join_token_used_at = COALESCE(p.join_token_used_at, now())
     FROM team t
     WHERE t.id = p.team_id
       AND p.join_token = $1 AND p.join_token_revoked_at IS NULL
       AND EXISTS (
         SELECT 1 FROM roster_membership m
         WHERE m.player_id = p.id AND m.left_at IS NULL
       )
     RETURNING p.id AS player_id, t.slug AS team_slug`,
    [token],
  );
  const row = rows[0];
  if (row) {
    return { status: "ok", playerId: row.player_id, teamSlug: row.team_slug };
  }
  // No active-token match: distinguish the departed holder (valid, unrevoked
  // token, closed stint) from a genuinely dead link. Read-only — a departed
  // join must not mark usage.
  const departed = await pool.query<{ team_name: string }>(
    `SELECT t.name AS team_name
     FROM player p JOIN team t ON t.id = p.team_id
     WHERE p.join_token = $1 AND p.join_token_revoked_at IS NULL`,
    [token],
  );
  const departedRow = departed.rows[0];
  if (!departedRow) return null;
  return { status: "departed", teamName: departedRow.team_name };
}

// Active players only: a departed player's live join link has no business
// on the manage-access page.
export async function getAccessList(teamId: number): Promise<PlayerAccess[]> {
  const { rows } = await pool.query<AccessRow>(
    `SELECT id, name, is_captain, join_token, join_token_revoked_at, join_token_used_at
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

// Regenerate and revoke both detach the player's key from every session in
// the same transaction — cutting one person's access without disturbing the
// other teams on those keyrings.

export async function regenerateToken(
  teamId: number,
  playerId: number,
): Promise<PlayerAccess | null> {
  // A regenerated token is a brand-new link nobody has opened, so its
  // first-use stamp resets with it.
  return updateTokenAndDetachKeys(
    teamId,
    playerId,
    `UPDATE player SET join_token = $3, join_token_revoked_at = NULL,
                       join_token_used_at = NULL
     WHERE id = $2 AND team_id = $1
     RETURNING id, name, is_captain, join_token, join_token_revoked_at, join_token_used_at`,
    [generateJoinToken()],
  );
}

export async function revokeToken(
  teamId: number,
  playerId: number,
): Promise<PlayerAccess | null> {
  // COALESCE keeps the original revocation time on a repeat revoke.
  // join_token_used_at is deliberately untouched: a revoked row still
  // reports whether the link was ever opened.
  return updateTokenAndDetachKeys(
    teamId,
    playerId,
    `UPDATE player
     SET join_token_revoked_at = COALESCE(join_token_revoked_at, now())
     WHERE id = $2 AND team_id = $1
     RETURNING id, name, is_captain, join_token, join_token_revoked_at, join_token_used_at`,
  );
}

async function updateTokenAndDetachKeys(
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
    await client.query(`DELETE FROM session_player WHERE player_id = $1`, [
      playerId,
    ]);
    await client.query("COMMIT");
    return toPlayerAccess(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
