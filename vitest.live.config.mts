import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": `${root}tests/stubs/server-only.ts`,
    },
  },
  test: {
    include: ["tests/live/**/*.live.test.ts"],
    environment: "node",
    setupFiles: ["tests/live/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
