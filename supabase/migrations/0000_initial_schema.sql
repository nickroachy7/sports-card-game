CREATE TYPE "public"."auto_sub_mode" AS ENUM('smart_auto', 'manual_priority');--> statement-breakpoint
CREATE TYPE "public"."card_tier" AS ENUM('bronze', 'silver', 'gold', 'diamond');--> statement-breakpoint
CREATE TYPE "public"."coin_reason" AS ENUM('contest_entry', 'contest_payout', 'quick_sell', 'pack_purchase', 'contract_extension', 'login_streak', 'milestone_reward', 'manual_grant', 'onboarding_bundle', 'daily_pack_claim');--> statement-breakpoint
CREATE TYPE "public"."contest_entry_status" AS ENUM('building', 'submitted', 'locked', 'live', 'final');--> statement-breakpoint
CREATE TYPE "public"."contest_status" AS ENUM('pending', 'locked', 'live', 'final', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."contest_type" AS ENUM('daily_slate', 'single_game_showdown', 'weekend', 'live');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('scheduled', 'live', 'final', 'postponed', 'suspended', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."pack_type" AS ENUM('daily', 'standard', 'premium');--> statement-breakpoint
CREATE TYPE "public"."player_status" AS ENUM('active', 'il', 'dfa', 'retired');--> statement-breakpoint
CREATE TYPE "public"."player_value_tier" AS ENUM('star', 'starter', 'role', 'prospect');--> statement-breakpoint
CREATE TYPE "public"."season_status" AS ENUM('pending', 'active', 'offseason', 'closed');--> statement-breakpoint
CREATE TYPE "public"."team_division" AS ENUM('East', 'Central', 'West');--> statement-breakpoint
CREATE TYPE "public"."team_league" AS ENUM('American', 'National');--> statement-breakpoint
CREATE TYPE "public"."token_type" AS ENUM('hr_bonus', 'multi_hit_bonus', 'sb_bonus', 'strikeout_bonus', 'quality_start_bonus');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('received', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acquired_pack_opening_id" uuid,
	"career_fp_total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"current_tier" "card_tier" DEFAULT 'bronze' NOT NULL,
	"contract_plays_remaining" integer DEFAULT 15 NOT NULL,
	"extension_count" integer DEFAULT 0 NOT NULL,
	"is_expired" boolean DEFAULT false NOT NULL,
	"applied_token_id" uuid,
	"is_vaulted" boolean DEFAULT false NOT NULL,
	"vaulted_at" timestamp with time zone,
	"tokens_applied_count" integer DEFAULT 0 NOT NULL,
	"tokens_triggered_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_extension" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"plays_added" integer NOT NULL,
	"coin_cost" bigint NOT NULL,
	"extension_number" integer NOT NULL,
	"tier_at_extension" "card_tier" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"final_tier" "card_tier" NOT NULL,
	"final_fp" numeric(10, 2) NOT NULL,
	"tokens_applied_count" integer NOT NULL,
	"tokens_triggered_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"collection_cap" numeric(10, 0) DEFAULT '100' NOT NULL,
	"contract_default_plays" numeric(10, 0) DEFAULT '15' NOT NULL,
	"vault_cap_per_season" numeric(10, 0) DEFAULT '10' NOT NULL,
	"tier_fp_thresholds" jsonb NOT NULL,
	"quick_sell_values" jsonb NOT NULL,
	"extension_cost_per_play" jsonb NOT NULL,
	"extension_escalator" numeric(4, 2) DEFAULT '1.50' NOT NULL,
	"pack_prices_coins" jsonb NOT NULL,
	"pack_sizes" jsonb NOT NULL,
	"pack_value_weights" jsonb NOT NULL,
	"token_bonus_fp" jsonb NOT NULL,
	"token_drop_rates" jsonb NOT NULL,
	"login_streak_rewards" jsonb NOT NULL,
	"milestone_tiers" jsonb NOT NULL,
	"milestone_rewards" jsonb NOT NULL,
	"manager_xp_sources" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"type" "contest_type" NOT NULL,
	"name" text NOT NULL,
	"lineup_locks_at" timestamp with time zone NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"entry_fee_coins" bigint DEFAULT 0 NOT NULL,
	"max_entries" integer,
	"status" "contest_status" DEFAULT 'pending' NOT NULL,
	"prize_pool_payout" jsonb,
	"included_game_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contest_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"contest_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"status" "contest_entry_status" DEFAULT 'building' NOT NULL,
	"auto_sub_mode" "auto_sub_mode" DEFAULT 'smart_auto' NOT NULL,
	"entry_coin_cost" bigint DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"final_score" numeric(10, 2) DEFAULT '0' NOT NULL,
	"live_score" numeric(10, 2) DEFAULT '0' NOT NULL,
	"final_rank" integer,
	"coin_payout" bigint DEFAULT 0 NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contest_lineup_slot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contest_entry_id" uuid NOT NULL,
	"position" text NOT NULL,
	"starter_card_id" uuid,
	"final_card_id" uuid,
	"backup_1_card_id" uuid,
	"backup_2_card_id" uuid,
	"token_application_id" uuid,
	"contract_play_consumed" boolean DEFAULT false NOT NULL,
	"live_fp" numeric(10, 2) DEFAULT '0' NOT NULL,
	"final_fp" numeric(10, 2) DEFAULT '0' NOT NULL,
	"sub_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"reason" "coin_reason" NOT NULL,
	"reference_id" uuid,
	"reference_table" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pack_opening" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"pack_type" "pack_type" NOT NULL,
	"coin_cost" bigint NOT NULL,
	"cards_granted" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"duplicate_player_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"coins_from_dupes" bigint DEFAULT 0 NOT NULL,
	"tokens_granted" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"rng_seed" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manager_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"manager_level" integer DEFAULT 1 NOT NULL,
	"manager_xp" bigint DEFAULT 0 NOT NULL,
	"lifetime_fp" bigint DEFAULT 0 NOT NULL,
	"lifetime_contests_won" integer DEFAULT 0 NOT NULL,
	"lifetime_diamond_cards_vaulted" integer DEFAULT 0 NOT NULL,
	"lifetime_tokens_triggered" integer DEFAULT 0 NOT NULL,
	"seasons_played" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"team_name" text NOT NULL,
	"team_color_primary" text NOT NULL,
	"team_color_secondary" text NOT NULL,
	"team_logo_id" text NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"opening_day" date NOT NULL,
	"world_series_end" date,
	"status" "season_status" DEFAULT 'pending' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_season_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"coins" bigint DEFAULT 0 NOT NULL,
	"daily_pack_claimed_at" timestamp with time zone,
	"login_streak_days" integer DEFAULT 0 NOT NULL,
	"login_streak_last_day" date,
	"season_fp" bigint DEFAULT 0 NOT NULL,
	"season_contests_won" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_milestone_award" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"milestone_key" text NOT NULL,
	"tier" integer NOT NULL,
	"coin_reward" bigint DEFAULT 0 NOT NULL,
	"xp_reward" bigint DEFAULT 0 NOT NULL,
	"token_rewards" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_milestone_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"hits" bigint DEFAULT 0 NOT NULL,
	"home_runs" bigint DEFAULT 0 NOT NULL,
	"stolen_bases" bigint DEFAULT 0 NOT NULL,
	"pitching_wins" bigint DEFAULT 0 NOT NULL,
	"hits_tiers_hit" integer[] DEFAULT '{}'::int[] NOT NULL,
	"home_runs_tiers_hit" integer[] DEFAULT '{}'::int[] NOT NULL,
	"stolen_bases_tiers_hit" integer[] DEFAULT '{}'::int[] NOT NULL,
	"pitching_wins_tiers_hit" integer[] DEFAULT '{}'::int[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bdl_game_id" integer NOT NULL,
	"season_id" uuid NOT NULL,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid NOT NULL,
	"date" date NOT NULL,
	"scheduled_start" timestamp with time zone,
	"status" "game_status" DEFAULT 'scheduled' NOT NULL,
	"is_postseason" boolean DEFAULT false NOT NULL,
	"venue" text,
	"home_runs" integer,
	"away_runs" integer,
	"home_hits" integer,
	"away_hits" integer,
	"home_errors" integer,
	"away_errors" integer,
	"home_inning_scores" integer[],
	"away_inning_scores" integer[],
	"attendance" integer,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"source" text DEFAULT 'webhook' NOT NULL,
	"inning" integer,
	"inning_half" text,
	"batter_player_id" uuid,
	"pitcher_player_id" uuid,
	"play_type" text,
	"play_text" text,
	"score_value" integer,
	"home_score_after" integer,
	"away_score_after" integer,
	"raw_payload" jsonb,
	"event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bdl_player_id" integer NOT NULL,
	"mlbam_id" integer,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"full_name" text NOT NULL,
	"jersey" text,
	"positions" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_pitcher" boolean DEFAULT false NOT NULL,
	"is_two_way" boolean DEFAULT false NOT NULL,
	"bats_throws" text,
	"debut_year" integer,
	"dob" date,
	"birth_place" text,
	"height" text,
	"weight" text,
	"college" text,
	"draft" text,
	"team_id" uuid,
	"status" "player_status" DEFAULT 'active' NOT NULL,
	"designated_value_tier" "player_value_tier" DEFAULT 'role' NOT NULL,
	"photo_url" text,
	"photo_synced_at" timestamp with time zone,
	"is_active_40_man" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bdl_team_id" integer NOT NULL,
	"slug" text NOT NULL,
	"abbreviation" text NOT NULL,
	"display_name" text NOT NULL,
	"short_display_name" text NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"league" "team_league" NOT NULL,
	"division" "team_division" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"coins" bigint DEFAULT 0 NOT NULL,
	"card_player_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"tokens_granted" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_flag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"flagged_by" uuid,
	"reason" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" uuid,
	"resolved_action" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"delivery_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"status" "webhook_status" DEFAULT 'received' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"raw_payload" jsonb NOT NULL,
	"provider_event_id" text,
	"signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_failed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" text NOT NULL,
	"event_type" text,
	"error_message" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"token_type" "token_type" NOT NULL,
	"bonus_fp" numeric(10, 2) NOT NULL,
	"applied_to_card_id" uuid,
	"applied_to_contest_id" uuid,
	"consumed_at" timestamp with time zone,
	"acquired_source" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_applied_both_or_neither" CHECK (("token"."applied_to_card_id" IS NULL) = ("token"."applied_to_contest_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "token_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"contest_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"triggered" boolean,
	"bonus_fp_awarded" numeric(10, 2) DEFAULT '0' NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_extension" ADD CONSTRAINT "contract_extension_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_entry" ADD CONSTRAINT "vault_entry_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_entry" ADD CONSTRAINT "vault_entry_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_entry" ADD CONSTRAINT "vault_entry_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest" ADD CONSTRAINT "contest_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_entry" ADD CONSTRAINT "contest_entry_contest_id_contest_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_entry" ADD CONSTRAINT "contest_entry_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_lineup_slot" ADD CONSTRAINT "contest_lineup_slot_contest_entry_id_contest_entry_id_fk" FOREIGN KEY ("contest_entry_id") REFERENCES "public"."contest_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_lineup_slot" ADD CONSTRAINT "contest_lineup_slot_starter_card_id_card_id_fk" FOREIGN KEY ("starter_card_id") REFERENCES "public"."card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_lineup_slot" ADD CONSTRAINT "contest_lineup_slot_final_card_id_card_id_fk" FOREIGN KEY ("final_card_id") REFERENCES "public"."card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_lineup_slot" ADD CONSTRAINT "contest_lineup_slot_backup_1_card_id_card_id_fk" FOREIGN KEY ("backup_1_card_id") REFERENCES "public"."card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_lineup_slot" ADD CONSTRAINT "contest_lineup_slot_backup_2_card_id_card_id_fk" FOREIGN KEY ("backup_2_card_id") REFERENCES "public"."card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_lineup_slot" ADD CONSTRAINT "contest_lineup_slot_token_application_id_token_application_id_fk" FOREIGN KEY ("token_application_id") REFERENCES "public"."token_application"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_transaction" ADD CONSTRAINT "coin_transaction_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_opening" ADD CONSTRAINT "pack_opening_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_season_state" ADD CONSTRAINT "user_season_state_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_milestone_award" ADD CONSTRAINT "team_milestone_award_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_milestone_state" ADD CONSTRAINT "team_milestone_state_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_home_team_id_team_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_away_team_id_team_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_event" ADD CONSTRAINT "game_event_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_event" ADD CONSTRAINT "game_event_batter_player_id_player_id_fk" FOREIGN KEY ("batter_player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_event" ADD CONSTRAINT "game_event_pitcher_player_id_player_id_fk" FOREIGN KEY ("pitcher_player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player" ADD CONSTRAINT "player_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_flag" ADD CONSTRAINT "moderation_flag_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token" ADD CONSTRAINT "token_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token" ADD CONSTRAINT "token_applied_to_card_id_card_id_fk" FOREIGN KEY ("applied_to_card_id") REFERENCES "public"."card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_application" ADD CONSTRAINT "token_application_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_application" ADD CONSTRAINT "token_application_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_user_player_active_uidx" ON "card" USING btree ("user_id","player_id") WHERE "card"."is_vaulted" = false;--> statement-breakpoint
CREATE INDEX "card_user_id_idx" ON "card" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "card_user_is_vaulted_idx" ON "card" USING btree ("user_id","is_vaulted");--> statement-breakpoint
CREATE INDEX "card_user_is_expired_idx" ON "card" USING btree ("user_id","is_expired");--> statement-breakpoint
CREATE INDEX "card_user_current_tier_idx" ON "card" USING btree ("user_id","current_tier");--> statement-breakpoint
CREATE INDEX "card_user_contract_plays_idx" ON "card" USING btree ("user_id","contract_plays_remaining");--> statement-breakpoint
CREATE INDEX "card_player_id_idx" ON "card" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "card_season_user_idx" ON "card" USING btree ("season_id","user_id");--> statement-breakpoint
CREATE INDEX "contract_extension_card_id_idx" ON "contract_extension" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "contract_extension_user_id_idx" ON "contract_extension" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vault_entry_user_season_card_uidx" ON "vault_entry" USING btree ("user_id","season_id","card_id");--> statement-breakpoint
CREATE INDEX "vault_entry_user_season_idx" ON "vault_entry" USING btree ("user_id","season_id");--> statement-breakpoint
CREATE INDEX "vault_entry_final_tier_idx" ON "vault_entry" USING btree ("final_tier");--> statement-breakpoint
CREATE INDEX "contest_season_starts_idx" ON "contest" USING btree ("season_id","starts_at");--> statement-breakpoint
CREATE INDEX "contest_status_idx" ON "contest" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "contest_entry_user_contest_uidx" ON "contest_entry" USING btree ("user_id","contest_id");--> statement-breakpoint
CREATE INDEX "contest_entry_contest_final_rank_idx" ON "contest_entry" USING btree ("contest_id","final_rank");--> statement-breakpoint
CREATE INDEX "contest_entry_contest_live_score_idx" ON "contest_entry" USING btree ("contest_id","live_score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "contest_entry_user_created_idx" ON "contest_entry" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "contest_lineup_slot_entry_position_uidx" ON "contest_lineup_slot" USING btree ("contest_entry_id","position");--> statement-breakpoint
CREATE INDEX "contest_lineup_slot_starter_idx" ON "contest_lineup_slot" USING btree ("starter_card_id");--> statement-breakpoint
CREATE INDEX "contest_lineup_slot_final_idx" ON "contest_lineup_slot" USING btree ("final_card_id");--> statement-breakpoint
CREATE INDEX "coin_transaction_user_created_idx" ON "coin_transaction" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "coin_transaction_user_reason_idx" ON "coin_transaction" USING btree ("user_id","reason");--> statement-breakpoint
CREATE INDEX "coin_transaction_reference_idx" ON "coin_transaction" USING btree ("reference_table","reference_id");--> statement-breakpoint
CREATE INDEX "pack_opening_user_opened_idx" ON "pack_opening" USING btree ("user_id","opened_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_log_user_key_uidx" ON "idempotency_log" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "idempotency_log_created_idx" ON "idempotency_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "manager_account_user_id_uidx" ON "manager_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "manager_account_level_idx" ON "manager_account" USING btree ("manager_level" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "profile_user_id_uidx" ON "profile" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_team_name_uidx" ON "profile" USING btree ("team_name");--> statement-breakpoint
CREATE UNIQUE INDEX "season_year_uidx" ON "season" USING btree ("year");--> statement-breakpoint
CREATE INDEX "season_status_idx" ON "season" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_season_state_user_season_uidx" ON "user_season_state" USING btree ("user_id","season_id");--> statement-breakpoint
CREATE INDEX "user_season_state_leaderboard_idx" ON "user_season_state" USING btree ("season_id","season_fp" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "team_milestone_award_unique_uidx" ON "team_milestone_award" USING btree ("user_id","season_id","milestone_key","tier");--> statement-breakpoint
CREATE UNIQUE INDEX "team_milestone_state_user_season_uidx" ON "team_milestone_state" USING btree ("user_id","season_id");--> statement-breakpoint
CREATE INDEX "team_milestone_state_user_season_idx" ON "team_milestone_state" USING btree ("user_id","season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_bdl_game_id_uidx" ON "game" USING btree ("bdl_game_id");--> statement-breakpoint
CREATE INDEX "game_date_idx" ON "game" USING btree ("date");--> statement-breakpoint
CREATE INDEX "game_status_idx" ON "game" USING btree ("status");--> statement-breakpoint
CREATE INDEX "game_season_date_idx" ON "game" USING btree ("season_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "game_event_provider_event_id_uidx" ON "game_event" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "game_event_game_event_at_idx" ON "game_event" USING btree ("game_id","event_at");--> statement-breakpoint
CREATE INDEX "game_event_batter_event_at_idx" ON "game_event" USING btree ("batter_player_id","event_at");--> statement-breakpoint
CREATE INDEX "game_event_pitcher_event_at_idx" ON "game_event" USING btree ("pitcher_player_id","event_at");--> statement-breakpoint
CREATE UNIQUE INDEX "player_bdl_player_id_uidx" ON "player" USING btree ("bdl_player_id");--> statement-breakpoint
CREATE INDEX "player_team_id_idx" ON "player" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "player_status_idx" ON "player" USING btree ("status");--> statement-breakpoint
CREATE INDEX "player_is_pitcher_idx" ON "player" USING btree ("is_pitcher");--> statement-breakpoint
CREATE INDEX "player_designated_value_tier_idx" ON "player" USING btree ("designated_value_tier");--> statement-breakpoint
CREATE INDEX "player_pack_draw_idx" ON "player" USING btree ("is_active_40_man","designated_value_tier");--> statement-breakpoint
CREATE INDEX "player_full_name_idx" ON "player" USING btree ("full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "team_bdl_team_id_uidx" ON "team" USING btree ("bdl_team_id");--> statement-breakpoint
CREATE INDEX "team_abbreviation_idx" ON "team" USING btree ("abbreviation");--> statement-breakpoint
CREATE INDEX "manual_grant_user_idx" ON "manual_grant" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "manual_grant_created_idx" ON "manual_grant" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "moderation_flag_resolved_idx" ON "moderation_flag" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "webhook_delivery_event_received_idx" ON "webhook_delivery" USING btree ("event_type","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webhook_delivery_status_idx" ON "webhook_delivery" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_failed_retry_idx" ON "webhook_failed" USING btree ("resolved_at","next_retry_at");--> statement-breakpoint
CREATE INDEX "token_user_consumed_idx" ON "token" USING btree ("user_id","consumed_at");--> statement-breakpoint
CREATE INDEX "token_applied_to_card_idx" ON "token" USING btree ("applied_to_card_id");--> statement-breakpoint
CREATE INDEX "token_contest_consumed_idx" ON "token" USING btree ("applied_to_contest_id","consumed_at");--> statement-breakpoint
CREATE INDEX "token_season_user_idx" ON "token" USING btree ("season_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "token_application_token_id_uidx" ON "token_application" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "token_application_card_id_idx" ON "token_application" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "token_application_contest_id_idx" ON "token_application" USING btree ("contest_id");--> statement-breakpoint
CREATE INDEX "token_application_user_id_idx" ON "token_application" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "token_application_card_triggered_idx" ON "token_application" USING btree ("card_id","triggered");