import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // e2e runs point this at the test-database API instance
      "/api": process.env.API_PROXY_TARGET ?? "http://localhost:3000",
      // The join-link cookie exchange is a browser navigation handled by
      // the API server, not a client route.
      "/join": process.env.API_PROXY_TARGET ?? "http://localhost:3000",
    },
  },
});
