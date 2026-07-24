// Creates one team and its captain, then prints the captain's join link —
// the script that seeds production. Unlike the dev seed it never truncates,
// and it only ever inserts the two rows a team needs to start: everything
// else (the rest of the roster, the schedule) goes in through the UI.
//
// It is also a dry run for milestone 7's self-serve create-team flow, which
// has to do exactly this much through a web form.

import { parseArgs } from "node:util";
import { createTeamInputSchema } from "@turtleherder/shared";
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
  [--quota-noun-singular woman] \\
  [--quota-noun-plural women] \\
  [--restricting-noun-singular man] \\
  [--restricting-noun-plural men] \\
  --timezone America/New_York \\
  --captain "Alison Bechdel"

--floor-type defaults to play_down when --women-floor is set.
Quota nouns are required with either gender constraint and omitted without both.
Restricting nouns default to man/men with --men-ceiling and are omitted without it.
--keeper-scoping defaults to included.
Requires DATABASE_URL and APP_ORIGIN (e.g. https://turtleherder.com).`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

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
        "restricting-noun-singular": { type: "string" },
        "restricting-noun-plural": { type: "string" },
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

const parsed = createTeamInputSchema.safeParse({
  name: raw.name,
  slug: raw.slug,
  fullSide: Number(raw["full-side"]),
  minToPlay: Number(raw["min-to-play"]),
  menCeiling: raw["men-ceiling"] === undefined ? null : Number(raw["men-ceiling"]),
  womenFloor: raw["women-floor"] === undefined ? null : Number(raw["women-floor"]),
  floorType: raw["floor-type"] ??
    (raw["women-floor"] === undefined ? null : "play_down"),
  keeperScoping: raw["keeper-scoping"] ?? "included",
  quotaNounSingular: raw["quota-noun-singular"] ?? null,
  quotaNounPlural: raw["quota-noun-plural"] ?? null,
  restrictingNounSingular: raw["restricting-noun-singular"] ??
    (raw["men-ceiling"] === undefined ? null : "man"),
  restrictingNounPlural: raw["restricting-noun-plural"] ??
    (raw["men-ceiling"] === undefined ? null : "men"),
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
                       quota_noun_singular, quota_noun_plural,
                       restricting_noun_singular, restricting_noun_plural,
                       setup_completed_at, timezone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13)
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
      args.restrictingNounSingular,
      args.restrictingNounPlural,
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
