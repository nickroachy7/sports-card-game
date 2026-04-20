import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { cardTier } from "./enums";
import { season } from "./identity";
import { player } from "./mlb_reference";

/** DB schema spec §6.1 — one row per card instance owned by a user. */
export const card = pgTable(
  "card",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => player.id),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().default(sql`now()`),
    // FK → pack_opening(id). Added in a post-migration (circular module dep).
    acquiredPackOpeningId: uuid("acquired_pack_opening_id"),
    careerFpTotal: numeric("career_fp_total", { precision: 10, scale: 2 }).notNull().default("0"),
    currentTier: cardTier("current_tier").notNull().default("bronze"),
    contractPlaysRemaining: integer("contract_plays_remaining").notNull().default(15),
    extensionCount: integer("extension_count").notNull().default(0),
    isExpired: boolean("is_expired").notNull().default(false),
    // FK → token(id). Added in a post-migration (circular module dep).
    appliedTokenId: uuid("applied_token_id"),
    isVaulted: boolean("is_vaulted").notNull().default(false),
    vaultedAt: timestamp("vaulted_at", { withTimezone: true }),
    tokensAppliedCount: integer("tokens_applied_count").notNull().default(0),
    tokensTriggeredCount: integer("tokens_triggered_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("card_user_player_active_uidx")
      .on(t.userId, t.playerId)
      .where(sql`${t.isVaulted} = false`),
    index("card_user_id_idx").on(t.userId),
    index("card_user_is_vaulted_idx").on(t.userId, t.isVaulted),
    index("card_user_is_expired_idx").on(t.userId, t.isExpired),
    index("card_user_current_tier_idx").on(t.userId, t.currentTier),
    index("card_user_contract_plays_idx").on(t.userId, t.contractPlaysRemaining),
    index("card_player_id_idx").on(t.playerId),
    index("card_season_user_idx").on(t.seasonId, t.userId),
  ],
);

/** DB schema spec §6.2 — audit log of every contract extension. */
export const contractExtension = pgTable(
  "contract_extension",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => card.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    playsAdded: integer("plays_added").notNull(),
    coinCost: bigint("coin_cost", { mode: "bigint" }).notNull(),
    extensionNumber: integer("extension_number").notNull(),
    tierAtExtension: cardTier("tier_at_extension").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index("contract_extension_card_id_idx").on(t.cardId),
    index("contract_extension_user_id_idx").on(t.userId),
  ],
);

/** DB schema spec §6.3 — permanent, season-scoped keepsake. */
export const vaultEntry = pgTable(
  "vault_entry",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    cardId: uuid("card_id")
      .notNull()
      .references(() => card.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => player.id),
    finalTier: cardTier("final_tier").notNull(),
    finalFp: numeric("final_fp", { precision: 10, scale: 2 }).notNull(),
    tokensAppliedCount: integer("tokens_applied_count").notNull(),
    tokensTriggeredCount: integer("tokens_triggered_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("vault_entry_user_season_card_uidx").on(t.userId, t.seasonId, t.cardId),
    index("vault_entry_user_season_idx").on(t.userId, t.seasonId),
    index("vault_entry_final_tier_idx").on(t.finalTier),
  ],
);
