import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { card } from "./cards";
import { autoSubMode, contestEntryStatus, contestStatus, contestType } from "./enums";
import { season } from "./identity";
import { tokenApplication } from "./tokens";

/** DB schema spec §8.1 — contest container (daily slate, showdown, weekend, live). */
export const contest = pgTable(
  "contest",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    type: contestType("type").notNull(),
    name: text("name").notNull(),
    lineupLocksAt: timestamp("lineup_locks_at", { withTimezone: true }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    entryFeeCoins: bigint("entry_fee_coins", { mode: "bigint" }).notNull().default(0n),
    maxEntries: integer("max_entries"),
    status: contestStatus("status").notNull().default("pending"),
    prizePoolPayout: jsonb("prize_pool_payout"),
    includedGameIds: uuid("included_game_ids").array().notNull().default(sql`'{}'::uuid[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index("contest_season_starts_idx").on(t.seasonId, t.startsAt),
    index("contest_status_idx").on(t.status),
  ],
);

/** DB schema spec §8.2 — a user's entry into a contest. */
export const contestEntry = pgTable(
  "contest_entry",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    contestId: uuid("contest_id")
      .notNull()
      .references(() => contest.id),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    status: contestEntryStatus("status").notNull().default("building"),
    autoSubMode: autoSubMode("auto_sub_mode").notNull().default("smart_auto"),
    entryCoinCost: bigint("entry_coin_cost", { mode: "bigint" }).notNull().default(0n),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    finalScore: numeric("final_score", { precision: 10, scale: 2 }).notNull().default("0"),
    liveScore: numeric("live_score", { precision: 10, scale: 2 }).notNull().default("0"),
    finalRank: integer("final_rank"),
    coinPayout: bigint("coin_payout", { mode: "bigint" }).notNull().default(0n),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("contest_entry_user_contest_uidx").on(t.userId, t.contestId),
    index("contest_entry_contest_final_rank_idx").on(t.contestId, t.finalRank),
    index("contest_entry_contest_live_score_idx").on(t.contestId, t.liveScore.desc()),
    index("contest_entry_user_created_idx").on(t.userId, t.createdAt.desc()),
  ],
);

/** DB schema spec §8.3 — normalized lineup slot. One row per lineup position. */
export const contestLineupSlot = pgTable(
  "contest_lineup_slot",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contestEntryId: uuid("contest_entry_id")
      .notNull()
      .references(() => contestEntry.id, { onDelete: "cascade" }),
    position: text("position").notNull(),
    starterCardId: uuid("starter_card_id").references(() => card.id),
    finalCardId: uuid("final_card_id").references(() => card.id),
    backup1CardId: uuid("backup_1_card_id").references(() => card.id),
    backup2CardId: uuid("backup_2_card_id").references(() => card.id),
    tokenApplicationId: uuid("token_application_id").references(() => tokenApplication.id),
    contractPlayConsumed: boolean("contract_play_consumed").notNull().default(false),
    liveFp: numeric("live_fp", { precision: 10, scale: 2 }).notNull().default("0"),
    finalFp: numeric("final_fp", { precision: 10, scale: 2 }).notNull().default("0"),
    subReason: text("sub_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("contest_lineup_slot_entry_position_uidx").on(t.contestEntryId, t.position),
    index("contest_lineup_slot_starter_idx").on(t.starterCardId),
    index("contest_lineup_slot_final_idx").on(t.finalCardId),
  ],
);
