import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * API spec §2.6 — idempotency log for Server Action replay protection.
 *
 * When a client retries a mutating Server Action with the same idempotency
 * key, we return the cached response instead of re-executing. A background
 * cron expires rows older than 24h.
 */
export const idempotencyLog = pgTable(
  "idempotency_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("idempotency_log_user_key_uidx").on(t.userId, t.key),
    index("idempotency_log_created_idx").on(t.createdAt),
  ],
);
