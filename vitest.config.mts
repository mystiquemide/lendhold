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
  test: { include: ["tests/**/*.test.ts"], exclude: ["tests/live/**"], environment: "node" },
});
