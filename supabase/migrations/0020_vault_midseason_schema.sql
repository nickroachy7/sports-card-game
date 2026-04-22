-- ─────────────────────────────────────────────────────────────────────────
-- 0020_vault_midseason_schema.sql — mid-season vault state + destroy audit.
--
-- Polish spec §7 introduces mid-season vaulting: a user can pre-vault a
-- card anytime during the season. Pre-vaulted cards freeze immediately
-- (cosmetic-only, no lineup play, no contract burn) and count toward
-- the season's 10-card vault cap. A user can destroy a pre-vaulted
-- card for a tier-scaled refund (~15% of quick-sell value).
--
-- Schema additions:
--   1. vault_source enum ('midseason','ceremony') — tracks how a card
--      entered the vault.
--   2. card.vault_source column — nullable; NULL means "not vaulted".
--   3. coin_reason enum value 'vault_destroy'.
--   4. vault_card_destroy audit table — append-only, one row per
--      destroy event, RLS owner-only read.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TYPE "public"."vault_source" AS ENUM ('midseason', 'ceremony');
--> statement-breakpoint

ALTER TABLE "public"."card"
  ADD COLUMN "vault_source" "public"."vault_source";
--> statement-breakpoint

-- Backfill: existing is_vaulted=true rows were committed via the
-- ceremony path (only source that existed pre-migration).
UPDATE "public"."card" SET "vault_source" = 'ceremony' WHERE "is_vaulted" = true;
--> statement-breakpoint

-- Add 'vault_destroy' coin_reason. New enum values can be added in a
-- transaction in Postgres 12+ as long as they aren't referenced in
-- the same transaction — our SQL fn declarations cast at runtime, not
-- at migration time, so this is safe.
ALTER TYPE "public"."coin_reason" ADD VALUE IF NOT EXISTS 'vault_destroy';
--> statement-breakpoint

-- Append-only audit table for vault destroys. card_id is kept as a
-- plain uuid (no FK) because the card row is deleted in the same
-- transaction; the audit row survives.
CREATE TABLE "public"."vault_card_destroy" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "season_id" uuid NOT NULL,
  "card_id" uuid NOT NULL,
  "tier" "card_tier" NOT NULL,
  "refund_coins" bigint NOT NULL,
  "vault_source" "vault_source" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "public"."vault_card_destroy"
  ADD CONSTRAINT "vault_card_destroy_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "public"."vault_card_destroy"
  ADD CONSTRAINT "vault_card_destroy_season_id_season_id_fk"
  FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "public"."vault_card_destroy" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Owner-only select. Inserts happen only via destroy_vaulted_card()
-- (SECURITY INVOKER; the function is only callable from actions that
-- already verified auth.uid()).
CREATE POLICY "vault_card_destroy_owner_select"
  ON "public"."vault_card_destroy"
  FOR SELECT
  USING ("user_id" = auth.uid());
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vault_card_destroy_user_season_idx"
  ON "public"."vault_card_destroy" ("user_id", "season_id", "created_at" DESC);
