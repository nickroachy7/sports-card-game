import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { webhookStatus } from "./enums";
import { profile } from "./identity";

/** DB schema spec §11.1 — dedup + audit for every webhook received. */
export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    deliveryId: text("delivery_id").primaryKey(),
    eventType: text("event_type").notNull(),
    status: webhookStatus("status").notNull().default("received"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().default(sql`now()`),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    rawPayload: jsonb("raw_payload").notNull(),
    providerEventId: text("provider_event_id"),
    signature: text("signature"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index("webhook_delivery_event_received_idx").on(t.eventType, t.receivedAt.desc()),
    index("webhook_delivery_status_idx").on(t.status),
  ],
);

/** DB schema spec §11.2 — failed webhooks parked for retry. */
export const webhookFailed = pgTable(
  "webhook_failed",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    deliveryId: text("delivery_id").notNull(),
    eventType: text("event_type"),
    errorMessage: text("error_message").notNull(),
    rawPayload: jsonb("raw_payload").notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }).notNull().default(sql`now()`),
    failedAt: timestamp("failed_at", { withTimezone: true }).notNull().default(sql`now()`),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index("webhook_failed_retry_idx").on(t.resolvedAt, t.nextRetryAt)],
);

/** DB schema spec §11.3 — audit log of admin-issued grants. */
export const manualGrant = pgTable(
  "manual_grant",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    grantedBy: uuid("granted_by").notNull(),
    reason: text("reason").notNull(),
    coins: bigint("coins", { mode: "bigint" }).notNull().default(sql`0`),
    cardPlayerIds: uuid("card_player_ids").array().notNull().default(sql`'{}'::uuid[]`),
    tokensGranted: uuid("tokens_granted").array().notNull().default(sql`'{}'::uuid[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index("manual_grant_user_idx").on(t.userId),
    index("manual_grant_created_idx").on(t.createdAt.desc()),
  ],
);

/** DB schema spec §11.4 — team-name moderation flags. */
export const moderationFlag = pgTable(
  "moderation_flag",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id),
    flaggedBy: uuid("flagged_by"),
    reason: text("reason").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    resolvedBy: uuid("resolved_by"),
    resolvedAction: text("resolved_action"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("moderation_flag_resolved_idx").on(t.resolved)],
);
