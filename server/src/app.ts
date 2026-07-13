import { zValidator } from "@hono/zod-validator";
import { attendanceInputSchema } from "@turtleherder/shared";
import { Hono } from "hono";
import { setAttendance } from "./data/attendance.js";
import { getGamesWithAttendance, getGameWithAttendance } from "./data/games.js";
import { getTeamBySlug } from "./data/teams.js";

function parseId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

export const app = new Hono()
  .get("/api/health", (c) => c.json({ ok: true }))

  .get("/api/teams/:slug", async (c) => {
    const team = await getTeamBySlug(c.req.param("slug"));
    if (!team) {
      return c.json({ error: "team not found" }, 404);
    }
    return c.json(team);
  })

  .get("/api/teams/:slug/games", async (c) => {
    const team = await getTeamBySlug(c.req.param("slug"));
    if (!team) {
      return c.json({ error: "team not found" }, 404);
    }
    return c.json(await getGamesWithAttendance(team.id));
  })

  .get("/api/teams/:slug/games/:gameId", async (c) => {
    const team = await getTeamBySlug(c.req.param("slug"));
    const gameId = parseId(c.req.param("gameId"));
    if (!team || gameId === null) {
      return c.json({ error: "not found" }, 404);
    }
    const game = await getGameWithAttendance(team.id, gameId);
    if (!game) {
      return c.json({ error: "game not found" }, 404);
    }
    return c.json(game);
  })

  .put(
    "/api/teams/:slug/games/:gameId/attendance/:playerId",
    zValidator("json", attendanceInputSchema),
    async (c) => {
      const team = await getTeamBySlug(c.req.param("slug"));
      const gameId = parseId(c.req.param("gameId"));
      const playerId = parseId(c.req.param("playerId"));
      if (!team || gameId === null || playerId === null) {
        return c.json({ error: "not found" }, 404);
      }
      const { status } = c.req.valid("json");
      const ok = await setAttendance(team.id, gameId, playerId, status);
      if (!ok) {
        return c.json({ error: "game or player not found" }, 404);
      }
      return c.json({ status });
    },
  );
