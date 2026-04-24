-- ─────────────────────────────────────────────────────────────────────────
-- 0046_vault_multiplier_and_plays_used.sql — Phase 41 foundation.
--
-- Polish spec §133–§139 introduces the vault multiplier: a card vaulted
-- after only one big game is rarer than a card ground through a full
-- season. Final vault score = career_fp_total × multiplier(plays_used).
--
-- This migration lays the groundwork:
--   1. `public.card_vault_multiplier(plays int) returns numeric` — the
--      authoritative curve from the spec's §133 table.
--   2. `public.tier_play_budget(tier card_tier) returns int` — the
--      per-tier play budget (5 / 15 / 40 / 999) from §134.
--   3. `card.plays_used` column — incremented per consumed slot in
--      `_finalize_contest_entry`. Tracks actual plays regardless of
--      which tier budget the card currently has.
--   4. Backfill `card.plays_used` from historical
--      `contest_lineup_slot.contract_play_consumed = true` rows.
--   5. `vault_entry.plays_used`, `vault_entry.multiplier`, and
--      `vault_entry.vault_score` columns.
--   6. Backfill existing vault_entry rows by counting historical
--      consumed slots per (card_id, user_id, season_id).
--   7. Update `_finalize_contest_entry` to also increment
--      `card.plays_used` alongside the existing `contract_plays_remaining`
--      decrement.
--
-- Dependencies: this migration modifies the fn body from 0017; if 0017
-- is later revised, review this migration for drift.
-- ─────────────────────────────────────────────────────────────────────────


-- ── 1) card_vault_multiplier --------------------------------------------
CREATE OR REPLACE FUNCTION public.card_vault_multiplier(p_plays integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_plays <= 0  THEN 0.0
    WHEN p_plays = 1   THEN 5.0
    WHEN p_plays = 2   THEN 3.5
    WHEN p_plays = 3   THEN 2.5
    WHEN p_plays <= 5  THEN 1.8
    WHEN p_plays <= 10 THEN 1.3
    WHEN p_plays <= 20 THEN 1.1
    ELSE 1.0
  END::numeric;
$$;

ALTER FUNCTION public.card_vault_multiplier(integer)
  SET search_path = public, pg_catalog;


-- ── 2) tier_play_budget --------------------------------------------------
-- Returns the play budget for a given tier. Diamond is effectively
-- unlimited; we return 999 as the sentinel "practically unlimited"
-- so finite-int columns behave sanely. UI may render ∞.
CREATE OR REPLACE FUNCTION public.tier_play_budget(p_tier card_tier)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
    WHEN 'bronze'  THEN 5
    WHEN 'silver'  THEN 15
    WHEN 'gold'    THEN 40
    WHEN 'diamond' THEN 999
  END::int;
$$;

ALTER FUNCTION public.tier_play_budget(card_tier)
  SET search_path = public, pg_catalog;


-- ── 3) card.plays_used ---------------------------------------------------
ALTER TABLE public.card
  ADD COLUMN IF NOT EXISTS plays_used integer NOT NULL DEFAULT 0;


-- ── 4) Backfill card.plays_used from historical consumed slots ----------
-- For each card, count the number of lineup slots where the card was a
-- starter and contract_play_consumed=true. That's the canonical history
-- of "actual plays" independent of any tier budget.
UPDATE public.card c
SET plays_used = sub.n
FROM (
  SELECT s.starter_card_id AS card_id, COUNT(*) AS n
  FROM public.contest_lineup_slot s
  WHERE s.starter_card_id IS NOT NULL
    AND s.contract_play_consumed = true
  GROUP BY s.starter_card_id
) sub
WHERE c.id = sub.card_id
  AND c.plays_used = 0;


-- ── 5) vault_entry schema additions --------------------------------------
-- plays_used / multiplier / vault_score snapshot the multiplier math
-- at the moment the vault_entry row is written (ceremony time). They
-- are required columns; legacy rows are backfilled in step 6.
ALTER TABLE public.vault_entry
  ADD COLUMN IF NOT EXISTS plays_used integer;

ALTER TABLE public.vault_entry
  ADD COLUMN IF NOT EXISTS multiplier numeric(6, 2);

ALTER TABLE public.vault_entry
  ADD COLUMN IF NOT EXISTS vault_score numeric(12, 2);


-- ── 6) Backfill vault_entry rows ---------------------------------------
-- For each existing vault_entry row, compute plays_used from historical
-- slot data for the same (user_id, season_id, card_id). A legacy row
-- with no slot history (edge case in test data) gets plays_used=0, which
-- yields multiplier=0 and vault_score=0 — a loud signal that the row
-- predates the feature rather than a misleading inflated number.
UPDATE public.vault_entry ve
SET plays_used = COALESCE(sub.n, 0)
FROM (
  SELECT
    s.starter_card_id AS card_id,
    ce.user_id,
    ce.season_id,
    COUNT(*) AS n
  FROM public.contest_lineup_slot s
  JOIN public.contest_entry ce ON ce.id = s.contest_entry_id
  WHERE s.starter_card_id IS NOT NULL
    AND s.contract_play_consumed = true
  GROUP BY s.starter_card_id, ce.user_id, ce.season_id
) sub
WHERE ve.card_id = sub.card_id
  AND ve.user_id = sub.user_id
  AND ve.season_id = sub.season_id
  AND ve.plays_used IS NULL;

-- Any remaining NULLs (no slot history at all) fall to 0.
UPDATE public.vault_entry
SET plays_used = 0
WHERE plays_used IS NULL;

-- Now compute multiplier + vault_score from plays_used + final_fp.
UPDATE public.vault_entry
SET multiplier  = public.card_vault_multiplier(plays_used),
    vault_score = final_fp * public.card_vault_multiplier(plays_used)
WHERE multiplier IS NULL OR vault_score IS NULL;

-- Enforce NOT NULL now that every row has a value.
ALTER TABLE public.vault_entry
  ALTER COLUMN plays_used SET NOT NULL;

ALTER TABLE public.vault_entry
  ALTER COLUMN multiplier SET NOT NULL;

ALTER TABLE public.vault_entry
  ALTER COLUMN vault_score SET NOT NULL;


-- ── 7) Update _finalize_contest_entry to track plays_used ---------------
-- This redefinition mirrors 0017 exactly with the single addition of
-- `plays_used = plays_used + 1` alongside the plays-remaining decrement.
-- Kept inline rather than carving a helper so the per-slot bookkeeping
-- stays in one place.
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

    -- P41.2: track actual plays-used independent of tier budget, so the
    -- vault multiplier has a tier-stable signal of "games this card was
    -- played in."
    UPDATE public.card
    SET contract_plays_remaining = GREATEST(contract_plays_remaining - 1, 0),
        plays_used               = plays_used + 1
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
