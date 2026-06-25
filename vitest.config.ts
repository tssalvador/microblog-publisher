import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Redirect the external "obsidian" module to a local mock for tests.
      obsidian: resolve(__dirname, "tests/obsidian-mock.ts")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node"
  }
});
