import { z } from "zod";

// ---- Team ----

export const teamSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
    fullSide: z.number().int(),
    minToPlay: z.number().int(),
    menCeiling: z.number().int().nullable(),
    womenFloor: z.number().int().nullable(),
    floorType: z.enum(["play_down", "forfeit"]).nullable(),
    keeperScoping: z.enum(["included", "excluded"]),
    // The noun used by the roster report, e.g. "woman"/"women". Both forms
    // are stored because plurals aren't derivable (woman -> women).
    quotaNounSingular: z.string(),
    quotaNounPlural: z.string(),
    timezone: z.string(), // IANA name, e.g. "America/New_York"
  })
  .refine((team) => (team.womenFloor === null) === (team.floorType === null), {
    error: "floorType must be set if and only if womenFloor is set",
    path: ["floorType"],
  });

export type Team = z.infer<typeof teamSchema>;

// ---- Player ----

export const playerSchema = z.object({
  id: z.number().int(),
  teamId: z.number().int(),
  name: z.string(),
  countsTowardMinimum: z.boolean(),
});

export type Player = z.infer<typeof playerSchema>;

// A departed player, as listed in the captains-only "Former players"
// section: GET /api/teams/:slug/players/former. leftAt is when their most
// recent membership stint closed.
export const formerPlayerSchema = playerSchema.extend({
  leftAt: z.iso.datetime({ offset: true }),
});

export type FormerPlayer = z.infer<typeof formerPlayerSchema>;

export const playerInputSchema = z.object({
  name: z.string().trim().min(1),
  countsTowardMinimum: z.boolean(),
});

export type PlayerInput = z.infer<typeof playerInputSchema>;

// ---- Game ----

export const gameSchema = z.object({
  id: z.number().int(),
  teamId: z.number().int(),
  opponentName: z.string().nullable(), // null = bye week
  opponentColor: z.string().nullable(),
  startsAt: z.iso.datetime({ offset: true }), // ISO instant over the wire
});

export type Game = z.infer<typeof gameSchema>;

export const gameInputSchema = z.object({
  opponentName: z.string().trim().min(1).nullable(), // null = bye week
  opponentColor: z.string().trim().min(1).nullable(),
  startsAt: z.iso.datetime({ offset: true }),
});

export type GameInput = z.infer<typeof gameInputSchema>;

// ---- Attendance ----

// A stored response. The absence of a row means "hasn't responded yet";
// that state exists only in derived view data, never in the database.
export const attendanceStatusSchema = z.enum(["yes", "no", "not_sure"]);

export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const attendanceInputSchema = z.object({
  status: attendanceStatusSchema,
});

// ---- Auth ----

// The contract for any team-scoped request without a valid session for that
// team: a uniform 401 with this body, whether the visitor is signed out,
// signed into a different team, or the slug doesn't exist at all — so team
// slugs can't be enumerated. The wall page keys off the 401.
export const unauthorizedErrorSchema = z.object({
  error: z.literal("unauthorized"),
});

// A signed-in non-captain calling a captain-only endpoint.
export const forbiddenErrorSchema = z.object({
  error: z.literal("forbidden"),
});

// Where GET /join/<token> sends a browser holding an invalid or revoked
// token. Reveals nothing about any team; the wall page can show
// "that link didn't work — ask your captain for a fresh one."
export const INVALID_JOIN_REDIRECT = "/?join=invalid";

// Where GET /join/<token> sends a *valid* token whose player has no open
// roster stint — they've been removed from the team. Deliberately distinct
// from the invalid redirect (a reasoned exception to the uniform-401
// contract; see DESIGN.md's Roster history section): only the token's
// rightful holder can ever see it, and the invalid-link copy ("ask your
// captain for a fresh one") is advice that cannot work when the gate is the
// stint, not the token. The server appends &team=<name> so the wall can say
// whose roster they're no longer on.
export const DEPARTED_JOIN_REDIRECT = "/?join=departed";

// The signed-in player: GET /api/teams/:slug/me.
export const meSchema = z.object({
  playerId: z.number().int(),
  name: z.string(),
  isCaptain: z.boolean(),
});

export type Me = z.infer<typeof meSchema>;

// One active team key held by the current browser session:
// GET /api/session/teams. A player identity remains team-specific; rows here
// make no claim that similarly named players on different teams are one human.
export const sessionTeamSchema = z.object({
  teamId: z.number().int(),
  slug: z.string(),
  name: z.string(),
  playerId: z.number().int(),
  playerName: z.string(),
});

export type SessionTeam = z.infer<typeof sessionTeamSchema>;

// One row of the captains' manage-access page: GET /api/teams/:slug/access.
// A revoked player keeps their row but the token is withheld until a captain
// regenerates (POST …/players/:id/regenerate-token; revoke is …/revoke-token).
export const playerAccessSchema = z.object({
  playerId: z.number().int(),
  name: z.string(),
  joinToken: z.string().nullable(), // null = revoked
  revokedAt: z.iso.datetime({ offset: true }).nullable(),
  // First successful redemption of the *current* token — not recent app
  // activity. null = never opened. Reset by regeneration (it's a new link);
  // preserved by revocation (the row reports what the dead link's state was).
  joinTokenUsedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type PlayerAccess = z.infer<typeof playerAccessSchema>;

// ---- View models ----

// A player's row within one game on the schedule page.
export const playerGameStatusSchema = z.object({
  playerId: z.number().int(),
  name: z.string(),
  countsTowardMinimum: z.boolean(),
  status: attendanceStatusSchema.nullable(), // null = no response
});

export type PlayerGameStatus = z.infer<typeof playerGameStatusSchema>;

// One game with everyone's status — what the schedule and single-game pages render.
export const gameWithAttendanceSchema = gameSchema.extend({
  players: z.array(playerGameStatusSchema),
});

export type GameWithAttendance = z.infer<typeof gameWithAttendanceSchema>;
