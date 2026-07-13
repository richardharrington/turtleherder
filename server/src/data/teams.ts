import type { Team } from "@turtleherder/shared";
import { pool } from "../db.js";

// All SQL touching the team table lives here, and rows are typed
// in exactly one place. Other resources follow the same pattern.

interface TeamRow {
  id: number;
  name: string;
  slug: string;
  min_players: number;
  min_quota_players: number;
  quota_noun_singular: string;
  quota_noun_plural: string;
  timezone: string;
}

function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    minPlayers: row.min_players,
    minQuotaPlayers: row.min_quota_players,
    quotaNounSingular: row.quota_noun_singular,
    quotaNounPlural: row.quota_noun_plural,
    timezone: row.timezone,
  };
}

export async function getTeamBySlug(slug: string): Promise<Team | null> {
  const { rows } = await pool.query<TeamRow>(
    `SELECT id, name, slug, min_players, min_quota_players,
            quota_noun_singular, quota_noun_plural, timezone
     FROM team
     WHERE slug = $1`,
    [slug],
  );
  const row = rows[0];
  return row ? toTeam(row) : null;
}
