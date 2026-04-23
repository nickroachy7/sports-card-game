-- 0043 — _apply_game_event_to_lineups scores all non-final entries.
--
-- Same pattern as migration 0039 (edit gating): the scoring pipeline
-- was gated on `ce.status IN ('submitted', 'live')`. Phase 39 removed
-- the user Submit flow, so entries sit in 'building' indefinitely.
-- The scoring loops matched zero rows for every event — no live FP
-- accumulation, no token trigger evaluation, no `triggered` flag,
-- no `bonus_fp_awarded`, no cascade into `_finalize_contest_entry`
-- consuming tokens.
--
-- Fix: score any non-final entry. The per-slot-lock check
-- (is_slot_locked) is the correct gate for "should this slot be
-- editable" but for scoring, we simply want "this entry isn't
-- archived." A game event for a player only arrives when that
-- player's game is live — no need for finer-grained gating.

CREATE OR REPLACE FUNCTION public._apply_game_event_to_lineups(p_event game_event)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
$function$;
