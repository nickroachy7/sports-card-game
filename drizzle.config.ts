import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required for drizzle-kit. " +
      "Set it in .env.local or via `supabase status --output env`.",
  );
}

export default defineConfig({
  schema: "./src/lib/db/schema",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  casing: "snake_case",
  strict: true,
  verbose: true,
});
