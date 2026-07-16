import { randomBytes } from "node:crypto";
import { pool } from "../db.js";

// 128-bit base64url, per DESIGN.md. Stored plaintext, deliberately:
// captains can always re-copy a player's current link.
export function generateJoinToken(): string {
  return randomBytes(16).toString("base64url");
}

export async function findPlayerByJoinToken(
  token: string,
): Promise<{ playerId: number; teamSlug: string } | null> {
  const { rows } = await pool.query<{ player_id: number; team_slug: string }>(
    `SELECT p.id AS player_id, t.slug AS team_slug
     FROM player p
     JOIN team t ON t.id = p.team_id
     WHERE p.join_token = $1 AND p.join_token_revoked_at IS NULL`,
    [token],
  );
  const row = rows[0];
  return row ? { playerId: row.player_id, teamSlug: row.team_slug } : null;
}
