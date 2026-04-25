-- ─────────────────────────────────────────────────────────────────────────
-- 0059_backfill_future_finals.sql — reset games marked final-but-future.
--
-- Polish spec §185 (Phase 47). User reported lineup pills like
-- "FINAL L 4-12" on a player whose team plays tonight at 7:10 PM ET.
-- DB inspection found 4 games today in `status='final'` with
-- `scheduled_start > now()` and pre-populated scores. BDL ingestion
-- delivered "ended" events / prefetch data for games before they
-- happened — sandbox / pre-populated scores leaked in.
--
-- This migration resets every such row to `status='scheduled'` with
-- cleared scores + live-game state. Idempotent (re-runs are no-ops
-- once the predicate doesn't match anything). Defenses against
-- recurrence land in the webhook handler + prefetch cron (§184).
-- ─────────────────────────────────────────────────────────────────────────

-- Reset core status + score columns. Live-state columns
-- (current_inning, current_inning_half, current_outs) are zeroed by
-- their own webhook reducer when a game flips back to scheduled in
-- subsequent ingest, and they're nullable on prod schemas; not all
-- dev branches have them (added in Phase 20+). Skip them here to keep
-- the migration portable.
UPDATE public.game
SET status     = 'scheduled',
    home_runs  = NULL,
    away_runs  = NULL,
    updated_at = now()
WHERE status = 'final'
  AND scheduled_start > now();
