import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { MiddlewareHandler } from "hono";
import { app } from "./app.js";

// In production (Railway: one service, one Postgres) this server also
// serves the built client. In dev the Vite server does that instead,
// and this block is skipped unless a build exists.
const clientDist = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : fileURLToPath(new URL("../../client/dist", import.meta.url));

if (existsSync(clientDist)) {
  const root = path.relative(process.cwd(), clientDist);
  const assets = serveStatic({ root });
  // SPA fallback: any non-API, non-file GET gets index.html so deep
  // links like /bobcats/games/3 work.
  const fallback = serveStatic({ root, rewriteRequestPath: () => "/index.html" });
  const skipApi =
    (mw: MiddlewareHandler): MiddlewareHandler =>
    (c, next) =>
      c.req.path.startsWith("/api") ? next() : mw(c, next);
  app.get("*", skipApi(assets));
  app.get("*", skipApi(fallback));
  console.log(`serving client from ${clientDist}`);
}

const port = Number(process.env.PORT ?? 3000);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`turtleherder api listening on http://localhost:${info.port}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${port} is already in use — is another dev server already running?\n` +
        `Set PORT=<other-port> to use a different one.\n`,
    );
    process.exit(1);
  }
  throw err;
});
