-- ─────────────────────────────────────────────────────────────────────────
-- 0067_backfill_scope_to_today_slate.sql — hotfix on top of 0066.
--
-- The Phase 50 backfill needed today's-slate scoping. Without it
-- the recompute summed events from the player's PRIOR games this
-- season (any game_event row with the same player_id). The
-- `g.date = current_slate_date()` filter limits to today's slate.
--
-- Captured into a constant `v_today` at fn entry so a fast slate
-- pivot mid-recompute can't shift the scope.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._backfill_entry_live_fp(
  p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric := 0;
  v_today date := public.current_slate_date();
BEGIN
  PERFORM 1 FROM public.contest_lineup_slot
  WHERE contest_entry_id = p_entry_id
  FOR UPDATE;

  WITH recompute AS (
    SELECT
      s.id AS slot_id,
      COALESCE(SUM(
        CASE
          WHEN ge.batter_player_id = c.player_id
            THEN public._score_batter_event(ge.event_type, ge.play_type, ge.score_value)
          WHEN ge.pitcher_player_id = c.player_id
            THEN public._score_pitcher_event(ge.event_type, ge.play_type)
          ELSE 0
        END
      ), 0) AS computed_fp
    FROM public.contest_lineup_slot s
    LEFT JOIN public.card c ON c.id = s.starter_card_id
    LEFT JOIN public.game_event ge
      ON c.player_id IS NOT NULL
         AND (ge.batter_player_id = c.player_id OR ge.pitcher_player_id = c.player_id)
    LEFT JOIN public.game g ON g.id = ge.game_id
    WHERE s.contest_entry_id = p_entry_id
      AND (
        g.id IS NULL
        OR (
          g.date = v_today
          AND g.scheduled_start IS NOT NULL
          AND ge.created_at >= g.scheduled_start
        )
      )
    GROUP BY s.id
  )
  UPDATE public.contest_lineup_slot s
  SET live_fp = r.computed_fp
  FROM recompute r
  WHERE s.id = r.slot_id;

  UPDATE public.contest_lineup_slot s
  SET live_fp = 0
  WHERE s.contest_entry_id = p_entry_id
    AND s.live_fp <> 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.card c
      LEFT JOIN public.game_event ge
        ON ge.batter_player_id = c.player_id OR ge.pitcher_player_id = c.player_id
      LEFT JOIN public.game g ON g.id = ge.game_id
      WHERE c.id = s.starter_card_id
        AND g.date = v_today
        AND g.scheduled_start IS NOT NULL
        AND ge.created_at >= g.scheduled_start
    );

  SELECT COALESCE(SUM(live_fp), 0) INTO v_total
  FROM public.contest_lineup_slot
  WHERE contest_entry_id = p_entry_id;

  UPDATE public.contest_entry
  SET live_score = v_total,
      updated_at = now()
  WHERE id = p_entry_id
    AND live_score <> v_total;
END;
$$;

ALTER FUNCTION public._backfill_entry_live_fp(uuid)
  SET search_path = public, pg_catalog;
