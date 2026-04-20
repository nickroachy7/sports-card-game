import { sql } from "drizzle-orm";
import { jsonb, numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * DB schema spec §12.1 — tunable economy values.
 *
 * Single-row table updated rarely. New rows supersede older ones via
 * `effective_from`; `get_active_economy_config()` returns the active row.
 */
export const economyConfig = pgTable("economy_config", {
  id: uuid("id").defaultRandom().primaryKey(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().default(sql`now()`),
  collectionCap: numeric("collection_cap", { precision: 10, scale: 0 }).notNull().default("100"),
  contractDefaultPlays: numeric("contract_default_plays", { precision: 10, scale: 0 })
    .notNull()
    .default("15"),
  vaultCapPerSeason: numeric("vault_cap_per_season", { precision: 10, scale: 0 })
    .notNull()
    .default("10"),
  tierFpThresholds: jsonb("tier_fp_thresholds").notNull(),
  quickSellValues: jsonb("quick_sell_values").notNull(),
  extensionCostPerPlay: jsonb("extension_cost_per_play").notNull(),
  extensionEscalator: numeric("extension_escalator", { precision: 4, scale: 2 })
    .notNull()
    .default("1.50"),
  packPricesCoins: jsonb("pack_prices_coins").notNull(),
  packSizes: jsonb("pack_sizes").notNull(),
  packValueWeights: jsonb("pack_value_weights").notNull(),
  tokenBonusFp: jsonb("token_bonus_fp").notNull(),
  tokenDropRates: jsonb("token_drop_rates").notNull(),
  loginStreakRewards: jsonb("login_streak_rewards").notNull(),
  milestoneTiers: jsonb("milestone_tiers").notNull(),
  milestoneRewards: jsonb("milestone_rewards").notNull(),
  managerXpSources: jsonb("manager_xp_sources").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});
