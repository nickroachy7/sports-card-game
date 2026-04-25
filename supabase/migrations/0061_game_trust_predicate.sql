-- ─────────────────────────────────────────────────────────────────────────
-- 0061_game_trust_predicate.sql — Phase 48. BDL game-state trust framework.
--
-- Polish spec §190–§194. Replaces the ad-hoc demote logic accumulated
-- across §183, §184, §189, and the v2 2-hour fix with a single,
-- composable predicate.
--
-- Three SQL functions, one backfill:
--   1. final_passes_time_check(scheduled_start)
--      Time-only gate. Used by webhook handler (which doesn't have
--      box-score data at the moment of the status flip — reconcile
--      backfills scores after).
--
--   2. is_trustworthy_final(status, scheduled_start, home_runs, away_runs)
--      Full predicate. Used by display CTE + backfill. Adds score
--      sanity on top of the time check:
--        - both runs columns populated
--        - NOT a 0-0 result (2026 MLB has no ties — ghost-runner
--          rule guarantees a winner)
--
--   3. final_trust_violation_reason(...)
--      Returns NULL when trustworthy, else a short machine code:
--      'missing_start' | 'not_started' | 'too_recent' |
--      'null_score' | 'zero_zero_tie'. Used in webhook_failed
--      audit notes so we can grep BDL data quality regressions
--      historically.
--
--   4. Backfill: any row currently in status='final' that fails
--      the predicate gets demoted to 'scheduled' with cleared
--      scores + ended_at. Catches the BAL@BOS 0-0 case immediately.
--      Idempotent — no-op once everyone's clean.
--
-- All three fns are STABLE (depend on now()), search_path locked.
--
-- Why this exists. After 5 separate patches across 2 phases (§183,
-- §184, §189, P47v2, and now the 0-0 case), the obvious next
-- refactor is unifying the predicate so the next BDL anomaly is a
-- 1-line change here, not 5 file edits.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Time-only check: ingest gate.
CREATE OR REPLACE FUNCTION public.final_passes_time_check(
  p_scheduled_start timestamptz
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    p_scheduled_start IS NOT NULL
    AND p_scheduled_start <= now() - INTERVAL '2 hours';
$$;

ALTER FUNCTION public.final_passes_time_check(timestamptz)
  SET search_path = public, pg_catalog;

-- 2) Full predicate: display + backfill gate.
CREATE OR REPLACE FUNCTION public.is_trustworthy_final(
  p_status game_status,
  p_scheduled_start timestamptz,
  p_home_runs integer,
  p_away_runs integer
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    p_status = 'final'::game_status
    AND public.final_passes_time_check(p_scheduled_start)
    AND p_home_runs IS NOT NULL
    AND p_away_runs IS NOT NULL
    AND NOT (p_home_runs = 0 AND p_away_runs = 0);
$$;

ALTER FUNCTION public.is_trustworthy_final(game_status, timestamptz, integer, integer)
  SET search_path = public, pg_catalog;

-- 3) Reason code helper. Returns NULL when trustworthy, else a
--    short machine-readable string. Order matters — first failure
--    wins, mirroring the predicate's evaluation order.
CREATE OR REPLACE FUNCTION public.final_trust_violation_reason(
  p_status game_status,
  p_scheduled_start timestamptz,
  p_home_runs integer,
  p_away_runs integer
) RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_status IS DISTINCT FROM 'final'::game_status THEN NULL
    WHEN p_scheduled_start IS NULL THEN 'missing_start'
    WHEN p_scheduled_start > now() THEN 'not_started'
    WHEN p_scheduled_start > now() - INTERVAL '2 hours' THEN 'too_recent'
    WHEN p_home_runs IS NULL OR p_away_runs IS NULL THEN 'null_score'
    WHEN p_home_runs = 0 AND p_away_runs = 0 THEN 'zero_zero_tie'
    ELSE NULL
  END;
$$;

ALTER FUNCTION public.final_trust_violation_reason(game_status, timestamptz, integer, integer)
  SET search_path = public, pg_catalog;

-- 4) Backfill: demote currently-bad finals.
--    Clears scores + ended_at so downstream consumers can't read
--    stale data. Idempotent.
UPDATE public.game
SET status     = 'scheduled',
    home_runs  = NULL,
    away_runs  = NULL,
    ended_at   = NULL,
    updated_at = now()
WHERE status = 'final'
  AND NOT public.is_trustworthy_final(status, scheduled_start, home_runs, away_runs);
