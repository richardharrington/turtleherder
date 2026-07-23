// Creates one team and its captain, then prints the captain's join link —
// the script that seeds production. Unlike the dev seed it never truncates,
// and it only ever inserts the two rows a team needs to start: everything
// else (the rest of the roster, the schedule) goes in through the UI.
//
// It is also a dry run for milestone 7's self-serve create-team flow, which
// has to do exactly this much through a web form.

import { parseArgs } from "node:util";
import { z } from "zod";
import { generateJoinToken } from "./data/access.js";
import { pool } from "./db.js";

const USAGE = `Usage: pnpm db:create-team -- \\
  --name "Brooklyn Bocce" \\
  --slug brooklyn-bocce \\
  --full-side 7 \\
  --min-to-play 5 \\
  [--women-floor 2] \\
  [--men-ceiling 5] \\
  [--floor-type play_down] \\
  [--keeper-scoping included] \\
  --quota-noun-singular woman \\
  --quota-noun-plural women \\
  --timezone America/New_York \\
  --captain "Alison Bechdel"

--floor-type defaults to play_down when --women-floor is set.
--keeper-scoping defaults to included.
Requires DATABASE_URL and APP_ORIGIN (e.g. https://turtleherder.com).`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// An IANA name the platform actually knows; catches "America/New York" and
// other near-misses here rather than at render time on the team's schedule.
function isKnownTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const optionalInt = z.preprocess(
  (value) => value ?? null,
  z.coerce.number().int().min(0).nullable(),
);

const argsSchema = z
  .object({
    name: z.string().min(1),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase letters, digits, and single hyphens"),
    fullSide: z.coerce.number().int().min(0),
    minToPlay: z.coerce.number().int().min(0),
    menCeiling: optionalInt,
    womenFloor: optionalInt,
    floorType: z.enum(["play_down", "forfeit"]).nullable(),
    keeperScoping: z.enum(["included", "excluded"]),
    quotaNounSingular: z.string().min(1),
    quotaNounPlural: z.string().min(1),
    timezone: z.string().refine(isKnownTimeZone, "must be an IANA name, e.g. America/New_York"),
    captain: z.string().min(1),
  })
  .refine((a) => (a.womenFloor === null) === (a.floorType === null), {
    error: "--floor-type must be set if and only if --women-floor is set",
    path: ["floorType"],
  })
  // Fail fast on configs the engine can never realize: a side that can't reach
  // its own forfeit line, or a gender knob larger than the slots it binds.
  // Without these the mistake surfaces as a 500 at report-render time instead.
  .refine((a) => a.minToPlay <= a.fullSide, {
    error: "--min-to-play cannot exceed --full-side",
    path: ["minToPlay"],
  })
  .refine(
    (a) =>
      a.womenFloor === null ||
      a.womenFloor <=
        a.fullSide - (a.keeperScoping === "excluded" ? 1 : 0),
    {
      error:
        "--women-floor cannot exceed the slots it binds (--full-side, minus the keeper when excluded)",
      path: ["womenFloor"],
    },
  )
  .refine(
    (a) =>
      a.menCeiling === null ||
      a.menCeiling <=
        a.fullSide - (a.keeperScoping === "excluded" ? 1 : 0),
    {
      error:
        "--men-ceiling cannot exceed the slots it binds (--full-side, minus the keeper when excluded)",
      path: ["menCeiling"],
    },
  );

function parseCliArgs() {
  // The root workspace script forwards its argument separator to tsx; strip
  // that one positional marker before node:util parses the actual flags.
  const cliArgs = process.argv.slice(2);
  if (cliArgs[0] === "--") cliArgs.shift();
  try {
    return parseArgs({
      args: cliArgs,
      options: {
        name: { type: "string" },
        slug: { type: "string" },
        "full-side": { type: "string" },
        "min-to-play": { type: "string" },
        "women-floor": { type: "string" },
        "men-ceiling": { type: "string" },
        "floor-type": { type: "string" },
        "keeper-scoping": { type: "string" },
        "quota-noun-singular": { type: "string" },
        "quota-noun-plural": { type: "string" },
        timezone: { type: "string" },
        captain: { type: "string" },
      },
      strict: true,
    }).values;
  } catch (err) {
    fail(`${(err as Error).message}\n\n${USAGE}`);
  }
}
const raw = parseCliArgs();

const parsed = argsSchema.safeParse({
  name: raw.name,
  slug: raw.slug,
  fullSide: raw["full-side"],
  minToPlay: raw["min-to-play"],
  menCeiling: raw["men-ceiling"],
  womenFloor: raw["women-floor"],
  floorType: raw["floor-type"] ??
    (raw["women-floor"] === undefined ? null : "play_down"),
  keeperScoping: raw["keeper-scoping"] ?? "included",
  quotaNounSingular: raw["quota-noun-singular"],
  quotaNounPlural: raw["quota-noun-plural"],
  timezone: raw.timezone,
  captain: raw.captain,
});
if (!parsed.success) {
  const problems = parsed.error.issues
    .map((i) => `  --${String(i.path[0] ?? "?").replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${i.message}`)
    .join("\n");
  fail(`Invalid arguments:\n${problems}\n\n${USAGE}`);
}
const args = parsed.data;

// Printed links are the whole point of this script, and a wrong one reaches
// the captain by text before anyone notices — so require the origin rather
// than defaulting to localhost the way the dev seed can afford to.
const appOrigin = process.env.APP_ORIGIN?.replace(/\/+$/, "");
if (!appOrigin) fail(`APP_ORIGIN is not set (e.g. https://turtleherder.com)\n\n${USAGE}`);

const client = await pool.connect();
try {
  await client.query("BEGIN");

  const teamResult = await client.query<{ id: number }>(
    `INSERT INTO team (name, slug, full_side, min_to_play, men_ceiling,
                       women_floor, floor_type, keeper_scoping,
                       quota_noun_singular, quota_noun_plural, timezone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      args.name,
      args.slug,
      args.fullSide,
      args.minToPlay,
      args.menCeiling,
      args.womenFloor,
      args.floorType,
      args.keeperScoping,
      args.quotaNounSingular,
      args.quotaNounPlural,
      args.timezone,
    ],
  );
  const teamId = teamResult.rows[0]!.id;

  // counts_toward_minimum is a fact about the captain, not about captaincy,
  // and there's no honest default — so it starts false and the captain flips
  // their own row on the roster page, where the rest of the team gets added.
  const joinToken = generateJoinToken();
  const captainResult = await client.query<{ id: number }>(
    `INSERT INTO player (team_id, name, counts_toward_minimum, is_captain, join_token)
     VALUES ($1, $2, false, true, $3)
     RETURNING id`,
    [teamId, args.captain, joinToken],
  );
  await client.query(
    `INSERT INTO roster_membership (player_id, joined_at) VALUES ($1, now())`,
    [captainResult.rows[0]!.id],
  );

  await client.query("COMMIT");

  console.log(`Created team '${args.name}' (slug: ${args.slug}) with captain ${args.captain}.`);
  console.log(`${args.captain}'s join link: ${appOrigin}/join/${joinToken}`);
  console.log(
    `\nAdd the rest of the roster and the schedule at ${appOrigin}/${args.slug} ` +
      `after signing in with that link.`,
  );
} catch (err) {
  await client.query("ROLLBACK");
  // The slug is the team's URL, so a collision is a normal mistake to make,
  // not a crash worth a stack trace.
  if ((err as { code?: string }).code === "23505") {
    fail(`A team with slug '${args.slug}' already exists.`);
  }
  throw err;
} finally {
  client.release();
  await pool.end();
}
