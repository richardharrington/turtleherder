import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { getSessionAuth, touchSession } from "./data/sessions.js";

export const SESSION_COOKIE = "th_session";

const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

// Rolling renewal is throttled: the DB write and fresh cookie happen at most
// once an hour per session, not on every request.
const RENEW_THROTTLE_MS = 60 * 60 * 1000;

export interface AuthEnv {
  Variables: {
    auth: {
      playerId: number;
      playerName: string;
      isCaptain: boolean;
      teamId: number;
    };
  };
}

export function setSessionCookie(c: Context, sessionId: string): void {
  setCookie(c, SESSION_COOKIE, sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    // Dev and e2e run over plain http on localhost.
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

// Walls every /api/teams/:slug/* endpoint. The session is checked before any
// team lookup, and every failure — signed out, expired, wrong team,
// nonexistent slug — gets the identical 401, so nothing leaks.
export const requireSession: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (c.get("auth")) return next(); // already authorized by an outer match

  const sessionId = getCookie(c, SESSION_COOKIE);
  const auth = sessionId ? await getSessionAuth(sessionId) : null;
  if (!auth || auth.teamSlug !== c.req.param("slug")) {
    return c.json({ error: "unauthorized" }, 401);
  }

  if (Date.now() - auth.lastSeenAt.getTime() > RENEW_THROTTLE_MS) {
    await touchSession(auth.sessionId);
    setSessionCookie(c, auth.sessionId);
  }

  c.set("auth", {
    playerId: auth.playerId,
    playerName: auth.playerName,
    isCaptain: auth.isCaptain,
    teamId: auth.teamId,
  });
  return next();
};

// Access control itself is the one thing gated harder than the rest of the
// wall: captains only. Runs after requireSession.
export const requireCaptain: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (!c.get("auth").isCaptain) {
    return c.json({ error: "forbidden" }, 403);
  }
  return next();
};
