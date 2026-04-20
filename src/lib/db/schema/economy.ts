import { sql } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { coinReason, packType } from "./enums";
import { season } from "./identity";

/** DB schema spec §9.1 — append-only coin ledger. */
export const coinTransaction = pgTable(
  "coin_transaction",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    balanceAfter: bigint("balance_after", { mode: "bigint" }).notNull(),
    reason: coinReason("reason").notNull(),
    referenceId: uuid("reference_id"),
    referenceTable: text("reference_table"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index("coin_transaction_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("coin_transaction_user_reason_idx").on(t.userId, t.reason),
    index("coin_transaction_reference_idx").on(t.referenceTable, t.referenceId),
  ],
);

/** DB schema spec §9.2 — audit log of every pack opened. */
export const packOpening = pgTable(
  "pack_opening",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    packType: packType("pack_type").notNull(),
    coinCost: bigint("coin_cost", { mode: "bigint" }).notNull(),
    cardsGranted: uuid("cards_granted").array().notNull().default(sql`'{}'::uuid[]`),
    duplicatePlayerIds: uuid("duplicate_player_ids").array().notNull().default(sql`'{}'::uuid[]`),
    coinsFromDupes: bigint("coins_from_dupes", { mode: "bigint" }).notNull().default(sql`0`),
    tokensGranted: uuid("tokens_granted").array().notNull().default(sql`'{}'::uuid[]`),
    rngSeed: text("rng_seed"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().default(sql`now()`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index("pack_opening_user_opened_idx").on(t.userId, t.openedAt.desc())],
);
