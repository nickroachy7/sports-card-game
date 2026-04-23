-- 0041 — tokens are one-time use.
--
-- `token.consumed_at` was declared on the schema but never written to
-- by any code path. Reconcile / finalize didn't touch it; triggering
-- events didn't touch it; migration 0038's apply_token self-heal
-- freed unconsumed tokens back to the tray. Net effect: tokens were
-- effectively infinite-use and could be re-applied in subsequent
-- contests.
--
-- Gameplay rule (user-stated): once a token is applied to a card and
-- that card's game starts, the token is committed. At contest
-- finalize, every applied token is consumed — whether it triggered
-- or not.
--
-- Changes:
--   1. `_finalize_contest_entry` now marks every applied token
--      consumed at finalize (UPDATE token.consumed_at = NOW()). Also
--      clears token.applied_to_card_id / applied_to_contest_id and
--      card.applied_token_id so downstream state is clean.
--   2. `apply_token` self-heal for stale card.applied_token_id now
--      CONSUMES the stale token (not frees it). Matches the "one-
--      time use" semantic: if a token ended up on a card in a
--      non-pending contest, it was already committed to that
--      contest.

CREATE OR REPLACE FUNCTION public._finalize_contest_entry(p_entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_entry        public.contest_entry;
  v_contest      public.contest;
  v_user_id      uuid;
  v_season_id    uuid;
  v_entry_final  numeric;
  v_slot         record;
  v_hits         bigint := 0;
  v_hrs          bigint := 0;
  v_sbs          bigint := 0;
  v_wins         bigint := 0;
  v_triggered    integer := 0;
  v_xp_per_entry bigint := 0;
  v_xp_per_trig  bigint := 0;
  v_xp_sources   jsonb;
  v_contest_all_final boolean;
BEGIN
  SELECT * INTO v_entry FROM public.contest_entry WHERE id = p_entry_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_contest FROM public.contest WHERE id = v_entry.contest_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_user_id   := v_entry.user_id;
  v_season_id := v_entry.season_id;

  FOR v_slot IN
    SELECT s.id AS slot_id, s.starter_card_id, s.live_fp, s.token_application_id
    FROM public.contest_lineup_slot s
    WHERE s.contest_entry_id = p_entry_id
      AND s.starter_card_id IS NOT NULL
      AND s.contract_play_consumed = false
  LOOP
    UPDATE public.contest_lineup_slot
    SET final_fp               = v_slot.live_fp,
        final_card_id          = COALESCE(final_card_id, v_slot.starter_card_id),
        contract_play_consumed = true
    WHERE id = v_slot.slot_id;

    UPDATE public.card
    SET career_fp_total = career_fp_total + v_slot.live_fp
    WHERE id = v_slot.starter_card_id;

    UPDATE public.card
    SET contract_plays_remaining = GREATEST(contract_plays_remaining - 1, 0)
    WHERE id = v_slot.starter_card_id;
  END LOOP;

  -- Tokens are one-time use. Any token applied in this contest gets
  -- consumed at finalize, regardless of whether it triggered.
  UPDATE public.token t
  SET consumed_at = NOW(),
      applied_to_card_id = NULL,
      applied_to_contest_id = NULL,
      updated_at = NOW()
  FROM public.token_application ta
  WHERE t.id = ta.token_id
    AND ta.contest_id = v_entry.contest_id
    AND ta.user_id = v_user_id
    AND t.consumed_at IS NULL;

  UPDATE public.card c
  SET applied_token_id = NULL,
      updated_at       = NOW()
  FROM public.token_application ta
  WHERE c.id = ta.card_id
    AND ta.contest_id = v_entry.contest_id
    AND ta.user_id = v_user_id
    AND c.applied_token_id IS NOT NULL;

  SELECT COALESCE(SUM(final_fp), 0) INTO v_entry_final
  FROM public.contest_lineup_slot
  WHERE contest_entry_id = p_entry_id;

  UPDATE public.contest_entry
  SET final_score = v_entry_final
  WHERE id = p_entry_id
    AND final_score IS DISTINCT FROM v_entry_final;

  INSERT INTO public.team_milestone_state (user_id, season_id)
  VALUES (v_user_id, v_season_id)
  ON CONFLICT (user_id, season_id) DO NOTHING;

  SELECT
    COUNT(*) FILTER (WHERE ge.event_type IN ('mlb.batter.hit','mlb.batter.home_run')),
    COUNT(*) FILTER (WHERE ge.event_type = 'mlb.batter.home_run'),
    COUNT(*) FILTER (WHERE ge.event_type = 'mlb.batter.stolen_base')
  INTO v_hits, v_hrs, v_sbs
  FROM public.contest_lineup_slot s
  JOIN public.card c        ON c.id = s.starter_card_id
  JOIN public.game_event ge ON ge.batter_player_id = c.player_id
                           AND ge.game_id = ANY(v_contest.included_game_ids)
  WHERE s.contest_entry_id = p_entry_id
    AND s.starter_card_id IS NOT NULL;

  SELECT COUNT(*)
  INTO v_wins
  FROM public.contest_lineup_slot s
  JOIN public.card c        ON c.id = s.starter_card_id
  JOIN public.game_event ge ON ge.pitcher_player_id = c.player_id
                           AND ge.game_id = ANY(v_contest.included_game_ids)
                           AND ge.event_type = 'mlb.game.pitcher_win'
  WHERE s.contest_entry_id = p_entry_id
    AND s.starter_card_id IS NOT NULL;

  IF v_hits > 0 OR v_hrs > 0 OR v_sbs > 0 OR v_wins > 0 THEN
    UPDATE public.team_milestone_state
    SET hits          = hits + v_hits,
        home_runs     = home_runs + v_hrs,
        stolen_bases  = stolen_bases + v_sbs,
        pitching_wins = pitching_wins + v_wins,
        updated_at    = now()
    WHERE user_id = v_user_id AND season_id = v_season_id;
  END IF;

  PERFORM public._award_milestone_tiers(v_user_id, v_season_id);

  SELECT (manager_xp_sources->'per_event')
  INTO v_xp_sources
  FROM public.economy_config
  WHERE effective_from <= now()
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_xp_sources IS NOT NULL THEN
    v_xp_per_entry := COALESCE((v_xp_sources->>'contest_entry')::bigint, 0);
    v_xp_per_trig  := COALESCE((v_xp_sources->>'token_triggered')::bigint, 0);
  END IF;

  IF v_xp_per_entry > 0 THEN
    PERFORM public.grant_manager_xp(v_user_id, v_xp_per_entry, 'contest_entry');
  END IF;

  SELECT COUNT(*)::int
  INTO v_triggered
  FROM public.contest_lineup_slot s
  JOIN public.token_application ta ON ta.id = s.token_application_id
  WHERE s.contest_entry_id = p_entry_id
    AND ta.triggered = true;

  IF v_triggered > 0 AND v_xp_per_trig > 0 THEN
    PERFORM public.grant_manager_xp(v_user_id, v_xp_per_trig * v_triggered, 'token_triggered');
  END IF;

  UPDATE public.manager_account
  SET lifetime_fp               = lifetime_fp + v_entry_final::bigint,
      lifetime_tokens_triggered = lifetime_tokens_triggered + v_triggered,
      updated_at                = now()
  WHERE user_id = v_user_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.contest_entry
    WHERE contest_id = v_entry.contest_id AND status <> 'final'
  ) INTO v_contest_all_final;

  IF v_contest_all_final THEN
    PERFORM public.finalize_contest(v_entry.contest_id);
  END IF;
END;
$function$;


CREATE OR REPLACE FUNCTION public.apply_token(p_user_id uuid, p_token_id uuid, p_card_id uuid, p_contest_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_token   token;
  v_card    card;
  v_player  player;
  v_contest contest;
  v_app_id  uuid;
  v_is_pitcher_token boolean;
  v_slot_id uuid;
  v_stale_token token;
  v_stale_contest_status contest_status;
BEGIN
  SELECT * INTO v_token FROM public.token
  WHERE id = p_token_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_token: token not found / not owned' USING ERRCODE = 'P0002';
  END IF;
  IF v_token.applied_to_card_id IS NOT NULL THEN
    RAISE EXCEPTION 'apply_token: token already applied' USING ERRCODE = '23514';
  END IF;
  IF v_token.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'apply_token: token already consumed' USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.token_application WHERE token_id = p_token_id;
  IF FOUND THEN
    UPDATE public.contest_lineup_slot
    SET token_application_id = NULL
    WHERE token_application_id IN (
      SELECT id FROM public.token_application WHERE token_id = p_token_id
    );
    DELETE FROM public.token_application WHERE token_id = p_token_id;
  END IF;

  SELECT * INTO v_card FROM public.card
  WHERE id = p_card_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_token: card not found / not owned' USING ERRCODE = 'P0002';
  END IF;
  IF v_card.is_expired THEN
    RAISE EXCEPTION 'apply_token: card is expired' USING ERRCODE = '23514';
  END IF;

  -- Self-heal stale card.applied_token_id. One-time-use semantic
  -- (migration 0041): stale tokens from non-pending contests get
  -- CONSUMED rather than returned to the tray — they were already
  -- committed to that prior contest at game-start time.
  IF v_card.applied_token_id IS NOT NULL THEN
    SELECT * INTO v_stale_token FROM public.token
    WHERE id = v_card.applied_token_id FOR UPDATE;
    IF FOUND THEN
      v_stale_contest_status := NULL;
      IF v_stale_token.applied_to_contest_id IS NOT NULL THEN
        SELECT status INTO v_stale_contest_status
        FROM public.contest
        WHERE id = v_stale_token.applied_to_contest_id;
      END IF;

      IF v_stale_contest_status IS NULL OR v_stale_contest_status <> 'pending' THEN
        IF v_stale_token.consumed_at IS NULL THEN
          UPDATE public.token
          SET consumed_at = NOW(),
              applied_to_card_id = NULL,
              applied_to_contest_id = NULL,
              updated_at = NOW()
          WHERE id = v_stale_token.id;
        END IF;
        UPDATE public.contest_lineup_slot
        SET token_application_id = NULL
        WHERE token_application_id IN (
          SELECT id FROM public.token_application
          WHERE card_id = p_card_id
        );
        DELETE FROM public.token_application
        WHERE card_id = p_card_id
          AND (
            v_stale_token.applied_to_contest_id IS NULL
            OR contest_id = v_stale_token.applied_to_contest_id
          );
        UPDATE public.card
        SET applied_token_id = NULL, updated_at = NOW()
        WHERE id = p_card_id;
        v_card.applied_token_id := NULL;
      ELSE
        RAISE EXCEPTION 'apply_token: card already has a token' USING ERRCODE = '23514';
      END IF;
    ELSE
      UPDATE public.card
      SET applied_token_id = NULL, updated_at = NOW()
      WHERE id = p_card_id;
      v_card.applied_token_id := NULL;
    END IF;
  END IF;

  SELECT * INTO v_player FROM public.player WHERE id = v_card.player_id;
  v_is_pitcher_token := v_token.token_type IN (
    'strikeout_bonus'::token_type, 'quality_start_bonus'::token_type
  );
  IF v_is_pitcher_token AND NOT v_player.is_pitcher THEN
    RAISE EXCEPTION 'apply_token: pitcher token on a hitter' USING ERRCODE = '23514';
  END IF;
  IF NOT v_is_pitcher_token AND v_player.is_pitcher THEN
    RAISE EXCEPTION 'apply_token: hitter token on a pitcher' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_contest FROM public.contest WHERE id = p_contest_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_token: contest not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.id INTO v_slot_id
  FROM public.contest_lineup_slot s
  JOIN public.contest_entry ce ON ce.id = s.contest_entry_id
  WHERE ce.user_id = p_user_id
    AND ce.contest_id = p_contest_id
    AND s.starter_card_id = p_card_id
  LIMIT 1;
  IF v_slot_id IS NOT NULL AND public.is_slot_locked(v_slot_id) THEN
    RAISE EXCEPTION 'SLOT_LOCKED: slotted card cannot take a token — game has started'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.token_application (
    token_id, card_id, contest_id, user_id, bonus_fp_awarded
  ) VALUES (
    p_token_id, p_card_id, p_contest_id, p_user_id, 0
  )
  RETURNING id INTO v_app_id;

  UPDATE public.token
  SET applied_to_card_id = p_card_id,
      applied_to_contest_id = p_contest_id,
      updated_at = now()
  WHERE id = p_token_id;

  UPDATE public.card
  SET applied_token_id = p_token_id, updated_at = now()
  WHERE id = p_card_id;

  UPDATE public.contest_lineup_slot s
  SET token_application_id = v_app_id
  FROM public.contest_entry ce
  WHERE s.contest_entry_id = ce.id
    AND ce.user_id = p_user_id
    AND ce.contest_id = p_contest_id
    AND s.starter_card_id = p_card_id;

  RETURN v_app_id;
END;
$function$;
