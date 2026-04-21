-- ─────────────────────────────────────────────────────────────────────────
-- 0013_functions_resolution.sql — Phase 4 contest-entry resolution.
--
-- When an entry flips from submitted/live → final (via
-- mark_contest_entries_on_game_end, 0012), a bookkeeping pass lands:
--
--   1. live_score is copied to final_score (best-effort — a Phase-5
--      reconciliation cron using BDL box scores will overwrite this with
--      authoritative numbers).
--   2. Per starter slot:
--        - final_fp = live_fp
--        - contract_play_consumed = true
--        - card.career_fp_total += live_fp   (→ tier trigger may fire)
--        - card.contract_plays_remaining -= 1 (clamped ≥ 0; expiry trigger)
--   3. team_milestone_state counters (hits / home_runs / stolen_bases) are
--      incremented by aggregating game_event rows for the entry's
--      starters across the contest's included_game_ids. pitching_wins
--      stays 0 until the Phase-5 reconciliation cron lands (needs
--      winning_pitcher data not yet on game).
--   4. manager XP is awarded per economy_config.manager_xp_sources:
--        - contest_entry (always)
--        - token_triggered × (count of triggered slots)
--      Rank-based XP (contest_win / contest_top_10 / milestone_tier_hit)
--      stays deferred — rank lands in P4.7+'s contest-finalize pass and
--      milestones get their own award fn in P4.2.
--   5. manager_account.lifetime_fp += final_score.
--      manager_account.lifetime_tokens_triggered += triggered-slot count.
--      (lifetime_contests_won waits on rank computation.)
--
-- Existing triggers that already fire naturally from the writes above
-- and are intentionally left alone:
--   - card_tier_on_fp_change       (BEFORE UPDATE OF career_fp_total)
--   - card_expiry_on_plays_change  (BEFORE UPDATE OF contract_plays_remaining)
--   - contest_entry_season_fp_denorm (AFTER UPDATE OF final_score)
-- ─────────────────────────────────────────────────────────────────────────


-- ── _finalize_contest_entry ────────────────────────────────────────────
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

  -- ── 1 + 2) Copy live_fp → final_fp per slot, flip consumed flag,
  --          and bump career_fp / contract_plays on the card.
  FOR v_slot IN
    SELECT s.id          AS slot_id,
           s.starter_card_id,
           s.live_fp,
           s.token_application_id
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

  -- Entry final_score = sum of slot final_fp. Compute from freshly-updated
  -- slots (handles mid-function updates cleanly).
  SELECT COALESCE(SUM(final_fp), 0)
  INTO v_entry_final
  FROM public.contest_lineup_slot
  WHERE contest_entry_id = p_entry_id;

  UPDATE public.contest_entry
  SET final_score = v_entry_final
  WHERE id = p_entry_id
    AND final_score IS DISTINCT FROM v_entry_final;
  -- (triggers contest_entry_season_fp_denorm → bumps user_season_state.season_fp)

  -- ── 3) Milestone counters.
  -- hits  = singles + doubles + triples + home runs by any starter
  --         whose player produced a mlb.batter.hit / home_run event in
  --         a game included in this contest.
  -- home_runs, stolen_bases similar.
  -- Ensure team_milestone_state row exists for (user, season).
  INSERT INTO public.team_milestone_state (user_id, season_id)
  VALUES (v_user_id, v_season_id)
  ON CONFLICT (user_id, season_id) DO NOTHING;

  SELECT
    COUNT(*) FILTER (
      WHERE ge.event_type IN ('mlb.batter.hit', 'mlb.batter.home_run')
    ),
    COUNT(*) FILTER (WHERE ge.event_type = 'mlb.batter.home_run'),
    COUNT(*) FILTER (WHERE ge.event_type = 'mlb.batter.stolen_base')
  INTO v_hits, v_hrs, v_sbs
  FROM public.contest_lineup_slot s
  JOIN public.card c          ON c.id  = s.starter_card_id
  JOIN public.game_event ge   ON ge.batter_player_id = c.player_id
                             AND ge.game_id = ANY(v_contest.included_game_ids)
  WHERE s.contest_entry_id = p_entry_id
    AND s.starter_card_id IS NOT NULL;

  IF v_hits > 0 OR v_hrs > 0 OR v_sbs > 0 THEN
    UPDATE public.team_milestone_state
    SET hits         = hits + v_hits,
        home_runs    = home_runs + v_hrs,
        stolen_bases = stolen_bases + v_sbs,
        updated_at   = now()
    WHERE user_id = v_user_id
      AND season_id = v_season_id;
  END IF;

  -- pitching_wins: deferred to Phase 5 box-score reconciliation cron.

  -- ── 4) Manager XP.
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
    PERFORM public.grant_manager_xp(
      v_user_id,
      v_xp_per_trig * v_triggered,
      'token_triggered'
    );
  END IF;

  -- ── 5) lifetime_fp + lifetime_tokens_triggered on manager_account.
  UPDATE public.manager_account
  SET lifetime_fp                 = lifetime_fp + v_entry_final::bigint,
      lifetime_tokens_triggered   = lifetime_tokens_triggered + v_triggered,
      updated_at                  = now()
  WHERE user_id = v_user_id;
END;
$$;

ALTER FUNCTION public._finalize_contest_entry(uuid)
  SET search_path = public, pg_catalog;


-- ── contest_entry status trigger ───────────────────────────────────────
-- Fires once, when an entry's status flips to 'final'. Nested updates on
-- the same row (final_score, etc.) run inside the caller's transaction.
CREATE OR REPLACE FUNCTION public._on_contest_entry_final()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public._finalize_contest_entry(NEW.id);
  RETURN NEW;
END;
$$;

ALTER FUNCTION public._on_contest_entry_final()
  SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS contest_entry_finalize_trigger ON public.contest_entry;
CREATE TRIGGER contest_entry_finalize_trigger
  AFTER UPDATE OF status ON public.contest_entry
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'final')
  EXECUTE FUNCTION public._on_contest_entry_final();
