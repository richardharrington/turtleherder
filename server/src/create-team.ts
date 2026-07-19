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

const USAGE = `Usage: pnpm db:create-team \\
  --name "Brooklyn Bocce" \\
  --slug brooklyn-bocce \\
  --min-players 7 \\
  --min-quota-players 2 \\
  --quota-noun-singular woman \\
  --quota-noun-plural women \\
  --timezone America/New_York \\
  --captain "Alison Bechdel"

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

const argsSchema = z
  .object({
    name: z.string().min(1),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase letters, digits, and single hyphens"),
    minPlayers: z.coerce.number().int().min(0),
    minQuotaPlayers: z.coerce.number().int().min(0),
    quotaNounSingular: z.string().min(1),
    quotaNounPlural: z.string().min(1),
    timezone: z.string().refine(isKnownTimeZone, "must be an IANA name, e.g. America/New_York"),
    captain: z.string().min(1),
  })
  // The roster report would otherwise ask for more quota players than players.
  .refine((a) => a.minQuotaPlayers <= a.minPlayers, {
    error: "--min-quota-players cannot exceed --min-players",
    path: ["minQuotaPlayers"],
  });

function parseCliArgs() {
  try {
    return parseArgs({
      options: {
        name: { type: "string" },
        slug: { type: "string" },
        "min-players": { type: "string" },
        "min-quota-players": { type: "string" },
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
  minPlayers: raw["min-players"],
  minQuotaPlayers: raw["min-quota-players"],
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
    `INSERT INTO team (name, slug, min_players, min_quota_players,
                       quota_noun_singular, quota_noun_plural, timezone)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      args.name,
      args.slug,
      args.minPlayers,
      args.minQuotaPlayers,
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
