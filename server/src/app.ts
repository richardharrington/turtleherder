import { zValidator } from "@hono/zod-validator";
import {
  attendanceInputSchema,
  gameInputSchema,
  INVALID_JOIN_REDIRECT,
  playerInputSchema,
} from "@turtleherder/shared";
import { Hono } from "hono";
import { setSessionCookie } from "./auth.js";
import { findPlayerByJoinToken } from "./data/access.js";
import { setAttendance } from "./data/attendance.js";
import {
  createGame,
  deleteGame,
  getGamesWithAttendance,
  getGameWithAttendance,
  updateGame,
} from "./data/games.js";
import {
  createPlayer,
  deletePlayer,
  getPlayersForTeam,
  updatePlayer,
} from "./data/players.js";
import { createSession, pruneExpiredSessions } from "./data/sessions.js";
import { getTeamBySlug } from "./data/teams.js";

function parseId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

export const app = new Hono()
  .get("/api/health", (c) => c.json({ ok: true }))

  // ---- Join: exchange a token for a session cookie ----
  // Lives outside /api: it's a browser navigation, not a JSON endpoint.

  .get("/join/:token", async (c) => {
    await pruneExpiredSessions();
    const found = await findPlayerByJoinToken(c.req.param("token"));
    if (!found) {
      // Same redirect for unknown and revoked tokens; leaks nothing.
      return c.redirect(INVALID_JOIN_REDIRECT);
    }
    setSessionCookie(c, await createSession(found.playerId));
    return c.redirect(`/${found.teamSlug}`);
  })

  // ---- Teams ----

  .get("/api/teams/:slug", async (c) => {
    const team = await getTeamBySlug(c.req.param("slug"));
    if (!team) {
      return c.json({ error: "team not found" }, 404);
    }
    return c.json(team);
  })

  // ---- Players ----

  .get("/api/teams/:slug/players", async (c) => {
    const team = await getTeamBySlug(c.req.param("slug"));
    if (!team) {
      return c.json({ error: "team not found" }, 404);
    }
    return c.json(await getPlayersForTeam(team.id));
  })

  .post(
    "/api/teams/:slug/players",
    zValidator("json", playerInputSchema),
    async (c) => {
      const team = await getTeamBySlug(c.req.param("slug"));
      if (!team) {
        return c.json({ error: "team not found" }, 404);
      }
      return c.json(await createPlayer(team.id, c.req.valid("json")), 201);
    },
  )

  .put(
    "/api/teams/:slug/players/:playerId",
    zValidator("json", playerInputSchema),
    async (c) => {
      const team = await getTeamBySlug(c.req.param("slug"));
      const playerId = parseId(c.req.param("playerId"));
      if (!team || playerId === null) {
        return c.json({ error: "not found" }, 404);
      }
      const player = await updatePlayer(team.id, playerId, c.req.valid("json"));
      if (!player) {
        return c.json({ error: "player not found" }, 404);
      }
      return c.json(player);
    },
  )

  .delete("/api/teams/:slug/players/:playerId", async (c) => {
    const team = await getTeamBySlug(c.req.param("slug"));
    const playerId = parseId(c.req.param("playerId"));
    if (!team || playerId === null) {
      return c.json({ error: "not found" }, 404);
    }
    if (!(await deletePlayer(team.id, playerId))) {
      return c.json({ error: "player not found" }, 404);
    }
    return c.body(null, 204);
  })

  // ---- Games ----

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

  .post(
    "/api/teams/:slug/games",
    zValidator("json", gameInputSchema),
    async (c) => {
      const team = await getTeamBySlug(c.req.param("slug"));
      if (!team) {
        return c.json({ error: "team not found" }, 404);
      }
      return c.json(await createGame(team.id, c.req.valid("json")), 201);
    },
  )

  .put(
    "/api/teams/:slug/games/:gameId",
    zValidator("json", gameInputSchema),
    async (c) => {
      const team = await getTeamBySlug(c.req.param("slug"));
      const gameId = parseId(c.req.param("gameId"));
      if (!team || gameId === null) {
        return c.json({ error: "not found" }, 404);
      }
      const game = await updateGame(team.id, gameId, c.req.valid("json"));
      if (!game) {
        return c.json({ error: "game not found" }, 404);
      }
      return c.json(game);
    },
  )

  .delete("/api/teams/:slug/games/:gameId", async (c) => {
    const team = await getTeamBySlug(c.req.param("slug"));
    const gameId = parseId(c.req.param("gameId"));
    if (!team || gameId === null) {
      return c.json({ error: "not found" }, 404);
    }
    if (!(await deleteGame(team.id, gameId))) {
      return c.json({ error: "game not found" }, 404);
    }
    return c.body(null, 204);
  })

  // ---- Attendance ----

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
