import { defineConfig } from "vitest/config";

// Unit suites only. Playwright owns tests/e2e; .tmp holds scratch copies of the repo that must not run.
export default defineConfig({
  test: { include: ["tests/unit/**/*.test.ts"], exclude: ["node_modules/**", ".tmp/**", "tests/e2e/**", "dist/**"] },
});
