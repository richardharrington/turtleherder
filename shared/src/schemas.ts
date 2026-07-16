import { z } from "zod";

// ---- Team ----

export const teamSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  minPlayers: z.number().int().min(0),
  minQuotaPlayers: z.number().int().min(0),
  // The noun used by the roster report, e.g. "woman"/"women". Both forms
  // are stored because plurals aren't derivable (woman -> women).
  quotaNounSingular: z.string(),
  quotaNounPlural: z.string(),
  timezone: z.string(), // IANA name, e.g. "America/New_York"
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

// Where GET /join/<token> sends a browser holding an invalid or revoked
// token. Reveals nothing about any team; the wall page can show
// "that link didn't work — ask your captain for a fresh one."
export const INVALID_JOIN_REDIRECT = "/?join=invalid";

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
