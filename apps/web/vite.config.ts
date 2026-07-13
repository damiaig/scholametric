/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  // @scholametric/shared is a pnpm-workspace symlink, so Vite treats it as
  // "linked source" and skips its normal dep pre-bundling/CJS-interop step.
  // Its build output is CommonJS (apps/api needs that — ts-node/Jest, not
  // Vite), so without forcing it through esbuild here the browser gets a
  // raw `module.exports` file it can't read as ESM. See docs/DECISIONS.md.
  optimizeDeps: {
    include: ["@scholametric/shared"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
