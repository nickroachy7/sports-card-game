import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { gameStatus, playerStatus, playerValueTier, teamDivision, teamLeague } from "./enums";
import { season } from "./identity";

/** DB schema spec §5.1 — MLB team reference data. */
export const team = pgTable(
  "team",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bdlTeamId: integer("bdl_team_id").notNull(),
    slug: text("slug").notNull(),
    abbreviation: text("abbreviation").notNull(),
    displayName: text("display_name").notNull(),
    shortDisplayName: text("short_display_name").notNull(),
    name: text("name").notNull(),
    location: text("location").notNull(),
    league: teamLeague("league").notNull(),
    division: teamDivision("division").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("team_bdl_team_id_uidx").on(t.bdlTeamId),
    index("team_abbreviation_idx").on(t.abbreviation),
  ],
);

/** DB schema spec §5.2 — MLB player reference data (synced daily from BDL). */
export const player = pgTable(
  "player",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bdlPlayerId: integer("bdl_player_id").notNull(),
    mlbamId: integer("mlbam_id"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    fullName: text("full_name").notNull(),
    jersey: text("jersey"),
    positions: text("positions").array().notNull().default(sql`'{}'::text[]`),
    isPitcher: boolean("is_pitcher").notNull().default(false),
    isTwoWay: boolean("is_two_way").notNull().default(false),
    batsThrows: text("bats_throws"),
    debutYear: integer("debut_year"),
    dob: date("dob"),
    birthPlace: text("birth_place"),
    height: text("height"),
    weight: text("weight"),
    college: text("college"),
    draft: text("draft"),
    teamId: uuid("team_id").references(() => team.id),
    status: playerStatus("status").notNull().default("active"),
    designatedValueTier: playerValueTier("designated_value_tier").notNull().default("role"),
    photoUrl: text("photo_url"),
    photoSyncedAt: timestamp("photo_synced_at", { withTimezone: true }),
    isActive40Man: boolean("is_active_40_man").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("player_bdl_player_id_uidx").on(t.bdlPlayerId),
    index("player_team_id_idx").on(t.teamId),
    index("player_status_idx").on(t.status),
    index("player_is_pitcher_idx").on(t.isPitcher),
    index("player_designated_value_tier_idx").on(t.designatedValueTier),
    index("player_pack_draw_idx").on(t.isActive40Man, t.designatedValueTier),
    index("player_full_name_idx").on(t.fullName),
  ],
);

/** DB schema spec §5.3 — MLB game metadata + final box score. */
export const game = pgTable(
  "game",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bdlGameId: integer("bdl_game_id").notNull(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    homeTeamId: uuid("home_team_id")
      .notNull()
      .references(() => team.id),
    awayTeamId: uuid("away_team_id")
      .notNull()
      .references(() => team.id),
    date: date("date").notNull(),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }),
    status: gameStatus("status").notNull().default("scheduled"),
    isPostseason: boolean("is_postseason").notNull().default(false),
    venue: text("venue"),
    homeRuns: integer("home_runs"),
    awayRuns: integer("away_runs"),
    homeHits: integer("home_hits"),
    awayHits: integer("away_hits"),
    homeErrors: integer("home_errors"),
    awayErrors: integer("away_errors"),
    homeInningScores: integer("home_inning_scores").array(),
    awayInningScores: integer("away_inning_scores").array(),
    attendance: integer("attendance"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("game_bdl_game_id_uidx").on(t.bdlGameId),
    index("game_date_idx").on(t.date),
    index("game_status_idx").on(t.status),
    index("game_season_date_idx").on(t.seasonId, t.date),
  ],
);

/** DB schema spec §5.4 — event stream from BallDontLie webhooks + post-game stats pulls. */
export const gameEvent = pgTable(
  "game_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    source: text("source").notNull().default("webhook"),
    inning: integer("inning"),
    inningHalf: text("inning_half"),
    batterPlayerId: uuid("batter_player_id").references(() => player.id),
    pitcherPlayerId: uuid("pitcher_player_id").references(() => player.id),
    playType: text("play_type"),
    playText: text("play_text"),
    scoreValue: integer("score_value"),
    homeScoreAfter: integer("home_score_after"),
    awayScoreAfter: integer("away_score_after"),
    rawPayload: jsonb("raw_payload"),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull().default(sql`now()`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("game_event_provider_event_id_uidx").on(t.providerEventId),
    index("game_event_game_event_at_idx").on(t.gameId, t.eventAt),
    index("game_event_batter_event_at_idx").on(t.batterPlayerId, t.eventAt),
    index("game_event_pitcher_event_at_idx").on(t.pitcherPlayerId, t.eventAt),
  ],
);
