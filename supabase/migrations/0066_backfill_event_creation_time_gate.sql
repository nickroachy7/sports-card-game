-- ─────────────────────────────────────────────────────────────────────────
-- 0066_backfill_event_creation_time_gate.sql — hotfix on top of 0065.
--
-- The Phase 50 backfill was comparing `g.scheduled_start <= now()` —
-- which works at trigger insert time (NEW.created_at == now()) but
-- breaks during backfill: by the time a recompute runs, NOW is often
-- past scheduled_start for a game whose pre-sim events fired hours
-- earlier. Those pre-sim events still got summed.
--
-- Correct gate: compare the EVENT's `created_at` to the game's
-- scheduled_start. Pre-sim events have created_at < scheduled_start
-- regardless of the recompute time.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._backfill_entry_live_fp(
  p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric := 0;
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
          g.scheduled_start IS NOT NULL
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
