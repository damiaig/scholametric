/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  // @scholametric/shared's build output is CommonJS (apps/api needs that —
  // ts-node/Jest, not Vite) and has no ESM entry point, so Vite can only
  // consume it as a pre-bundled CJS dependency needing interop
  // (`needsInterop: true`), with named imports rewritten to runtime
  // property lookups on the cached bundle in node_modules/.vite/deps.
  // That cache is keyed off the *lockfile*, not this source — editing
  // packages/shared and rebuilding/restarting the web container does NOT
  // reliably invalidate it, so a stale bundle (missing a newer export, or
  // briefly inconsistent across a container restart) can serve `undefined`
  // for a real, currently-existing export. Confirmed via docs/DECISIONS.md's
  // prior "Vite dep cache goes stale" entry and reproduced again in step 8's
  // follow-up (Teachers page crash reading JOB_TITLE_LABELS as undefined).
  //
  // Structural fix: alias straight to the TS source instead of the built
  // package. Vite then transforms it exactly like first-party app source —
  // real ESM, transformed fresh per request, invalidated by its own file
  // watcher like any other src file — no CJS interop, no separate
  // dependency-cache staleness class to hit ever again.
  resolve: {
    alias: {
      "@scholametric/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ["@scholametric/shared"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    // GitHub Actions' runner has a much tighter memory ceiling than local
    // dev (see docs/DECISIONS.md's api/web pnpm-workspace-concurrency
    // fix for the sibling issue) — Vitest's default file-parallelism
    // spins up enough concurrent jsdom environments across this suite's
    // ~40 files to OOM there specifically ("heap out of memory / Worker
    // exited unexpectedly"), even with api's Jest suite no longer running
    // at the same time. `CI` is set by every GitHub Actions job
    // automatically — sequential-within-Vitest only there; local dev
    // keeps its normal (fast) parallel file execution.
    fileParallelism: !process.env.CI,
  },
});
