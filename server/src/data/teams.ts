import { randomBytes } from "node:crypto";
import type {
  CreateTeamInput,
  Team,
  TeamSettingsInput,
} from "@turtleherder/shared";
import { pool } from "../db.js";
import { generateJoinToken } from "./access.js";

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
  quota_noun_singular: string | null;
  quota_noun_plural: string | null;
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
const TEAM_COLUMNS = `id, name, slug, full_side, min_to_play, men_ceiling,
  women_floor, floor_type, keeper_scoping, quota_noun_singular,
  quota_noun_plural, timezone`;

export async function getTeamById(id: number): Promise<Team> {
  const { rows } = await pool.query<TeamRow>(
    `SELECT ${TEAM_COLUMNS} FROM team WHERE id = $1`,
    [id],
  );
  return toTeam(rows[0]!);
}

export interface CreatedTeam {
  team: Team;
  captainJoinToken: string;
  sessionId: string;
}

// The public counterpart to create-team.ts: one transaction creates the team,
// first captain, open stint, and the creator browser's first keyring key.
export async function createTeam(
  input: CreateTeamInput,
  existingSessionId?: string,
): Promise<CreatedTeam> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const teamResult = await client.query<TeamRow>(
      `INSERT INTO team (name, slug, full_side, min_to_play, men_ceiling,
                         women_floor, floor_type, keeper_scoping,
                         quota_noun_singular, quota_noun_plural, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${TEAM_COLUMNS}`,
      [
        input.name,
        input.slug,
        input.fullSide,
        input.minToPlay,
        input.menCeiling,
        input.womenFloor,
        input.floorType,
        input.keeperScoping,
        input.quotaNounSingular,
        input.quotaNounPlural,
        input.timezone,
      ],
    );
    const teamRow = teamResult.rows[0]!;
    const captainJoinToken = generateJoinToken();
    const captainResult = await client.query<{ id: number }>(
      `INSERT INTO player
         (team_id, name, counts_toward_minimum, is_captain, join_token)
       VALUES ($1, $2, false, true, $3)
       RETURNING id`,
      [teamRow.id, input.captain, captainJoinToken],
    );
    const captainId = captainResult.rows[0]!.id;
    await client.query(
      `INSERT INTO roster_membership (player_id, joined_at)
       VALUES ($1, now())`,
      [captainId],
    );

    // Creation adds the new captain key to a live keyring rather than
    // signing an existing multi-team user out of their other teams.
    let sessionId: string | null = null;
    if (existingSessionId) {
      const live = await client.query<{ id: string }>(
        `UPDATE session SET last_seen_at = now()
         WHERE id = $1 AND last_seen_at > now() - interval '365 days'
         RETURNING id`,
        [existingSessionId],
      );
      sessionId = live.rows[0]?.id ?? null;
    }
    if (sessionId === null) {
      sessionId = randomBytes(32).toString("base64url");
      await client.query(`INSERT INTO session (id) VALUES ($1)`, [sessionId]);
    }
    await client.query(
      `INSERT INTO session_player (session_id, player_id, team_id)
       VALUES ($1, $2, $3)`,
      [sessionId, captainId, teamRow.id],
    );
    await client.query("COMMIT");
    return {
      team: toTeam(teamRow),
      captainJoinToken,
      sessionId,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateTeamSettings(
  teamId: number,
  input: TeamSettingsInput,
): Promise<Team> {
  const { rows } = await pool.query<TeamRow>(
    `UPDATE team SET name = $2, timezone = $3
     WHERE id = $1
     RETURNING ${TEAM_COLUMNS}`,
    [teamId, input.name, input.timezone],
  );
  return toTeam(rows[0]!);
}
