import { runner } from "node-pg-migrate";

const direction = process.argv[2] === "down" ? "down" : "up";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

await runner({
  databaseUrl,
  dir: new URL("../migrations", import.meta.url).pathname,
  direction,
  migrationsTable: "pgmigrations",
  count: direction === "down" ? 1 : Infinity,
});
