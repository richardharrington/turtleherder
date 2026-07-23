import type { Team } from "@turtleherder/shared";
import { pool } from "../db.js";

// All SQL touching the team table lives here, and rows are typed
// in exactly one place. Other resources follow the same pattern.

interface TeamRow {
  id: number;
  name: string;
  slug: string;
  full_side: number;
  min_to_play: number;
  men_ceiling: number | null;
  women_floor: number | null;
  floor_type: "play_down" | "forfeit" | null;
  keeper_scoping: "included" | "excluded";
  quota_noun_singular: string;
  quota_noun_plural: string;
  timezone: string;
}

function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    fullSide: row.full_side,
    minToPlay: row.min_to_play,
    menCeiling: row.men_ceiling,
    womenFloor: row.women_floor,
    floorType: row.floor_type,
    keeperScoping: row.keeper_scoping,
    quotaNounSingular: row.quota_noun_singular,
    quotaNounPlural: row.quota_noun_plural,
    timezone: row.timezone,
  };
}

// Handlers resolve the team from the session (see auth.ts), which guarantees
// it exists — so this returns Team, not Team | null. Slug lookup happens in
// the session middleware's join.
export async function getTeamById(id: number): Promise<Team> {
  const { rows } = await pool.query<TeamRow>(
    `SELECT id, name, slug, full_side, min_to_play, men_ceiling,
            women_floor, floor_type, keeper_scoping, quota_noun_singular,
            quota_noun_plural, timezone
     FROM team
     WHERE id = $1`,
    [id],
  );
  return toTeam(rows[0]!);
}
