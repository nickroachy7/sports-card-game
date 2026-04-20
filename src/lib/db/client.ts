import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getServerEnv } from "@/lib/env";

type DrizzleDb = ReturnType<typeof drizzle>;

let pool: Pool | null = null;
let drizzleInstance: DrizzleDb | null = null;

/**
 * Returns a singleton Drizzle client connected via node-postgres pool.
 * Server-only. Never import from a client component.
 *
 * Connects with the DATABASE_URL from the validated server env. Uses the
 * service-role pathway implicitly through DATABASE_URL; RLS still applies
 * when queries run under a user JWT via the Supabase client. This Drizzle
 * path is for server code that runs as postgres (migrations, admin tools,
 * and Server Actions that explicitly bypass RLS after their own auth check).
 */
export function getDb(): DrizzleDb {
  if (drizzleInstance) return drizzleInstance;

  const { DATABASE_URL, NODE_ENV } = getServerEnv();

  pool = new Pool({
    connectionString: DATABASE_URL,
    max: NODE_ENV === "production" ? 10 : 3,
  });

  drizzleInstance = drizzle(pool, { casing: "snake_case" });
  return drizzleInstance;
}

/** Close the pool. For tests / graceful shutdown. */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    drizzleInstance = null;
  }
}
