-- ─────────────────────────────────────────────────────────────────────────
-- 0071_backfill_stuck_game_schedule.sql — Phase 54.
--
-- Polish spec §220. Backfill for games whose `scheduled_start` was
-- mis-populated by the pre-§218 schedule sync. Symptom: events fired
-- hours BEFORE the row's `scheduled_start`, which is impossible for
-- a real game (events fire as plays happen).
--
-- Heuristic: if the earliest event for a game is more than 6 hours
-- before scheduled_start, scheduled_start is wrong. Re-derive it
-- from MIN(event.created_at) - 5 minutes (events typically fire a
-- few minutes after first pitch).
--
-- Then re-derive `date` from the corrected scheduled_start using
-- the ET 4 AM pivot semantics (matching `current_slate_date()`).
--
-- Collision skip: some matchups have BOTH a wrong row (this slate)
-- AND a real row already at the corrected date (a different
-- bdl_game_id). The unique index `game_matchup_number_uidx` on
-- (date, home_team_id, away_team_id, game_number) prevents the
-- shift in those cases. We skip them and let the regular schedule
-- sync clean up over time. The non-collision rows are the ones
-- causing user-visible scoring issues, so this is sufficient.
-- ─────────────────────────────────────────────────────────────────────────

WITH corrections AS (
  SELECT
    g.id,
    g.home_team_id,
    g.away_team_id,
    g.game_number,
    g.scheduled_start AS old_start,
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
        AND ge.created_at < g.scheduled_start - INTERVAL '6 hours'
    )
),
safe_corrections AS (
  -- Skip rows whose target (date, home, away, game_number) is
  -- already taken by a different game.
  SELECT c.*
  FROM corrections c
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

-- Re-check + finalize entries that may now qualify after the date fix.
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
  RAISE NOTICE 'P54 backfill: % entries finalized', v_count;
END;
$$;
