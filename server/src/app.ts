import { zValidator } from "@hono/zod-validator";
import {
  attendanceInputSchema,
  gameInputSchema,
  INVALID_JOIN_REDIRECT,
  playerInputSchema,
} from "@turtleherder/shared";
import { Hono } from "hono";
import {
  type AuthEnv,
  requireCaptain,
  requireSession,
  setSessionCookie,
} from "./auth.js";
import {
  findPlayerByJoinToken,
  getAccessList,
  regenerateToken,
  revokeToken,
} from "./data/access.js";
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
import { getTeamById } from "./data/teams.js";

function parseId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

// `www` is a Railway custom domain of its own, so without this it would serve
// the app as a second, co-equal origin. Session cookies are host-scoped and PWA
// installs are welded to the origin they were installed from, so a visitor who
// typed `www` would get a silently separate app with a separate sign-in —
// working fine right up until it doesn't. APP_ORIGIN is canonical (it's also
// what join links are built from), so www of *that* host is the one thing we
// bounce. Unset APP_ORIGIN (dev, tests) disables this entirely.
const canonicalOrigin = process.env.APP_ORIGIN?.replace(/\/+$/, "");
// Deliberately not "any host that isn't canonical": Railway's healthchecks
// arrive with a Host header of their own, and 301ing those fails the deploy.
const wwwHost = canonicalOrigin ? `www.${new URL(canonicalOrigin).host}` : null;

export const app = new Hono<AuthEnv>()
  .use("*", async (c, next) => {
    // node-server builds c.req.url from the request's Host header, so this is
    // the real hostname in production and settable from tests, which the
    // `host` header itself is not (fetch forbids setting it).
    const { host, pathname, search } = new URL(c.req.url);
    if (host === wwwHost) {
      return c.redirect(`${canonicalOrigin}${pathname}${search}`, 301);
    }
    await next();
  })

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

  // ---- The wall ----
  // Both patterns are needed: `/:slug/*` alone doesn't match the bare
  // `/api/teams/:slug`. requireSession no-ops when both match.

  .use("/api/teams/:slug", requireSession)
  .use("/api/teams/:slug/*", requireSession)
  .use("/api/teams/:slug/access", requireCaptain)
  .use("/api/teams/:slug/players/:playerId/regenerate-token", requireCaptain)
  .use("/api/teams/:slug/players/:playerId/revoke-token", requireCaptain)

  // ---- Teams ----

  .get("/api/teams/:slug", async (c) =>
    c.json(await getTeamById(c.get("auth").teamId)),
  )

  .get("/api/teams/:slug/me", (c) => {
    const { playerId, playerName, isCaptain } = c.get("auth");
    return c.json({ playerId, name: playerName, isCaptain });
  })

  // ---- Access management (captains only) ----

  .get("/api/teams/:slug/access", async (c) =>
    c.json(await getAccessList(c.get("auth").teamId)),
  )

  .post("/api/teams/:slug/players/:playerId/regenerate-token", async (c) => {
    const playerId = parseId(c.req.param("playerId"));
    const access =
      playerId === null
        ? null
        : await regenerateToken(c.get("auth").teamId, playerId);
    if (!access) {
      return c.json({ error: "player not found" }, 404);
    }
    return c.json(access);
  })

  .post("/api/teams/:slug/players/:playerId/revoke-token", async (c) => {
    const playerId = parseId(c.req.param("playerId"));
    const access =
      playerId === null
        ? null
        : await revokeToken(c.get("auth").teamId, playerId);
    if (!access) {
      return c.json({ error: "player not found" }, 404);
    }
    return c.json(access);
  })

  // ---- Players ----

  .get("/api/teams/:slug/players", async (c) =>
    c.json(await getPlayersForTeam(c.get("auth").teamId)),
  )

  .post(
    "/api/teams/:slug/players",
    zValidator("json", playerInputSchema),
    async (c) =>
      c.json(await createPlayer(c.get("auth").teamId, c.req.valid("json")), 201),
  )

  .put(
    "/api/teams/:slug/players/:playerId",
    zValidator("json", playerInputSchema),
    async (c) => {
      const playerId = parseId(c.req.param("playerId"));
      if (playerId === null) {
        return c.json({ error: "not found" }, 404);
      }
      const player = await updatePlayer(
        c.get("auth").teamId,
        playerId,
        c.req.valid("json"),
      );
      if (!player) {
        return c.json({ error: "player not found" }, 404);
      }
      return c.json(player);
    },
  )

  .delete("/api/teams/:slug/players/:playerId", async (c) => {
    const playerId = parseId(c.req.param("playerId"));
    if (playerId === null || !(await deletePlayer(c.get("auth").teamId, playerId))) {
      return c.json({ error: "player not found" }, 404);
    }
    return c.body(null, 204);
  })

  // ---- Games ----

  .get("/api/teams/:slug/games", async (c) =>
    c.json(await getGamesWithAttendance(c.get("auth").teamId)),
  )

  .get("/api/teams/:slug/games/:gameId", async (c) => {
    const gameId = parseId(c.req.param("gameId"));
    const game =
      gameId === null
        ? null
        : await getGameWithAttendance(c.get("auth").teamId, gameId);
    if (!game) {
      return c.json({ error: "game not found" }, 404);
    }
    return c.json(game);
  })

  .post(
    "/api/teams/:slug/games",
    zValidator("json", gameInputSchema),
    async (c) =>
      c.json(await createGame(c.get("auth").teamId, c.req.valid("json")), 201),
  )

  .put(
    "/api/teams/:slug/games/:gameId",
    zValidator("json", gameInputSchema),
    async (c) => {
      const gameId = parseId(c.req.param("gameId"));
      const game =
        gameId === null
          ? null
          : await updateGame(c.get("auth").teamId, gameId, c.req.valid("json"));
      if (!game) {
        return c.json({ error: "game not found" }, 404);
      }
      return c.json(game);
    },
  )

  .delete("/api/teams/:slug/games/:gameId", async (c) => {
    const gameId = parseId(c.req.param("gameId"));
    if (gameId === null || !(await deleteGame(c.get("auth").teamId, gameId))) {
      return c.json({ error: "game not found" }, 404);
    }
    return c.body(null, 204);
  })

  // ---- Attendance ----

  .put(
    "/api/teams/:slug/games/:gameId/attendance/:playerId",
    zValidator("json", attendanceInputSchema),
    async (c) => {
      const gameId = parseId(c.req.param("gameId"));
      const playerId = parseId(c.req.param("playerId"));
      if (gameId === null || playerId === null) {
        return c.json({ error: "not found" }, 404);
      }
      const { status } = c.req.valid("json");
      const ok = await setAttendance(
        c.get("auth").teamId,
        gameId,
        playerId,
        status,
      );
      if (!ok) {
        return c.json({ error: "game or player not found" }, 404);
      }
      return c.json({ status });
    },
  );
