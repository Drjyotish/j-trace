import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Each test file runs in its own process with its own in-memory Postgres (PGlite).
    pool: "forks",
    env: {
      TRACE_MODE: "demo",
      TRACE_DB: "memory",
    },
  },
});
