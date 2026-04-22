import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "happy-dom",
    globals: false,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
    ],
    testTimeout: 30_000,
    exclude: ["node_modules", ".next", "prototype", "reference", "tests/e2e"],
    // Integration tests reach the local Supabase stack directly. The
    // Drizzle client in src/lib/db/client.ts goes through getServerEnv();
    // skip validation in tests so we don't need the full prod env — just
    // the DATABASE_URL defaulted to the local 64322 port (override via
    // shell if you want a different target).
    env: {
      SKIP_ENV_VALIDATION: "1",
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:64322/postgres",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["node_modules", ".next", "prototype", "reference"],
    },
  },
});
