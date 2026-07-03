import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    // Route bare `obsidian` imports to a lightweight mock so pure logic in src/
    // is testable without the Obsidian runtime.
    alias: {
      obsidian: resolve(__dirname, "test/obsidian.mock.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
