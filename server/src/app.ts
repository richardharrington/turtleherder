import { zValidator } from "@hono/zod-validator";
import {
  attendanceInputSchema,
  DEPARTED_JOIN_REDIRECT,
  gameInputSchema,
  INVALID_JOIN_REDIRECT,
  playerInputSchema,
} from "@turtleherder/shared";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import {
  type AuthEnv,
  clearSessionCookie,
  requireCaptain,
  requireSession,
  SESSION_COOKIE,
  setSessionCookie,
} from "./auth.js";
import {
  exchangeJoinToken,
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
  addBackPlayer,
  createPlayer,
  getFormerPlayers,
  getPlayersForTeam,
  purgePlayer,
  removePlayer,
  updatePlayer,
} from "./data/players.js";
import {
  createSession,
  deleteSession,
  getSessionTeams,
  pruneExpiredSessions,
} from "./data/sessions.js";
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
    const found = await exchangeJoinToken(c.req.param("token"));
    if (!found) {
      // Same redirect for unknown and revoked tokens; leaks nothing.
      return c.redirect(INVALID_JOIN_REDIRECT);
    }
    if (found.status === "departed") {
      // A valid token whose player has no open stint: a distinct response,
      // deliberately (see the Roster history decision log) — only the
      // token's rightful holder can reach it, and the invalid-link copy
      // would send them chasing a fresh link that can't help.
      return c.redirect(
        `${DEPARTED_JOIN_REDIRECT}&team=${encodeURIComponent(found.teamName)}`,
      );
    }
    const existingSessionId = getCookie(c, SESSION_COOKIE);
    const sessionId = await createSession(found.playerId, existingSessionId);
    // An existing live keyring keeps the same cookie; absent/dead sessions get
    // a fresh one with this player as their first key.
    if (sessionId !== existingSessionId) {
      setSessionCookie(c, sessionId);
    }
    return c.redirect(`/${found.teamSlug}`);
  })

  // ---- Current keyring (not team-scoped) ----

  .get("/api/session/teams", async (c) =>
    c.json(await getSessionTeams(getCookie(c, SESSION_COOKIE))),
  )

  .post("/api/session/sign-out", async (c) => {
    await deleteSession(getCookie(c, SESSION_COOKIE));
    clearSessionCookie(c);
    return c.body(null, 204);
  })

  // ---- The wall ----
  // Both patterns are needed: `/:slug/*` alone doesn't match the bare
  // `/api/teams/:slug`. requireSession no-ops when both match.

  .use("/api/teams/:slug", requireSession)
  .use("/api/teams/:slug/*", requireSession)
  .use("/api/teams/:slug/access", requireCaptain)
  .use("/api/teams/:slug/players/:playerId/regenerate-token", requireCaptain)
  .use("/api/teams/:slug/players/:playerId/revoke-token", requireCaptain)
  // The Former players section is access control in effect: "Add back"
  // re-arms a join link already sitting in the departed person's texts, and
  // purge destroys a row — so the whole surface is captains-only.
  .use("/api/teams/:slug/players/former", requireCaptain)
  .use("/api/teams/:slug/players/:playerId/add-back", requireCaptain)
  .use("/api/teams/:slug/players/:playerId/purge", requireCaptain)

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

  .get("/api/teams/:slug/players/former", async (c) =>
    c.json(await getFormerPlayers(c.get("auth").teamId)),
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

  // Removal is a soft close of the membership stint, not a delete; the
  // hard delete is the captains-only purge below.
  .delete("/api/teams/:slug/players/:playerId", async (c) => {
    const playerId = parseId(c.req.param("playerId"));
    const result =
      playerId === null
        ? "not_found"
        : await removePlayer(c.get("auth").teamId, playerId);
    if (result === "not_found") {
      return c.json({ error: "player not found" }, 404);
    }
    if (result === "last_captain") {
      return c.json({ error: "last captain" }, 409);
    }
    return c.body(null, 204);
  })

  .post("/api/teams/:slug/players/:playerId/add-back", async (c) => {
    const playerId = parseId(c.req.param("playerId"));
    const result =
      playerId === null
        ? { outcome: "not_found" as const }
        : await addBackPlayer(c.get("auth").teamId, playerId);
    if (result.outcome === "not_found") {
      return c.json({ error: "player not found" }, 404);
    }
    if (result.outcome === "already_active") {
      return c.json({ error: "player is active" }, 409);
    }
    return c.json(result.player);
  })

  .post("/api/teams/:slug/players/:playerId/purge", async (c) => {
    const playerId = parseId(c.req.param("playerId"));
    const result =
      playerId === null
        ? "not_found"
        : await purgePlayer(c.get("auth").teamId, playerId);
    if (result === "not_found") {
      return c.json({ error: "player not found" }, 404);
    }
    if (result === "has_history") {
      return c.json({ error: "player has history" }, 409);
    }
    if (result === "last_captain") {
      return c.json({ error: "last captain" }, 409);
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
      const result = await setAttendance(
        c.get("auth").teamId,
        gameId,
        playerId,
        status,
      );
      if (result === "not_found") {
        return c.json({ error: "game or player not found" }, 404);
      }
      if (result === "locked") {
        return c.json({ error: "attendance locked" }, 409);
      }
      return c.json({ status });
    },
  );
