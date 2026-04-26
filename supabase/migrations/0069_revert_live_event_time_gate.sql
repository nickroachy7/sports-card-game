-- ─────────────────────────────────────────────────────────────────────────
-- 0069_revert_live_event_time_gate.sql — Phase 52.
--
-- Polish spec §202 retraction. The P50 time-gate (event.created_at
-- >= game.scheduled_start) was based on a wrong mental model of
-- BDL's sandbox.
--
-- Reality: BDL's sandbox pre-simulates the entire slate ~24h in
-- advance and fires ALL events in one burst the night before. The
-- "scheduled_start" timestamp is the in-game start time but the
-- events fire wall-clock-earlier. With the time-gate active, ALL
-- sandbox events get rejected and zero FP credits — exactly what
-- the user reported.
--
-- Pre-P50 behavior (no time-gate): trigger fires on every event,
-- credits FP to whatever entries exist at trigger time. The
-- backfill SQL fn (`_backfill_entry_live_fp`, P50 §203) also runs
-- on entry creation/refresh and sums events the trigger missed.
-- That combination correctly handled BDL's sandbox model — and
-- earlier slates (Apr 23/24) finalized with sensible FP totals
-- precisely because no gate existed yet.
--
-- This migration:
--   1. Drops the time-gate from `_apply_game_event_to_lineups`
--      (the trigger fn). All events now apply FP regardless of
--      event-vs-scheduled-start ordering.
--   2. Drops the time-gate from `_backfill_entry_live_fp`. The
--      backfill now sums all today's events for the entry's slot
--      players, with no `created_at >= scheduled_start` filter.
--
-- The P48 trust predicate (`is_trustworthy_final` for display
-- demote of bogus FINAL T 0-0 pills) is unaffected — that's a
-- separate concern about end-of-game pill rendering and remains
-- correct.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Trigger fn: drop the scheduled_start gate. Body otherwise
--    byte-identical to pre-P50 (migration 0012).
CREATE OR REPLACE FUNCTION public._apply_game_event_to_lineups(p_event game_event)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  r record;
  v_fp_delta numeric;
  v_token record;
  v_trigger record;
BEGIN
  IF p_event.batter_player_id IS NOT NULL THEN
    v_fp_delta := public._score_batter_event(
      p_event.event_type, p_event.play_type, p_event.score_value
    );
    IF v_fp_delta <> 0 THEN
      FOR r IN
        SELECT s.id AS slot_id, s.contest_entry_id, s.token_application_id,
               c.player_id, ce.contest_id
        FROM public.contest_lineup_slot s
        JOIN public.contest_entry ce ON ce.id = s.contest_entry_id
        JOIN public.card c ON c.id = s.starter_card_id
        WHERE c.player_id = p_event.batter_player_id
          AND ce.status <> 'final'
      LOOP
        UPDATE public.contest_lineup_slot
        SET live_fp = live_fp + v_fp_delta
        WHERE id = r.slot_id;

        UPDATE public.contest_entry
        SET live_score = live_score + v_fp_delta,
            updated_at = now()
        WHERE id = r.contest_entry_id;

        IF r.token_application_id IS NOT NULL THEN
          SELECT ta.id, t.token_type, t.bonus_fp
          INTO v_token
          FROM public.token_application ta
          JOIN public.token t ON t.id = ta.token_id
          WHERE ta.id = r.token_application_id
            AND ta.triggered IS NULL
            AND t.token_type IN ('hr_bonus', 'multi_hit_bonus', 'sb_bonus');
          IF FOUND THEN
            SELECT * INTO v_trigger FROM public._evaluate_token_on_event(
              r.token_application_id, v_token.token_type, p_event.event_type,
              p_event.play_type, p_event.score_value, p_event.game_id, p_event.batter_player_id
            );
            IF v_trigger.fires THEN
              UPDATE public.token_application
              SET triggered = true,
                  bonus_fp_awarded = v_trigger.bonus_fp
              WHERE id = r.token_application_id;

              UPDATE public.contest_lineup_slot
              SET live_fp = live_fp + v_trigger.bonus_fp
              WHERE id = r.slot_id;

              UPDATE public.contest_entry
              SET live_score = live_score + v_trigger.bonus_fp,
                  updated_at = now()
              WHERE id = r.contest_entry_id;
            END IF;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF p_event.pitcher_player_id IS NOT NULL THEN
    v_fp_delta := public._score_pitcher_event(p_event.event_type, p_event.play_type);
    IF v_fp_delta <> 0 THEN
      FOR r IN
        SELECT s.id AS slot_id, s.contest_entry_id, s.token_application_id,
               c.player_id, ce.contest_id
        FROM public.contest_lineup_slot s
        JOIN public.contest_entry ce ON ce.id = s.contest_entry_id
        JOIN public.card c ON c.id = s.starter_card_id
        WHERE c.player_id = p_event.pitcher_player_id
          AND ce.status <> 'final'
      LOOP
        UPDATE public.contest_lineup_slot
        SET live_fp = live_fp + v_fp_delta
        WHERE id = r.slot_id;

        UPDATE public.contest_entry
        SET live_score = live_score + v_fp_delta,
            updated_at = now()
        WHERE id = r.contest_entry_id;

        IF r.token_application_id IS NOT NULL THEN
          SELECT ta.id, t.token_type, t.bonus_fp
          INTO v_token
          FROM public.token_application ta
          JOIN public.token t ON t.id = ta.token_id
          WHERE ta.id = r.token_application_id
            AND ta.triggered IS NULL
            AND t.token_type IN ('strikeout_bonus', 'quality_start_bonus');
          IF FOUND THEN
            SELECT * INTO v_trigger FROM public._evaluate_token_on_event(
              r.token_application_id, v_token.token_type, p_event.event_type,
              p_event.play_type, p_event.score_value, p_event.game_id, p_event.pitcher_player_id
            );
            IF v_trigger.fires THEN
              UPDATE public.token_application
              SET triggered = true,
                  bonus_fp_awarded = v_trigger.bonus_fp
              WHERE id = r.token_application_id;

              UPDATE public.contest_lineup_slot
              SET live_fp = live_fp + v_trigger.bonus_fp
              WHERE id = r.slot_id;

              UPDATE public.contest_entry
              SET live_score = live_score + v_trigger.bonus_fp,
                  updated_at = now()
              WHERE id = r.contest_entry_id;
            END IF;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;
END;
$$;


-- 2) Backfill fn: drop the time-gate. Sum all today's events for
--    the entry's slot players, no scheduled_start gate.
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
      AND (g.id IS NULL OR g.date = v_today)
    GROUP BY s.id
  )
  UPDATE public.contest_lineup_slot s
  SET live_fp = r.computed_fp
  FROM recompute r
  WHERE s.id = r.slot_id;

  -- Force-zero slots with no qualifying events but a stale live_fp.
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
