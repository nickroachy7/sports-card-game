-- 0044 — _finalize_contest_entry marks un-triggered token apps "missed".
--
-- `_apply_game_event_to_lineups` flips `token_application.triggered =
-- true` the instant the condition fires during a live game. The
-- symmetric `triggered = false` was never set anywhere — any
-- application that didn't fire stayed `NULL`, making it indistinguishable
-- from a still-pending application.
--
-- Fix: when an entry finalizes, any still-null applied-token gets
-- `triggered = false`. Simple UPDATE added before the token-consumption
-- pass so the final state is consistent: hit (true) / missed (false)
-- / never-applied (no row).
--
-- Also carries the token-consumption + card/token ref cleanup from
-- migration 0041 so this is the full canonical definition after P40.

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

  -- Phase 40 (§128): any applied token still null resolves to missed.
  UPDATE public.token_application ta
  SET triggered = false
  FROM public.contest_lineup_slot s
  WHERE s.contest_entry_id = p_entry_id
    AND s.token_application_id = ta.id
    AND ta.triggered IS NULL;

  -- Tokens are one-time use (migration 0041). Consume all applied
  -- tokens, clear token / card refs.
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
