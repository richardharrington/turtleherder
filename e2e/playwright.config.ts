import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://turtleherder:turtleherder@localhost:5432/turtleherder_test";

// Written by global-setup: a session cookie for fixture player Alice, so
// tests browse inside the auth wall.
export const STORAGE_STATE = fileURLToPath(
  new URL("./.auth/state.json", import.meta.url),
);

// Dedicated ports so e2e runs don't collide with dev servers on 3000/5173.
const API_PORT = 3100;
const CLIENT_PORT = 5199;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  // The tests share one seeded database, so they must not interleave.
  workers: 1,
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    storageState: STORAGE_STATE,
  },
  webServer: [
    {
      command: "pnpm --filter @turtleherder/server exec tsx src/index.ts",
      cwd: "..",
      port: API_PORT,
      env: {
        DATABASE_URL: TEST_DATABASE_URL,
        PORT: String(API_PORT),
      },
      reuseExistingServer: false,
    },
    {
      command: `pnpm --filter @turtleherder/client exec vite --port ${CLIENT_PORT} --strictPort`,
      cwd: "..",
      port: CLIENT_PORT,
      env: {
        API_PROXY_TARGET: `http://localhost:${API_PORT}`,
      },
      reuseExistingServer: false,
    },
  ],
});
