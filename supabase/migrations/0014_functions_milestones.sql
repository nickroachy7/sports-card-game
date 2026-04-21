-- ─────────────────────────────────────────────────────────────────────────
-- 0014_functions_milestones.sql — milestone tier-crossing awards.
--
-- _award_milestone_tiers(user_id, season_id) walks the user's
-- team_milestone_state counters, compares them against the
-- economy_config.milestone_tiers thresholds, and for each
-- (milestone_key, tier) crossing that hasn't yet been recorded:
--   - inserts a team_milestone_award row (audit)
--   - credits the coin bundle via credit_coins
--   - grants XP via grant_manager_xp
--   - appends the tier index to the per-milestone tiers_hit array to
--     make the award idempotent.
--
-- Bonus token grants are config-driven via milestone_rewards[*].tokens
-- (not seeded today — stub left in place so tuning can turn it on
-- without code changes).
--
-- _finalize_contest_entry (from 0013) is replaced so it calls this at
-- the end — any counter bump that crosses a new threshold awards
-- within the same transaction.
-- ─────────────────────────────────────────────────────────────────────────


-- ── _award_milestone_tiers ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._award_milestone_tiers(
  p_user_id   uuid,
  p_season_id uuid
)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_state      public.team_milestone_state;
  v_config     public.economy_config;
  v_key        text;
  v_count      bigint;
  v_thresholds jsonb;
  v_rewards    jsonb;
  v_tiers_hit  integer[];
  v_tier_index integer;
  v_threshold  numeric;
  v_reward     jsonb;
  v_coin       bigint;
  v_xp         bigint;
  v_awarded    integer := 0;
BEGIN
  SELECT * INTO v_state
  FROM public.team_milestone_state
  WHERE user_id = p_user_id AND season_id = p_season_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_config := public.get_active_economy_config();
  IF v_config IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_key IN SELECT unnest(ARRAY['hits','home_runs','stolen_bases','pitching_wins'])
  LOOP
    v_thresholds := v_config.milestone_tiers -> v_key;
    v_rewards    := v_config.milestone_rewards -> v_key;
    IF v_thresholds IS NULL OR jsonb_typeof(v_thresholds) <> 'array' THEN
      CONTINUE;
    END IF;

    CASE v_key
      WHEN 'hits'          THEN v_count := v_state.hits;           v_tiers_hit := v_state.hits_tiers_hit;
      WHEN 'home_runs'     THEN v_count := v_state.home_runs;      v_tiers_hit := v_state.home_runs_tiers_hit;
      WHEN 'stolen_bases'  THEN v_count := v_state.stolen_bases;   v_tiers_hit := v_state.stolen_bases_tiers_hit;
      WHEN 'pitching_wins' THEN v_count := v_state.pitching_wins;  v_tiers_hit := v_state.pitching_wins_tiers_hit;
    END CASE;

    FOR v_tier_index IN 1..jsonb_array_length(v_thresholds) LOOP
      v_threshold := (v_thresholds ->> (v_tier_index - 1))::numeric;
      CONTINUE WHEN v_count < v_threshold;
      CONTINUE WHEN v_tier_index = ANY(COALESCE(v_tiers_hit, '{}'::int[]));

      v_reward := v_rewards -> (v_tier_index - 1);
      v_coin := COALESCE((v_reward->>'coins')::bigint, 0);
      v_xp   := COALESCE((v_reward->>'xp')::bigint, 0);

      -- Audit row. Unique (user, season, key, tier).
      INSERT INTO public.team_milestone_award
        (user_id, season_id, milestone_key, tier, coin_reward, xp_reward)
      VALUES
        (p_user_id, p_season_id, v_key, v_tier_index, v_coin, v_xp)
      ON CONFLICT (user_id, season_id, milestone_key, tier) DO NOTHING;

      IF v_coin > 0 THEN
        PERFORM public.credit_coins(
          p_user_id, p_season_id, v_coin,
          'milestone_reward'::coin_reason,
          'team_milestone_award', NULL,
          v_key || ' T' || v_tier_index::text
        );
      END IF;

      IF v_xp > 0 THEN
        PERFORM public.grant_manager_xp(p_user_id, v_xp, 'milestone_tier_hit');
      END IF;

      -- Append the tier index to the correct tiers_hit column so this
      -- award is never paid twice.
      CASE v_key
        WHEN 'hits' THEN
          UPDATE public.team_milestone_state
          SET hits_tiers_hit = hits_tiers_hit || v_tier_index,
              updated_at = now()
          WHERE user_id = p_user_id AND season_id = p_season_id;
        WHEN 'home_runs' THEN
          UPDATE public.team_milestone_state
          SET home_runs_tiers_hit = home_runs_tiers_hit || v_tier_index,
              updated_at = now()
          WHERE user_id = p_user_id AND season_id = p_season_id;
        WHEN 'stolen_bases' THEN
          UPDATE public.team_milestone_state
          SET stolen_bases_tiers_hit = stolen_bases_tiers_hit || v_tier_index,
              updated_at = now()
          WHERE user_id = p_user_id AND season_id = p_season_id;
        WHEN 'pitching_wins' THEN
          UPDATE public.team_milestone_state
          SET pitching_wins_tiers_hit = pitching_wins_tiers_hit || v_tier_index,
              updated_at = now()
          WHERE user_id = p_user_id AND season_id = p_season_id;
      END CASE;

      v_awarded := v_awarded + 1;
    END LOOP;
  END LOOP;

  RETURN v_awarded;
END;
$$;

ALTER FUNCTION public._award_milestone_tiers(uuid, uuid)
  SET search_path = public, pg_catalog;


-- ── _finalize_contest_entry (refresh) — append milestone-award call ────
-- The body is identical to 0013 except for the new PERFORM at step 3b.
CREATE OR REPLACE FUNCTION public._finalize_contest_entry(
  p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql AS $$
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
  v_triggered    integer := 0;
  v_xp_per_entry bigint := 0;
  v_xp_per_trig  bigint := 0;
  v_xp_sources   jsonb;
BEGIN
  SELECT * INTO v_entry FROM public.contest_entry WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_contest FROM public.contest WHERE id = v_entry.contest_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

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

  SELECT COALESCE(SUM(final_fp), 0)
  INTO v_entry_final
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

  IF v_hits > 0 OR v_hrs > 0 OR v_sbs > 0 THEN
    UPDATE public.team_milestone_state
    SET hits         = hits + v_hits,
        home_runs    = home_runs + v_hrs,
        stolen_bases = stolen_bases + v_sbs,
        updated_at   = now()
    WHERE user_id = v_user_id AND season_id = v_season_id;
  END IF;

  -- NEW in 0014: pay out any newly-crossed milestone tiers.
  PERFORM public._award_milestone_tiers(v_user_id, v_season_id);

  -- Manager XP (baseline + per-token-triggered).
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
END;
$$;

ALTER FUNCTION public._finalize_contest_entry(uuid)
  SET search_path = public, pg_catalog;
