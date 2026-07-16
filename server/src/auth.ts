import type { Context } from "hono";
import { setCookie } from "hono/cookie";

export const SESSION_COOKIE = "th_session";

const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

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
