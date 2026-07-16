// Bundles the server for production; the client's half is Vite's `build`.
// Everything ships as one file, so Railway runs plain node with no tsx.

import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  // Root package.json is "type": "module", so dist/index.js must be ESM.
  format: "esm",
  target: "node24",
  // pg reaches for its optional native binding at import time; it isn't
  // installed, and bundling it would need node-gyp.
  external: ["pg-native"],
  // esbuild leaves __require() calls in the CommonJS deps it inlines (pg pulls
  // in "events", "crypto", …). ESM has no require for the shim to fall back
  // to, so without this the bundle dies on import pg with
  // 'Dynamic require of "events" is not supported'. No suite catches that —
  // the tests all run TypeScript source — hence CI's boot-the-bundle check.
  banner: {
    js: [
      `import { createRequire as __createRequire } from "node:module";`,
      `const require = __createRequire(import.meta.url);`,
    ].join("\n"),
  },
});
