-- ─────────────────────────────────────────────────────────────────────────
-- 0008_function_hardening.sql — set an explicit search_path on every
-- function per the Supabase security advisor recommendation:
-- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
--
-- Without this, a user on the search_path could shadow built-ins
-- (e.g. by creating their own `public.now()`) and hijack the function.
-- ─────────────────────────────────────────────────────────────────────────

ALTER FUNCTION public.touch_updated_at()                SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_active_economy_config()       SET search_path = public, pg_catalog;
ALTER FUNCTION public.recompute_card_tier()             SET search_path = public, pg_catalog;
ALTER FUNCTION public.recompute_card_expiry()           SET search_path = public, pg_catalog;
ALTER FUNCTION public.grant_manager_xp(uuid, bigint, text) SET search_path = public, pg_catalog;
ALTER FUNCTION public._upsert_user_season_state(uuid, uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION public.credit_coins(uuid, uuid, bigint, coin_reason, text, uuid, text) SET search_path = public, pg_catalog;
ALTER FUNCTION public.spend_coins(uuid, uuid, bigint, coin_reason, text, uuid, text)  SET search_path = public, pg_catalog;
ALTER FUNCTION public._bump_card_tokens_applied()       SET search_path = public, pg_catalog;
ALTER FUNCTION public._bump_card_tokens_triggered()     SET search_path = public, pg_catalog;
ALTER FUNCTION public._bump_season_fp()                 SET search_path = public, pg_catalog;
