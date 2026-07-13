import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // e2e runs point this at the test-database API instance
      "/api": process.env.API_PROXY_TARGET ?? "http://localhost:3000",
    },
  },
});
