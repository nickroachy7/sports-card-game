import { pgEnum } from "drizzle-orm/pg-core";

export const teamLeague = pgEnum("team_league", ["American", "National"]);

export const teamDivision = pgEnum("team_division", ["East", "Central", "West"]);

export const playerStatus = pgEnum("player_status", ["active", "il", "dfa", "retired"]);

export const playerValueTier = pgEnum("player_value_tier", ["star", "starter", "role", "prospect"]);

export const cardTier = pgEnum("card_tier", ["bronze", "silver", "gold", "diamond"]);

export const gameStatus = pgEnum("game_status", [
  "scheduled",
  "live",
  "final",
  "postponed",
  "suspended",
  "canceled",
]);

export const contestType = pgEnum("contest_type", [
  "daily_slate",
  "single_game_showdown",
  "weekend",
  "live",
]);

export const contestStatus = pgEnum("contest_status", ["pending", "live", "final", "canceled"]);

export const contestEntryStatus = pgEnum("contest_entry_status", [
  "building",
  "submitted",
  "live",
  "final",
]);

export const autoSubMode = pgEnum("auto_sub_mode", ["smart_auto", "manual_priority"]);

export const packType = pgEnum("pack_type", ["daily", "standard", "premium"]);

export const tokenType = pgEnum("token_type", [
  "hr_bonus",
  "multi_hit_bonus",
  "sb_bonus",
  "strikeout_bonus",
  "quality_start_bonus",
]);

export const coinReason = pgEnum("coin_reason", [
  "contest_entry",
  "contest_payout",
  "quick_sell",
  "pack_purchase",
  "contract_extension",
  "login_streak",
  "milestone_reward",
  "manual_grant",
  "onboarding_bundle",
  "daily_pack_claim",
]);

export const webhookStatus = pgEnum("webhook_status", ["received", "processed", "failed"]);

export const seasonStatus = pgEnum("season_status", ["pending", "active", "offseason", "closed"]);
