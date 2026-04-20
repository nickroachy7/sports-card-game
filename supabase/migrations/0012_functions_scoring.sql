-- ─────────────────────────────────────────────────────────────────────────
-- 0012_functions_scoring.sql — Phase 3 live scoring + token triggers.
--
-- _score_batter_event()              — DK hitter FP per event
-- _score_pitcher_event()             — DK pitcher FP per event
-- _apply_game_event_to_lineups()     — reducer: walks every rostered
--                                      contest_lineup_slot whose card
--                                      matches the event's batter/pitcher
--                                      and increments live_fp +
--                                      contest_entry.live_score.
--                                      Also evaluates any applied token.
-- game_event_apply_trigger           — fires after INSERT on game_event.
-- _evaluate_token_on_event()         — returns (fires, bonus_fp) for a
--                                      given token type + event context.
-- _flip_contest_entries_on_game_start
-- _flip_contest_entries_on_game_end  — lifecycle helpers called by the
--                                      webhook handler on game.started /
--                                      game.ended.
--
-- Phase 3 scope per BDL integration §6.3:
--   • Live scoring from webhook events is PARTIAL — we process the
--     event types BDL confirms (HR, hit, walk, HBP). Other stats (runs
--     scored, RBI, SB, pitcher K/IP/ER) come from post-game box score
--     reconciliation (next migration: 0013_functions_reconcile.sql).
--   • final_fp stays 0 until reconciliation; live_fp is a best-effort
--     running total.
-- ─────────────────────────────────────────────────────────────────────────

-- ── _score_batter_event ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._score_batter_event(
  p_event_type text,
  p_play_type  text,
  p_score_value integer
)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_fp numeric := 0;
  v_rbi_runs integer := 0;
BEGIN
  CASE p_event_type
    WHEN 'mlb.batter.home_run' THEN
      v_fp := v_fp + 10;   -- HR
      v_fp := v_fp + 2;    -- Run scored (the HR hitter scores)
      -- score_value on HR payload = runs batted in (including the hitter)
      v_rbi_runs := COALESCE(p_score_value, 1);
      v_fp := v_fp + 2 * v_rbi_runs;  -- RBI × +2
    WHEN 'mlb.batter.hit' THEN
      -- play.type distinguishes single/double/triple; default single.
      CASE lower(COALESCE(p_play_type, 'single'))
        WHEN 'double' THEN v_fp := 5;
        WHEN 'triple' THEN v_fp := 8;
        ELSE v_fp := 3;  -- single or unknown
      END CASE;
      -- RBI if the hit drove in runs
      IF p_score_value IS NOT NULL AND p_score_value > 0 THEN
        v_fp := v_fp + 2 * p_score_value;
      END IF;
    WHEN 'mlb.batter.walk' THEN       v_fp := 2;
    WHEN 'mlb.batter.hit_by_pitch' THEN v_fp := 2;
    -- SB would fire on a dedicated stolen_base event if BDL exposes one;
    -- deferred to post-game reconciliation otherwise.
    ELSE v_fp := 0;
  END CASE;

  RETURN v_fp;
END;
$$;

ALTER FUNCTION public._score_batter_event(text, text, integer)
  SET search_path = public, pg_catalog;


-- ── _score_pitcher_event ────────────────────────────────────────────────
-- Pitchers credited on the pitcher_player_id of the event. Most pitcher
-- FP sources (IP, ER, W) are game-level aggregates — they come from
-- post-game reconciliation. Live webhook events contribute partial
-- credits for the events BDL confirms below.
CREATE OR REPLACE FUNCTION public._score_pitcher_event(
  p_event_type text,
  p_play_type  text
)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_fp numeric := 0;
BEGIN
  CASE p_event_type
    -- Each hit surrendered costs the pitcher 0.6 FP.
    WHEN 'mlb.batter.hit' THEN
      v_fp := -0.6;
      IF lower(COALESCE(p_play_type, 'single')) = 'double' THEN v_fp := -0.6; END IF;
      IF lower(COALESCE(p_play_type, 'single')) = 'triple' THEN v_fp := -0.6; END IF;
    WHEN 'mlb.batter.home_run'     THEN v_fp := -0.6;
    WHEN 'mlb.batter.walk'         THEN v_fp := -0.6;
    WHEN 'mlb.batter.hit_by_pitch' THEN v_fp := -0.6;
    WHEN 'mlb.batter.strikeout'    THEN v_fp := 2;     -- K credit to pitcher
    WHEN 'mlb.pitcher.strikeout'   THEN v_fp := 2;     -- vendor may also emit this
    ELSE v_fp := 0;
  END CASE;

  RETURN v_fp;
END;
$$;

ALTER FUNCTION public._score_pitcher_event(text, text)
  SET search_path = public, pg_catalog;


-- ── _evaluate_token_on_event ────────────────────────────────────────────
-- Returns (fires boolean, bonus_fp numeric).
-- Accumulators (multi-hit, pitcher strikeout) are computed on the fly
-- from game_event history for the same player + game, so we don't need
-- to persist a counter per token_application.
CREATE OR REPLACE FUNCTION public._evaluate_token_on_event(
  p_application_id  uuid,
  p_token_type      token_type,
  p_event_type      text,
  p_play_type       text,
  p_score_value     integer,
  p_game_id         uuid,
  p_player_id       uuid
)
RETURNS TABLE(fires boolean, bonus_fp numeric)
LANGUAGE plpgsql AS $$
DECLARE
  v_bonus numeric;
  v_hit_count integer;
  v_k_count integer;
BEGIN
  SELECT (t.bonus_fp) INTO v_bonus
  FROM public.token_application ta
  JOIN public.token t ON t.id = ta.token_id
  WHERE ta.id = p_application_id;
  v_bonus := COALESCE(v_bonus, 0);

  CASE p_token_type
    WHEN 'hr_bonus' THEN
      IF p_event_type = 'mlb.batter.home_run' THEN
        RETURN QUERY SELECT true, v_bonus; RETURN;
      END IF;

    WHEN 'multi_hit_bonus' THEN
      -- Fires when the batter logs their 2nd hit of this game.
      IF p_event_type = 'mlb.batter.hit' OR p_event_type = 'mlb.batter.home_run' THEN
        SELECT count(*) INTO v_hit_count
        FROM public.game_event
        WHERE batter_player_id = p_player_id
          AND game_id = p_game_id
          AND event_type IN ('mlb.batter.hit', 'mlb.batter.home_run');
        IF v_hit_count >= 2 THEN
          RETURN QUERY SELECT true, v_bonus; RETURN;
        END IF;
      END IF;

    WHEN 'sb_bonus' THEN
      IF p_event_type = 'mlb.batter.stolen_base' THEN
        RETURN QUERY SELECT true, v_bonus; RETURN;
      END IF;

    WHEN 'strikeout_bonus' THEN
      -- Pitcher accumulator: 8+ strikeouts in the game.
      IF p_event_type IN ('mlb.pitcher.strikeout', 'mlb.batter.strikeout') THEN
        SELECT count(*) INTO v_k_count
        FROM public.game_event
        WHERE pitcher_player_id = p_player_id
          AND game_id = p_game_id
          AND event_type IN ('mlb.pitcher.strikeout', 'mlb.batter.strikeout');
        IF v_k_count >= 8 THEN
          RETURN QUERY SELECT true, v_bonus; RETURN;
        END IF;
      END IF;

    WHEN 'quality_start_bonus' THEN
      -- QS = 6+ IP AND ≤3 ER. Evaluated at game end via post-game
      -- reconciliation, not here.
      RETURN QUERY SELECT false, v_bonus; RETURN;
  END CASE;

  RETURN QUERY SELECT false, v_bonus;
END;
$$;

ALTER FUNCTION public._evaluate_token_on_event(uuid, token_type, text, text, integer, uuid, uuid)
  SET search_path = public, pg_catalog;


-- ── _apply_game_event_to_lineups ────────────────────────────────────────
-- Main reducer. Called from a trigger after each game_event insert.
-- For every live contest_entry whose contest covers this event's game AND
-- whose lineup includes this batter/pitcher as a starter_card_id, bump
-- live_fp on that slot + live_score on the entry. Evaluate any applied
-- token.
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
  -- 1) Batter credit: any slot where the starter's player matches the batter.
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
          AND ce.status IN ('submitted', 'live')
      LOOP
        UPDATE public.contest_lineup_slot
        SET live_fp = live_fp + v_fp_delta
        WHERE id = r.slot_id;

        UPDATE public.contest_entry
        SET live_score = live_score + v_fp_delta,
            updated_at = now()
        WHERE id = r.contest_entry_id;

        -- Evaluate the applied token if any, and it's a hitter token.
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

  -- 2) Pitcher credit: any slot where the starter's player matches the pitcher.
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
          AND ce.status IN ('submitted', 'live')
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

ALTER FUNCTION public._apply_game_event_to_lineups(game_event)
  SET search_path = public, pg_catalog;


-- ── game_event trigger ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._on_game_event_insert()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public._apply_game_event_to_lineups(NEW);
  RETURN NEW;
END;
$$;

ALTER FUNCTION public._on_game_event_insert()
  SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS game_event_apply_trigger ON public.game_event;
CREATE TRIGGER game_event_apply_trigger
  AFTER INSERT ON public.game_event
  FOR EACH ROW
  EXECUTE FUNCTION public._on_game_event_insert();


-- ── Contest lifecycle helpers ─────────────────────────────────────────
-- Flip submitted → live when the first game the entry touches starts.
-- Flip live → final when every game the entry touches has ended.
CREATE OR REPLACE FUNCTION public.mark_contest_entries_on_game_start(
  p_game_id uuid
)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.contest_entry ce
  SET status = 'live', updated_at = now()
  WHERE ce.status = 'submitted'
    AND EXISTS (
      SELECT 1 FROM public.contest c
      WHERE c.id = ce.contest_id
        AND p_game_id = ANY(c.included_game_ids)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

ALTER FUNCTION public.mark_contest_entries_on_game_start(uuid)
  SET search_path = public, pg_catalog;

-- On a game ending, flip any live entries whose entire included-game-set
-- is now 'final' to 'final'. Entries whose other games haven't ended
-- yet stay 'live'.
CREATE OR REPLACE FUNCTION public.mark_contest_entries_on_game_end(
  p_game_id uuid
)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.contest_entry ce
  SET status = 'final',
      resolved_at = now(),
      updated_at = now()
  WHERE ce.status = 'live'
    AND EXISTS (
      SELECT 1 FROM public.contest c
      WHERE c.id = ce.contest_id
        AND p_game_id = ANY(c.included_game_ids)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.contest c
      CROSS JOIN LATERAL unnest(c.included_game_ids) AS gid
      JOIN public.game g ON g.id = gid
      WHERE c.id = ce.contest_id
        AND g.status <> 'final'
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

ALTER FUNCTION public.mark_contest_entries_on_game_end(uuid)
  SET search_path = public, pg_catalog;
