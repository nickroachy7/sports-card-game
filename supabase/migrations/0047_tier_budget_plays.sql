-- ─────────────────────────────────────────────────────────────────────────
-- 0047_tier_budget_plays.sql — Phase 41: tier-based contract budgets.
--
-- Polish spec §134 replaces fixed 15-play contracts with tier budgets:
--   Bronze  =  5 plays
--   Silver  = 15
--   Gold    = 40
--   Diamond = 999 (effectively unlimited)
--
-- Two behaviours change:
--
--   1. open_pack — newly-minted cards start Bronze with 5 plays
--      (previously 15, via column default). Uses tier_play_budget().
--
--   2. recompute_card_tier — when a tier-up happens (BEFORE UPDATE OF
--      career_fp_total), the card's contract_plays_remaining is
--      topped up to the new tier's budget via GREATEST(current, new).
--      Never decreases — if a card has leftover plays from a previous
--      tier they stay usable until consumed.
--
-- The column DEFAULT on card.contract_plays_remaining stays at 15 so
-- test fixtures that hand-insert cards without explicit plays still
-- work. open_pack (the canonical mint path) sets the tier-appropriate
-- value explicitly.
--
-- Base revision for open_pack is 0023 (dupe quick-sell deferred to
-- reveal). Only delta vs 0023 is the tier_play_budget() value on the
-- INSERT INTO card.
-- ─────────────────────────────────────────────────────────────────────────


-- ── 1) recompute_card_tier — refill on tier-up ------------------------
CREATE OR REPLACE FUNCTION public.recompute_card_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  thresholds jsonb;
  fp numeric;
  new_tier card_tier;
BEGIN
  SELECT tier_fp_thresholds INTO thresholds
  FROM public.economy_config
  WHERE effective_from <= now()
  ORDER BY effective_from DESC
  LIMIT 1;

  IF thresholds IS NULL THEN
    RETURN NEW;
  END IF;

  fp := NEW.career_fp_total;
  new_tier := CASE
    WHEN fp >= (thresholds->>'diamond')::numeric THEN 'diamond'
    WHEN fp >= (thresholds->>'gold')::numeric    THEN 'gold'
    WHEN fp >= (thresholds->>'silver')::numeric  THEN 'silver'
    ELSE 'bronze'
  END::card_tier;

  NEW.current_tier := new_tier;

  -- P41.5: on UPDATE where the tier changed, top up plays to the
  -- new tier's budget. GREATEST preserves any leftover plays from
  -- the previous tier rather than shrinking them.
  IF TG_OP = 'UPDATE' AND new_tier IS DISTINCT FROM OLD.current_tier THEN
    NEW.contract_plays_remaining := GREATEST(
      NEW.contract_plays_remaining,
      public.tier_play_budget(new_tier)
    );
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.recompute_card_tier()
  SET search_path = public, pg_catalog;


-- ── 2) open_pack — Bronze budget on mint ------------------------------
-- Base: 0023 (deferred dupe quick-sell). Delta: INSERT INTO card now
-- explicitly sets contract_plays_remaining = tier_play_budget('bronze').
CREATE OR REPLACE FUNCTION public.open_pack(
  p_user_id   uuid,
  p_pack_type pack_type
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_season_id        uuid;
  v_state            user_season_state;
  v_cfg              record;
  v_pack_size        integer;
  v_pack_cost        bigint;
  v_token_rate       numeric;
  v_collection_cap   integer;
  v_current_count    integer;
  v_opening_id       uuid;
  v_card_ids         uuid[] := '{}'::uuid[];
  v_card_results     jsonb  := '[]'::jsonb;
  v_dupe_player_ids  uuid[] := '{}'::uuid[];
  v_token_ids        uuid[] := '{}'::uuid[];
  v_balance          bigint;
  v_new_card_id      uuid;
  v_new_token_id     uuid;
  v_token_types      text[] := ARRAY['hr_bonus','multi_hit_bonus','sb_bonus','strikeout_bonus','quality_start_bonus'];
  v_token_bonuses    jsonb;
  v_chosen_type      text;
  v_now              timestamptz := now();
  v_is_dupe          boolean;
  v_existing_card_id uuid;
  v_bronze_plays     integer := public.tier_play_budget('bronze');
  r                  record;
  i                  integer;
BEGIN
  SELECT id INTO v_season_id FROM public.season WHERE status = 'active' LIMIT 1;
  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'open_pack: no active season';
  END IF;

  PERFORM public._upsert_user_season_state(p_user_id, v_season_id);
  SELECT * INTO v_state FROM public.user_season_state
  WHERE user_id = p_user_id AND season_id = v_season_id
  FOR UPDATE;

  SELECT collection_cap, pack_sizes, pack_prices_coins, token_drop_rates,
         quick_sell_values, token_bonus_fp
  INTO v_cfg FROM public.get_active_economy_config();

  v_collection_cap := v_cfg.collection_cap::int;
  v_pack_size      := ((v_cfg.pack_sizes)->>p_pack_type::text)::int;
  v_pack_cost      := COALESCE(((v_cfg.pack_prices_coins)->>p_pack_type::text)::bigint, 0);
  v_token_rate     := COALESCE(((v_cfg.token_drop_rates)->>p_pack_type::text)::numeric, 0);
  v_token_bonuses  := v_cfg.token_bonus_fp;

  SELECT count(*) INTO v_current_count
  FROM public.card WHERE user_id = p_user_id AND is_vaulted = false;

  IF v_current_count + v_pack_size > v_collection_cap THEN
    RAISE EXCEPTION 'open_pack: collection at cap (have %, cap %, pack +%s)',
      v_current_count, v_collection_cap, v_pack_size
      USING ERRCODE = '53100';
  END IF;

  IF p_pack_type = 'daily' THEN
    IF v_state.daily_pack_claimed_at IS NOT NULL
       AND v_now - v_state.daily_pack_claimed_at < INTERVAL '24 hours' THEN
      RAISE EXCEPTION 'open_pack: daily pack already claimed'
        USING ERRCODE = '23505';
    END IF;
    v_pack_cost := 0;
  END IF;

  IF v_pack_cost > 0 THEN
    v_balance := public.spend_coins(
      p_user_id, v_season_id, v_pack_cost,
      'pack_purchase'::coin_reason, NULL, NULL,
      format('%s pack purchase', p_pack_type)
    );
  ELSE
    v_balance := v_state.coins;
  END IF;

  INSERT INTO public.pack_opening (user_id, season_id, pack_type, coin_cost)
  VALUES (p_user_id, v_season_id, p_pack_type, v_pack_cost)
  RETURNING id INTO v_opening_id;

  FOR i IN 1..v_pack_size LOOP
    v_is_dupe := false;
    v_existing_card_id := NULL;

    SELECT p.id INTO r
    FROM public.player p
    WHERE p.is_active_40_man = true
      AND p.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.card c
        WHERE c.user_id = p_user_id
          AND c.player_id = p.id
          AND c.is_vaulted = false
      )
    ORDER BY random()
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT p.id INTO r
      FROM public.player p
      WHERE p.is_active_40_man = true AND p.status = 'active'
      ORDER BY random() LIMIT 1;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;
      v_is_dupe := true;
      SELECT c.id INTO v_existing_card_id
      FROM public.card c
      WHERE c.user_id = p_user_id
        AND c.player_id = r.id
        AND c.is_vaulted = false
      ORDER BY c.career_fp_total ASC, c.acquired_at ASC
      LIMIT 1;
      v_dupe_player_ids := array_append(v_dupe_player_ids, r.id);
    END IF;

    -- P41.4: tier-based budget on mint. All new cards enter Bronze
    -- (career_fp_total = 0 → recompute_card_tier resolves to bronze),
    -- so we set contract_plays_remaining = 5 explicitly rather than
    -- rely on the column default.
    INSERT INTO public.card (
      user_id, player_id, season_id, acquired_pack_opening_id,
      contract_plays_remaining
    )
    VALUES (
      p_user_id, r.id, v_season_id, v_opening_id,
      v_bronze_plays
    )
    RETURNING id INTO v_new_card_id;
    v_card_ids := array_append(v_card_ids, v_new_card_id);

    v_card_results := v_card_results || jsonb_build_array(
      jsonb_build_object(
        'card_id',          v_new_card_id,
        'is_dupe',          v_is_dupe,
        'existing_card_id', v_existing_card_id
      )
    );
  END LOOP;

  FOR i IN 1..v_pack_size LOOP
    IF random() < v_token_rate THEN
      v_chosen_type := v_token_types[1 + floor(random() * array_length(v_token_types, 1))::int];
      INSERT INTO public.token (
        user_id, season_id, token_type, bonus_fp, acquired_source
      ) VALUES (
        p_user_id, v_season_id, v_chosen_type::token_type,
        COALESCE((v_token_bonuses->>v_chosen_type)::numeric, 0),
        format('pack_%s', p_pack_type::text)
      )
      RETURNING id INTO v_new_token_id;
      v_token_ids := array_append(v_token_ids, v_new_token_id);
    END IF;
  END LOOP;

  UPDATE public.pack_opening
  SET cards_granted        = v_card_ids,
      duplicate_player_ids = v_dupe_player_ids,
      coins_from_dupes     = 0,
      tokens_granted       = v_token_ids
  WHERE id = v_opening_id;

  IF p_pack_type = 'daily' THEN
    UPDATE public.user_season_state
    SET daily_pack_claimed_at = v_now, updated_at = v_now
    WHERE user_id = p_user_id AND season_id = v_season_id;
  END IF;

  RETURN jsonb_build_object(
    'opening_id',       v_opening_id,
    'card_ids',         to_jsonb(v_card_ids),
    'card_results',     v_card_results,
    'duplicate_count',  COALESCE(array_length(v_dupe_player_ids, 1), 0),
    'coins_from_dupes', 0,
    'token_ids',        to_jsonb(v_token_ids),
    'coin_cost',        v_pack_cost,
    'balance_after',    v_balance
  );
END;
$$;

ALTER FUNCTION public.open_pack(uuid, pack_type)
  SET search_path = public, pg_catalog;
