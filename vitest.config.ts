import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Main test suite runs from src/ (npm test -- --dir src).
    // The sandbox-test/ dir uses CommonJS + mocha-style globals;
    // we exclude it from the default run and configure it separately.
    exclude: ["node_modules", "dist", "sandbox-test"],
  },
});
