import { z } from "zod";

// ---- Team ----

export const teamSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
    fullSide: z.number().int().nullable(),
    minToPlay: z.number().int().nullable(),
    menCeiling: z.number().int().nullable(),
    womenFloor: z.number().int().nullable(),
    floorType: z.enum(["play_down", "forfeit"]).nullable(),
    keeperScoping: z.enum(["none", "included", "excluded"]),
    // The noun used by the roster report, e.g. "woman"/"women". Both forms
    // are stored because plurals aren't derivable (woman -> women). A team
    // without either gender constraint has neither noun.
    quotaNounSingular: z.string().nullable(),
    quotaNounPlural: z.string().nullable(),
    // The category constrained by a men ceiling. It is separate from the
    // protected-category nouns above because each is stored where it surfaces.
    restrictingNounSingular: z.string().nullable(),
    restrictingNounPlural: z.string().nullable(),
    setupCompletedAt: z.iso.datetime({ offset: true }).nullable(),
    timezone: z.string(), // IANA name, e.g. "America/New_York"
  })
  .refine((team) => (team.womenFloor === null) === (team.floorType === null), {
    error: "floorType must be set if and only if womenFloor is set",
    path: ["floorType"],
  })
  .refine(
    (team) =>
      (team.quotaNounSingular === null) ===
        (team.quotaNounPlural === null) &&
      (team.womenFloor === null && team.menCeiling === null) ===
        (team.quotaNounSingular === null),
    {
      error: "quota nouns must be set if and only if a gender constraint is set",
      path: ["quotaNounSingular"],
    },
  )
  .refine(
    (team) =>
      (team.restrictingNounSingular === null) ===
        (team.restrictingNounPlural === null) &&
      (team.menCeiling === null) === (team.restrictingNounSingular === null),
    {
      error: "restricting nouns must be set if and only if a men ceiling is set",
      path: ["restrictingNounSingular"],
    },
  )
  .refine(
    (team) =>
      (team.fullSide === null) === (team.minToPlay === null) &&
      (team.setupCompletedAt === null || team.fullSide !== null),
    {
      error: "a completed team must have a complete game format",
      path: ["setupCompletedAt"],
    },
  );

export type Team = z.infer<typeof teamSchema>;
export type ReadyTeam = Team & {
  fullSide: number;
  minToPlay: number;
  setupCompletedAt: string;
};

// ---- Team creation and settings ----

export const RESERVED_TEAM_SLUGS = new Set([
  "",
  ".well-known",
  "api",
  "assets",
  "create",
  "health",
  "join",
]);

export function slugifyTeamName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isKnownTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const nullableNonnegativeInt = z.number().int().min(0).nullable();
const nonemptyNullableString = z.string().trim().min(1).nullable();

const teamRuleFields = {
  fullSide: z.number().int().min(0),
  minToPlay: z.number().int().min(0),
  menCeiling: nullableNonnegativeInt,
  womenFloor: nullableNonnegativeInt,
  floorType: z.enum(["play_down", "forfeit"]).nullable(),
  keeperScoping: z.enum(["none", "included", "excluded"]),
  quotaNounSingular: nonemptyNullableString,
  quotaNounPlural: nonemptyNullableString,
  restrictingNounSingular: nonemptyNullableString,
  restrictingNounPlural: nonemptyNullableString,
};

function validateTeamRules(
  a: z.infer<z.ZodObject<typeof teamRuleFields>>,
  ctx: z.RefinementCtx,
): void {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });
  if ((a.womenFloor === null) !== (a.floorType === null)) {
    issue("floorType", "floorType must be set if and only if womenFloor is set");
  }
  if (
    (a.quotaNounSingular === null) !== (a.quotaNounPlural === null) ||
    (a.womenFloor === null && a.menCeiling === null) !==
      (a.quotaNounSingular === null)
  ) {
    issue("quotaNounSingular", "quota nouns must be set if and only if a gender constraint is set");
  }
  if (
    (a.restrictingNounSingular === null) !==
      (a.restrictingNounPlural === null) ||
    (a.menCeiling === null) !== (a.restrictingNounSingular === null)
  ) {
    issue("restrictingNounSingular", "restricting nouns must be set if and only if a men ceiling is set");
  }
  if (a.minToPlay > a.fullSide) {
    issue("minToPlay", "Minimum to play cannot exceed full side.");
  }
  const bindingSlots = a.fullSide - (a.keeperScoping === "excluded" ? 1 : 0);
  if (a.womenFloor !== null && a.womenFloor > bindingSlots) {
    issue("womenFloor", "Women floor cannot exceed the slots it binds.");
  }
  if (a.menCeiling !== null && a.menCeiling > bindingSlots) {
    issue("menCeiling", "Men ceiling cannot exceed the slots it binds.");
  }
}

// The operator CLI and both captain-facing rule forms all use this exact
// schema, keeping every engine invariant in one place.
export const teamRulesInputSchema = z
  .object(teamRuleFields)
  .superRefine(validateTeamRules);
export type TeamRulesInput = z.infer<typeof teamRulesInputSchema>;

const creationFields = {
  name: z.string().trim().min(1),
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and single hyphens.",
    )
    .refine((slug) => !RESERVED_TEAM_SLUGS.has(slug), "That URL is reserved."),
  timezone: z
    .string()
    .trim()
    .refine(isKnownTimeZone, "Use a valid IANA timezone."),
  captain: z.string().trim().min(1),
};

// CLI input: operator-created teams still require a complete ruleset.
export const createTeamInputSchema = z
  .object({ ...creationFields, ...teamRuleFields })
  .superRefine(validateTeamRules);
export type CreateTeamInput = z.infer<typeof createTeamInputSchema>;

// Public signup now asks only universal facts. The dedicated setup screen
// supplies game format and the explicit gender-rule answer next.
export const publicCreateTeamInputSchema = z.object({
  ...creationFields,
  // A real user never sees or fills this. The API silently discards a
  // submission when it is non-empty.
  website: z.string().max(500).optional().default(""),
});
export type PublicCreateTeamInput = z.infer<typeof publicCreateTeamInputSchema>;

export const createTeamResultSchema = z.object({
  slug: z.string(),
  captainJoinUrl: z.string(),
});

export type CreateTeamResult = z.infer<typeof createTeamResultSchema>;

export const teamSettingsInputSchema = z.object({
  name: z.string().trim().min(1),
  timezone: z
    .string()
    .trim()
    .refine(isKnownTimeZone, "Use a valid IANA timezone."),
});

export type TeamSettingsInput = z.infer<typeof teamSettingsInputSchema>;

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
  isCaptain: z.boolean(),
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
