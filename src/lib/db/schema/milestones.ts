import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { season } from "./identity";

/** DB schema spec §10.1 — per-user, per-season cumulative counters + tier-hit arrays. */
export const teamMilestoneState = pgTable(
  "team_milestone_state",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    hits: bigint("hits", { mode: "bigint" }).notNull().default(0n),
    homeRuns: bigint("home_runs", { mode: "bigint" }).notNull().default(0n),
    stolenBases: bigint("stolen_bases", { mode: "bigint" }).notNull().default(0n),
    pitchingWins: bigint("pitching_wins", { mode: "bigint" }).notNull().default(0n),
    hitsTiersHit: integer("hits_tiers_hit").array().notNull().default(sql`'{}'::int[]`),
    homeRunsTiersHit: integer("home_runs_tiers_hit").array().notNull().default(sql`'{}'::int[]`),
    stolenBasesTiersHit: integer("stolen_bases_tiers_hit")
      .array()
      .notNull()
      .default(sql`'{}'::int[]`),
    pitchingWinsTiersHit: integer("pitching_wins_tiers_hit")
      .array()
      .notNull()
      .default(sql`'{}'::int[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("team_milestone_state_user_season_uidx").on(t.userId, t.seasonId),
    index("team_milestone_state_user_season_idx").on(t.userId, t.seasonId),
  ],
);

/** DB schema spec §10.2 — audit of tier crossings + rewards paid. */
export const teamMilestoneAward = pgTable(
  "team_milestone_award",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    milestoneKey: text("milestone_key").notNull(),
    tier: integer("tier").notNull(),
    coinReward: bigint("coin_reward", { mode: "bigint" }).notNull().default(0n),
    xpReward: bigint("xp_reward", { mode: "bigint" }).notNull().default(0n),
    tokenRewards: uuid("token_rewards").array().notNull().default(sql`'{}'::uuid[]`),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().default(sql`now()`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("team_milestone_award_unique_uidx").on(
      t.userId,
      t.seasonId,
      t.milestoneKey,
      t.tier,
    ),
  ],
);
