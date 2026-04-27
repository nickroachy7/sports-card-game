-- ─────────────────────────────────────────────────────────────────────────
-- Phase 56 §224. Live mirror of career_fp_total during a game.
--
-- Pre-§224, `card.career_fp_total` was only updated at entry-finalize
-- time (`_finalize_contest_entry` in 0013) via `+= live_fp`. The lineup
-- card front shows `career_fp_total`, so users couldn't watch their
-- card's lifetime number tick up during a live game — only the per-slot
-- `live_fp` (sidebar) updated in real time.
--
-- Decision: split the path:
--   - `_apply_game_event_to_lineups` (0012) now also adds `v_fp_delta`
--     to `card.career_fp_total` for any rostered card that scored on
--     the event. Same for token bonus FP.
--   - `_finalize_contest_entry` (0013) no longer does `+= live_fp` on
--     career_fp_total — that's already happened incrementally.
--
-- One-shot backfill: any non-final entry whose slots have non-zero
-- `live_fp` had their FP credited to the slot but NOT yet to
-- career_fp_total (under the old flow, that'd happen at finalize). To
-- avoid the next live event compounding on a stale base, catch up
-- career_fp_total for every non-final entry's starter card.
--
-- Net effect: career_fp_total now reflects the user's live total in
-- real time, the sidebar still shows today's slot FP (separate column),
-- and finalize is a no-op delta.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1) Update _apply_game_event_to_lineups to mirror career_fp_total ─
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
  -- 1) Batter credit
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
          AND ce.status IN ('submitted', 'live')
      LOOP
        UPDATE public.contest_lineup_slot
        SET live_fp = live_fp + v_fp_delta
        WHERE id = r.slot_id;

        UPDATE public.contest_entry
        SET live_score = live_score + v_fp_delta,
            updated_at = now()
        WHERE id = r.contest_entry_id;

        -- §224. Mirror onto the card's lifetime total. Realtime
        -- broadcasts the card UPDATE; LineupSlot + BenchCard pick it
        -- up via useLiveCardFp and re-render the lifetime number.
        UPDATE public.card
        SET career_fp_total = career_fp_total + v_fp_delta,
            updated_at = now()
        WHERE id = r.starter_card_id;

        -- Token evaluation (hitter tokens).
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

              -- §224. Mirror token bonus on lifetime too.
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

  -- 2) Pitcher credit
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
          AND ce.status IN ('submitted', 'live')
      LOOP
        UPDATE public.contest_lineup_slot
        SET live_fp = live_fp + v_fp_delta
        WHERE id = r.slot_id;

        UPDATE public.contest_entry
        SET live_score = live_score + v_fp_delta,
            updated_at = now()
        WHERE id = r.contest_entry_id;

        -- §224.
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


-- ── 2) Update _finalize_contest_entry: stop adding live_fp again ─────
-- The trigger already added it incrementally. We DO still need to
-- copy live_fp → final_fp on the slot, flip contract_play_consumed,
-- and decrement contract_plays_remaining. The single change vs 0013
-- is dropping the `+= live_fp` on career_fp_total.
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
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_contest FROM public.contest WHERE id = v_entry.contest_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_user_id   := v_entry.user_id;
  v_season_id := v_entry.season_id;

  -- Per-slot bookkeeping. §224: career_fp_total no longer touched here
  -- (already mirrored incrementally by the live trigger).
  FOR v_slot IN
    SELECT s.id AS slot_id,
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

    -- §224. NO `career_fp_total += live_fp` here — the live trigger
    -- already mirrored every event into career_fp_total incrementally.

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

  -- Milestone counters (unchanged from 0013).
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

  -- Manager XP (unchanged).
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

  -- lifetime_fp + tokens_triggered on manager_account (unchanged).
  UPDATE public.manager_account
  SET lifetime_fp                 = lifetime_fp + v_entry_final::bigint,
      lifetime_tokens_triggered   = lifetime_tokens_triggered + v_triggered,
      updated_at                  = now()
  WHERE user_id = v_user_id;
END;
$$;

ALTER FUNCTION public._finalize_contest_entry(uuid)
  SET search_path = public, pg_catalog;


-- ── 3) One-shot backfill: catch up career_fp_total for non-final ─────
-- entries' rostered cards with non-zero live_fp. Without this, the
-- next live event would compound on a stale base (career_fp_total
-- still reflects only the pre-Phase-56 finalize-time math).
DO $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH catchup AS (
    SELECT s.starter_card_id, COALESCE(SUM(s.live_fp), 0) AS delta
    FROM public.contest_lineup_slot s
    JOIN public.contest_entry ce ON ce.id = s.contest_entry_id
    WHERE ce.status <> 'final'
      AND s.starter_card_id IS NOT NULL
      AND s.live_fp > 0
    GROUP BY s.starter_card_id
  )
  UPDATE public.card c
  SET career_fp_total = career_fp_total + ct.delta,
      updated_at      = now()
  FROM catchup ct
  WHERE c.id = ct.starter_card_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'P56 backfill: % cards caught up to live career_fp_total', v_count;
END;
$$;
