-- ─────────────────────────────────────────────────────────────────────────
-- 0017_functions_contest_finalize.sql — contest-level rank + payout.
--
-- finalize_contest(contest_id):
--   1. Requires every entry's status to already be 'final'
--      (flipped per-game-end by mark_contest_entries_on_game_end and
--      bookkept by _finalize_contest_entry). Returns 0 if not.
--   2. Computes final_rank for every entry via
--      RANK() OVER (ORDER BY final_score DESC).
--   3. Applies contest.prize_pool_payout — a jsonb map of
--      {rank: coins} — via credit_coins, stamping coin_payout on the
--      entry.
--   4. Grants rank-based manager XP per
--      economy_config.per_event: contest_win for rank 1,
--      contest_top_10 for ranks 2..10.
--   5. Bumps manager_account.lifetime_contests_won and
--      user_season_state.season_contests_won for rank 1.
--   6. Flips contest.status to 'final'.
--
-- _finalize_contest_entry (refresh): on the last per-entry resolution
-- that leaves a contest with all entries final, call
-- finalize_contest(contest_id) in-trigger so there's no external
-- orchestration to run.
-- ─────────────────────────────────────────────────────────────────────────


-- ── finalize_contest ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_contest(
  p_contest_id uuid
)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_contest      public.contest;
  v_cfg          public.economy_config;
  v_xp_win       bigint  := 0;
  v_xp_top_10    bigint  := 0;
  v_xp_sources   jsonb;
  v_payout_map   jsonb;
  v_processed    integer := 0;
  v_entry        record;
BEGIN
  SELECT * INTO v_contest FROM public.contest WHERE id = p_contest_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_contest.status = 'final' THEN
    RETURN 0;
  END IF;

  -- All entries must already be final. If any aren't, bail and let the
  -- next per-entry resolution re-trigger us.
  IF EXISTS (
    SELECT 1 FROM public.contest_entry
    WHERE contest_id = p_contest_id AND status <> 'final'
  ) THEN
    RETURN 0;
  END IF;

  -- XP amounts + payout map, from the active config.
  v_cfg := public.get_active_economy_config();
  v_xp_sources := (v_cfg.manager_xp_sources)->'per_event';
  IF v_xp_sources IS NOT NULL THEN
    v_xp_win    := COALESCE((v_xp_sources->>'contest_win')::bigint, 0);
    v_xp_top_10 := COALESCE((v_xp_sources->>'contest_top_10')::bigint, 0);
  END IF;
  v_payout_map := COALESCE(v_contest.prize_pool_payout, '{}'::jsonb);

  -- Compute rank across all entries, then pay out + grant XP per row.
  FOR v_entry IN
    WITH ranked AS (
      SELECT id, user_id, final_score,
             RANK() OVER (ORDER BY final_score DESC) AS rank
      FROM public.contest_entry
      WHERE contest_id = p_contest_id
    )
    SELECT * FROM ranked
  LOOP
    UPDATE public.contest_entry
    SET final_rank = v_entry.rank
    WHERE id = v_entry.id;

    -- Coin payout if the rank is listed in the prize map.
    DECLARE
      v_rank_payout bigint;
    BEGIN
      v_rank_payout := COALESCE(
        (v_payout_map->>(v_entry.rank::text))::bigint,
        0
      );
      IF v_rank_payout > 0 THEN
        PERFORM public.credit_coins(
          v_entry.user_id, v_contest.season_id, v_rank_payout,
          'contest_payout'::coin_reason,
          'contest_entry', v_entry.id,
          'Contest rank ' || v_entry.rank::text
        );
        UPDATE public.contest_entry
        SET coin_payout = v_rank_payout
        WHERE id = v_entry.id;
      END IF;
    END;

    -- Rank-based XP.
    IF v_entry.rank = 1 AND v_xp_win > 0 THEN
      PERFORM public.grant_manager_xp(v_entry.user_id, v_xp_win, 'contest_win');
      UPDATE public.manager_account
      SET lifetime_contests_won = lifetime_contests_won + 1,
          updated_at            = now()
      WHERE user_id = v_entry.user_id;
      UPDATE public.user_season_state
      SET season_contests_won = season_contests_won + 1,
          updated_at          = now()
      WHERE user_id = v_entry.user_id
        AND season_id = v_contest.season_id;
    ELSIF v_entry.rank BETWEEN 2 AND 10 AND v_xp_top_10 > 0 THEN
      PERFORM public.grant_manager_xp(v_entry.user_id, v_xp_top_10, 'contest_top_10');
    END IF;

    v_processed := v_processed + 1;
  END LOOP;

  UPDATE public.contest
  SET status     = 'final',
      updated_at = now()
  WHERE id = p_contest_id;

  RETURN v_processed;
END;
$$;

ALTER FUNCTION public.finalize_contest(uuid)
  SET search_path = public, pg_catalog;


-- ── _finalize_contest_entry refresh ────────────────────────────────────
-- Only change vs 0014: after per-entry bookkeeping, check whether every
-- entry in the contest is now 'final', and if so fire finalize_contest.
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

  IF v_hits > 0 OR v_hrs > 0 OR v_sbs > 0 THEN
    UPDATE public.team_milestone_state
    SET hits         = hits + v_hits,
        home_runs    = home_runs + v_hrs,
        stolen_bases = stolen_bases + v_sbs,
        updated_at   = now()
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

  -- NEW in 0017: if this entry finishing left the contest fully final,
  -- run the contest-level finalize pass inline. Idempotent via
  -- finalize_contest's own guards.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.contest_entry
    WHERE contest_id = v_entry.contest_id AND status <> 'final'
  ) INTO v_contest_all_final;

  IF v_contest_all_final THEN
    PERFORM public.finalize_contest(v_entry.contest_id);
  END IF;
END;
$$;

ALTER FUNCTION public._finalize_contest_entry(uuid)
  SET search_path = public, pg_catalog;
