-- ─────────────────────────────────────────────────────────────────────────
-- Phase 55 §223. Backfill for games whose `scheduled_start` (and
-- consequently `date`) is 24h late because BDL's `g.date` field is
-- sometimes the day-after for late-evening ET games whose UTC start
-- crosses midnight. MLB Stats' `gameDate` is canonical; we shift any
-- row whose `scheduled_start` is more than 18 hours after the earliest
-- `game_event` for that game (real games can't fire events 18h before
-- first pitch).
--
-- This catches both:
--   - Games with events already (live/final): use MIN(event) - 5min.
--   - Brand-new entries with no events yet: handled by the schedule
--     sync's MLB Stats second pass (§221) on the next cron tick.
--
-- The §221 schedule-sync rewrite ensures going forward that MLB Stats
-- is the source of truth, so BDL's `g.date` never re-stomps a corrected
-- row. This migration just heals the in-flight rows.
--
-- Three known-affected rows on April 27 prod (already hot-fixed by
-- direct SQL outside this migration; this migration is idempotent and
-- a no-op on already-corrected rows):
--   - bdl 5058197 NYY@TEX
--   - bdl 5058198 CHC@SD
--   - bdl 5058199 MIA@LAD
--
-- Collision skip (same as §220) — if the corrected (date, home, away,
-- game_number) is already taken by a different bdl_game_id, skip the
-- row. Safe by construction: a row at the corrected slate already
-- carries the right game-state, and the MLB Stats second pass on the
-- next sync tick will resolve which bdl_game_id wins.
-- ─────────────────────────────────────────────────────────────────────────

WITH corrections AS (
  SELECT
    g.id,
    g.home_team_id,
    g.away_team_id,
    g.game_number,
    g.scheduled_start AS old_start,
    g.date AS old_date,
    (SELECT min(ge.created_at) FROM public.game_event ge
     WHERE ge.game_id = g.id) - INTERVAL '5 minutes' AS new_start,
    ((((SELECT min(ge.created_at) FROM public.game_event ge
        WHERE ge.game_id = g.id) - INTERVAL '5 minutes')
        AT TIME ZONE 'America/New_York' - INTERVAL '4 hours')::date) AS new_date
  FROM public.game g
  WHERE g.scheduled_start IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.game_event ge
      WHERE ge.game_id = g.id
        AND ge.created_at < g.scheduled_start - INTERVAL '18 hours'
    )
),
safe_corrections AS (
  SELECT c.* FROM corrections c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.game g2
    WHERE g2.id <> c.id
      AND g2.date = c.new_date
      AND g2.home_team_id = c.home_team_id
      AND g2.away_team_id = c.away_team_id
      AND COALESCE(g2.game_number, -1) = COALESCE(c.game_number, -1)
  )
)
UPDATE public.game g
SET
  scheduled_start = sc.new_start,
  date = sc.new_date,
  updated_at = now()
FROM safe_corrections sc
WHERE g.id = sc.id;

-- Re-finalize sweep (mirrors §220) — entries whose contests had a
-- shift may now qualify.
DO $$
DECLARE
  v_entry_id uuid;
  v_count    integer := 0;
BEGIN
  FOR v_entry_id IN
    SELECT DISTINCT ce.id
    FROM public.contest_entry ce
    JOIN public.contest c ON c.id = ce.contest_id
    WHERE ce.status <> 'final'
  LOOP
    IF public._check_and_finalize_entry(v_entry_id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'P55 backfill: % entries finalized', v_count;
END;
$$;
