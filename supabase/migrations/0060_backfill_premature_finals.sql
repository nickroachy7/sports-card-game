-- ─────────────────────────────────────────────────────────────────────────
-- 0060_backfill_premature_finals.sql — broader Phase 47 backfill.
--
-- Phase 47 v1 (migration 0059) only reset rows where
-- `scheduled_start > now()`. User found a follow-up case: BDL marked
-- the STL @ SEA game `final` 24 minutes after its scheduled start —
-- physically impossible (real MLB games take 2h 50min on average,
-- 90+ min even when rain-shortened).
--
-- This migration extends the backfill: any game flagged `final`
-- whose start is unknown OR less than 2 hours old gets reset to
-- `scheduled` with cleared scores. The display + webhook + prefetch
-- guards in the same phase enforce the same predicate going forward.
--
-- Idempotent (no-op once everyone's clean).
-- ─────────────────────────────────────────────────────────────────────────

UPDATE public.game
SET status     = 'scheduled',
    home_runs  = NULL,
    away_runs  = NULL,
    updated_at = now()
WHERE status = 'final'
  AND (
    scheduled_start IS NULL
    OR scheduled_start > now() - INTERVAL '2 hours'
  );
