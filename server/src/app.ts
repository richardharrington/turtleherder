import { Hono } from "hono";
import { getTeamBySlug } from "./data/teams.js";

export const app = new Hono()
  .get("/api/health", (c) => c.json({ ok: true }))

  .get("/api/teams/:slug", async (c) => {
    const team = await getTeamBySlug(c.req.param("slug"));
    if (!team) {
      return c.json({ error: "team not found" }, 404);
    }
    return c.json(team);
  });
