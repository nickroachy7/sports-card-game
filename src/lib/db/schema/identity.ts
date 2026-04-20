import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { seasonStatus } from "./enums";

/** DB schema spec §4.1 — MLB season metadata. */
export const season = pgTable(
  "season",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    year: integer("year").notNull(),
    openingDay: date("opening_day").notNull(),
    worldSeriesEnd: date("world_series_end"),
    status: seasonStatus("status").notNull().default("pending"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [uniqueIndex("season_year_uidx").on(t.year), index("season_status_idx").on(t.status)],
);

/** DB schema spec §4.2 — public-facing team identity (1:1 with auth.users). */
export const profile = pgTable(
  "profile",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // FK to auth.users added in a post-migration (Drizzle can't reference auth schema).
    userId: uuid("user_id").notNull(),
    teamName: text("team_name").notNull(),
    teamColorPrimary: text("team_color_primary").notNull(),
    teamColorSecondary: text("team_color_secondary").notNull(),
    teamLogoId: text("team_logo_id").notNull(),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("profile_user_id_uidx").on(t.userId),
    uniqueIndex("profile_team_name_uidx").on(t.teamName),
  ],
);

/** DB schema spec §4.3 — lifetime / cross-season stats per user. */
export const managerAccount = pgTable(
  "manager_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    managerLevel: integer("manager_level").notNull().default(1),
    managerXp: bigint("manager_xp", { mode: "bigint" }).notNull().default(0n),
    lifetimeFp: bigint("lifetime_fp", { mode: "bigint" }).notNull().default(0n),
    lifetimeContestsWon: integer("lifetime_contests_won").notNull().default(0),
    lifetimeDiamondCardsVaulted: integer("lifetime_diamond_cards_vaulted").notNull().default(0),
    lifetimeTokensTriggered: integer("lifetime_tokens_triggered").notNull().default(0),
    seasonsPlayed: integer("seasons_played").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("manager_account_user_id_uidx").on(t.userId),
    index("manager_account_level_idx").on(t.managerLevel.desc()),
  ],
);

/** DB schema spec §4.4 — per-user, per-season mutable state. */
export const userSeasonState = pgTable(
  "user_season_state",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    coins: bigint("coins", { mode: "bigint" }).notNull().default(0n),
    dailyPackClaimedAt: timestamp("daily_pack_claimed_at", { withTimezone: true }),
    loginStreakDays: integer("login_streak_days").notNull().default(0),
    loginStreakLastDay: date("login_streak_last_day"),
    seasonFp: bigint("season_fp", { mode: "bigint" }).notNull().default(0n),
    seasonContestsWon: integer("season_contests_won").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("user_season_state_user_season_uidx").on(t.userId, t.seasonId),
    index("user_season_state_leaderboard_idx").on(t.seasonId, t.seasonFp.desc()),
  ],
);
