-- ─────────────────────────────────────────────────────────────────────────
-- 0065_live_event_time_gate_and_backfill.sql — Phase 50.
--
-- Polish spec §202–§204. Two paired fixes for the live-FP path:
--
--   1. Time-gate in `_apply_game_event_to_lineups`.
--      BDL's sandbox sim fires `mlb.batter.*` events hours before
--      the game's actual scheduled_start (we observed events
--      24h pre-game in prod). The trigger applies those to
--      contest_lineup_slot.live_fp, polluting the running score
--      with sim-noise from games that haven't started.
--
--      Guard: only apply FP when the event's game has reached
--      `scheduled_start <= now()`. Events for games still in
--      pre-game state get recorded in game_event (audit trail)
--      but skipped for live_fp.
--
--   2. New SQL fn `_backfill_entry_live_fp(p_entry_id)`.
--      Idempotent recomputation of live_fp + live_score from
--      scratch over today's events, respecting the same time-gate
--      as the trigger. Wired into `create_contest_entry` so every
--      page load brings the entry fully up to date — fixes the
--      gap where events fired before the entry existed (e.g. user
--      sets lineup mid-game).
--
-- Backfill takes a per-entry slot lock to serialize against the
-- live trigger; concurrent INSERTs of game_event will wait for
-- the backfill to commit before applying.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Time-gate the live trigger fn.
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
  v_scheduled_start timestamptz;
BEGIN
  -- §202 — pre-game events from BDL's sim shouldn't credit live_fp.
  -- Reject any event whose game hasn't reached its scheduled start.
  -- Real game events fire after scheduled_start (often by minutes);
  -- sandbox sim events fire hours before. The audit row in
  -- game_event stays; only the FP application is skipped.
  SELECT scheduled_start INTO v_scheduled_start
  FROM public.game WHERE id = p_event.game_id;
  IF v_scheduled_start IS NULL OR v_scheduled_start > now() THEN
    RETURN;
  END IF;

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


-- 2) Backfill SQL fn — recomputes live_fp + live_score from scratch
--    using the same time-gate predicate. Idempotent. Run on every
--    contest_entry create/refresh to keep the score honest.
CREATE OR REPLACE FUNCTION public._backfill_entry_live_fp(
  p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric := 0;
BEGIN
  -- Lock the entry's slots so the live trigger waits during recompute.
  PERFORM 1 FROM public.contest_lineup_slot
  WHERE contest_entry_id = p_entry_id
  FOR UPDATE;

  -- Recompute each slot's live_fp from today's events. Time-gate
  -- mirrors the trigger: only sum events for games whose
  -- `scheduled_start <= now()`. NULL scheduled_start → skipped.
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
        g.id IS NULL  -- slots with no events (or empty starter) → 0
        OR (g.scheduled_start IS NOT NULL AND g.scheduled_start <= now())
      )
    GROUP BY s.id
  )
  UPDATE public.contest_lineup_slot s
  SET live_fp = r.computed_fp
  FROM recompute r
  WHERE s.id = r.slot_id;

  -- Slots where the entire row was filtered out (no qualifying events
  -- + still have an old live_fp from pre-§202 noise) need an explicit
  -- zero pass.
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
        AND g.scheduled_start <= now()
    );

  -- Sum slots into entry.live_score atomically.
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


-- 3) Hook backfill into `create_contest_entry`. Body forks from
--    0058 (sticky carry-over); only the trailing PERFORM is added.
CREATE OR REPLACE FUNCTION public.create_contest_entry(
  p_user_id    uuid,
  p_contest_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id           uuid;
  v_season_id          uuid;
  v_status             contest_status;
  v_pos                text;
  v_today_starts_at    timestamptz;
  v_today_game_ids     uuid[];
BEGIN
  SELECT season_id, status, starts_at, included_game_ids
  INTO v_season_id, v_status, v_today_starts_at, v_today_game_ids
  FROM public.contest WHERE id = p_contest_id;
  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'create_contest_entry: contest not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_entry_id
  FROM public.contest_entry
  WHERE user_id = p_user_id AND contest_id = p_contest_id;

  IF v_entry_id IS NOT NULL THEN
    PERFORM public._carry_over_sticky_slots(
      p_user_id, v_entry_id, v_today_starts_at, v_today_game_ids
    );
    -- §203 — recompute live_fp from today's events with the new
    -- time-gate. Cheap (10 slots × ~400 events scan) and corrects
    -- any drift from prior sim-noise applications.
    PERFORM public._backfill_entry_live_fp(v_entry_id);
    RETURN v_entry_id;
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'create_contest_entry: contest not pending (status=%)', v_status
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.contest_entry (user_id, contest_id, season_id)
  VALUES (p_user_id, p_contest_id, v_season_id)
  RETURNING id INTO v_entry_id;

  FOREACH v_pos IN ARRAY public._lineup_positions() LOOP
    INSERT INTO public.contest_lineup_slot (contest_entry_id, position)
    VALUES (v_entry_id, v_pos);
  END LOOP;

  PERFORM public._carry_over_sticky_slots(
    p_user_id, v_entry_id, v_today_starts_at, v_today_game_ids
  );
  -- Backfill on first creation too, in case the user sets a lineup
  -- mid-game and any of their players already have today's events.
  PERFORM public._backfill_entry_live_fp(v_entry_id);

  RETURN v_entry_id;
END;
$$;

ALTER FUNCTION public.create_contest_entry(uuid, uuid)
  SET search_path = public, pg_catalog;
