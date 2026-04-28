-- ─────────────────────────────────────────────────────────────────────────
-- Phase 58 §230. Building entries credit live FP.
--
-- Bug: `_apply_game_event_to_lineups` (the live-scoring trigger) had
-- `WHERE ce.status IN ('submitted', 'live')`. Entries in 'building'
-- state were never credited. Pre-§230 the user could submit their
-- lineup explicitly, which flipped building → submitted and unlocked
-- crediting. The Submit button was retired in §141 (Phase 42); since
-- then, building entries have been a dead-end for FP.
--
-- Symptom: user has rostered players whose games are live and
-- popping events in the feed (HRs, hits, etc.) but the right
-- sidebar shows 0.0 FP per slot. Events feed shows what would have
-- credited; the trigger silently skipped them.
--
-- Fix: include 'building' in the trigger's eligibility filter so
-- live events credit immediately. Per-slot lock semantics still
-- apply server-side for ADDING new players (lock predicate gates
-- the add at update_lineup_slot), and the trigger only credits
-- FUTURE events (no retroactive aggregation when a player is
-- swapped in mid-game), so there's no advance-knowledge abuse.
--
-- One-shot backfill: for every currently-building entry whose
-- contest has any started game, recompute slot.live_fp from
-- game_event history. Apply the delta to the slot, the entry's
-- live_score, and the card's career_fp_total (mirroring §224's
-- live-mirror contract).
--
-- Note: token bonus FP that should have triggered on missed
-- events isn't backfilled here. The next live event for an
-- affected token will re-evaluate against history and trigger
-- if applicable. Out of scope for §230.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1) Update trigger filter to include 'building' ──────────────────────
CREATE OR REPLACE FUNCTION public._apply_game_event_to_lineups(
  p_event game_event
)
RETURNS void
LANGUAGE plpgsql AS $$
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
               s.starter_card_id,
               c.player_id, ce.contest_id
        FROM public.contest_lineup_slot s
        JOIN public.contest_entry ce ON ce.id = s.contest_entry_id
        JOIN public.card c ON c.id = s.starter_card_id
        WHERE c.player_id = p_event.batter_player_id
          AND ce.status IN ('building', 'submitted', 'live')
      LOOP
        UPDATE public.contest_lineup_slot
        SET live_fp = live_fp + v_fp_delta
        WHERE id = r.slot_id;

        UPDATE public.contest_entry
        SET live_score = live_score + v_fp_delta,
            updated_at = now()
        WHERE id = r.contest_entry_id;

        UPDATE public.card
        SET career_fp_total = career_fp_total + v_fp_delta,
            updated_at = now()
        WHERE id = r.starter_card_id;

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

              UPDATE public.card
              SET career_fp_total = career_fp_total + v_trigger.bonus_fp,
                  updated_at = now()
              WHERE id = r.starter_card_id;
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
               s.starter_card_id,
               c.player_id, ce.contest_id
        FROM public.contest_lineup_slot s
        JOIN public.contest_entry ce ON ce.id = s.contest_entry_id
        JOIN public.card c ON c.id = s.starter_card_id
        WHERE c.player_id = p_event.pitcher_player_id
          AND ce.status IN ('building', 'submitted', 'live')
      LOOP
        UPDATE public.contest_lineup_slot
        SET live_fp = live_fp + v_fp_delta
        WHERE id = r.slot_id;

        UPDATE public.contest_entry
        SET live_score = live_score + v_fp_delta,
            updated_at = now()
        WHERE id = r.contest_entry_id;

        UPDATE public.card
        SET career_fp_total = career_fp_total + v_fp_delta,
            updated_at = now()
        WHERE id = r.starter_card_id;

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

              UPDATE public.card
              SET career_fp_total = career_fp_total + v_trigger.bonus_fp,
                  updated_at = now()
              WHERE id = r.starter_card_id;
            END IF;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;
END;
$$;

ALTER FUNCTION public._apply_game_event_to_lineups(game_event)
  SET search_path = public, pg_catalog;


-- ── 2) One-shot backfill for missed FP on currently-building entries ──
DO $$
DECLARE
  v_slot record;
  v_computed_fp numeric;
  v_delta numeric;
  v_count integer := 0;
BEGIN
  FOR v_slot IN
    SELECT
      s.id AS slot_id,
      s.contest_entry_id,
      s.starter_card_id,
      s.live_fp AS current_live_fp,
      c.player_id,
      co.included_game_ids
    FROM public.contest_lineup_slot s
    JOIN public.contest_entry ce ON ce.id = s.contest_entry_id
    JOIN public.contest co ON co.id = ce.contest_id
    JOIN public.card c ON c.id = s.starter_card_id
    WHERE ce.status = 'building'
      AND s.starter_card_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.game g
        WHERE g.id = ANY(co.included_game_ids)
          AND (g.status IN ('live', 'final')
               OR (g.scheduled_start IS NOT NULL AND g.scheduled_start <= now()))
      )
  LOOP
    SELECT COALESCE(SUM(
      CASE
        WHEN ge.batter_player_id = v_slot.player_id
          THEN public._score_batter_event(ge.event_type, ge.play_type, ge.score_value)
        WHEN ge.pitcher_player_id = v_slot.player_id
          THEN public._score_pitcher_event(ge.event_type, ge.play_type)
        ELSE 0
      END
    ), 0)
    INTO v_computed_fp
    FROM public.game_event ge
    WHERE ge.game_id = ANY(v_slot.included_game_ids)
      AND (ge.batter_player_id = v_slot.player_id OR ge.pitcher_player_id = v_slot.player_id);

    v_delta := v_computed_fp - v_slot.current_live_fp;

    IF v_delta > 0 THEN
      UPDATE public.contest_lineup_slot
      SET live_fp = v_computed_fp
      WHERE id = v_slot.slot_id;

      UPDATE public.card
      SET career_fp_total = career_fp_total + v_delta,
          updated_at = now()
      WHERE id = v_slot.starter_card_id;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- Recompute entry.live_score from the (now-corrected) slot live_fps.
  UPDATE public.contest_entry ce
  SET live_score = sub.total,
      updated_at = now()
  FROM (
    SELECT contest_entry_id, COALESCE(SUM(live_fp), 0) AS total
    FROM public.contest_lineup_slot
    GROUP BY contest_entry_id
  ) sub
  WHERE ce.id = sub.contest_entry_id
    AND ce.status = 'building'
    AND ce.live_score IS DISTINCT FROM sub.total;

  RAISE NOTICE 'P58 §230 backfill: % slots credited from missed events', v_count;
END;
$$;
