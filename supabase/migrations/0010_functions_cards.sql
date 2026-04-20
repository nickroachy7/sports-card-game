-- ─────────────────────────────────────────────────────────────────────────
-- 0010_functions_cards.sql — card-loop SQL functions.
-- quick_sell_card()   — API spec §3.3
-- extend_card()       — API spec §3.3 + gameplay §5.4 cost escalator
-- open_pack()         — API spec §3.2 + gameplay §6
-- ─────────────────────────────────────────────────────────────────────────

-- ── quick_sell_card ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.quick_sell_card(
  p_user_id uuid,
  p_card_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_card        card;
  v_cfg         jsonb;
  v_quick_sell  jsonb;
  v_payout      bigint;
  v_balance     bigint;
BEGIN
  SELECT * INTO v_card
  FROM public.card
  WHERE id = p_card_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quick_sell_card: card not found or not owned'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_card.is_vaulted THEN
    RAISE EXCEPTION 'quick_sell_card: card is vaulted'
      USING ERRCODE = '23514';
  END IF;
  IF v_card.applied_token_id IS NOT NULL THEN
    RAISE EXCEPTION 'quick_sell_card: card has an applied token'
      USING ERRCODE = '23514';
  END IF;

  SELECT quick_sell_values INTO v_quick_sell FROM public.get_active_economy_config();
  v_payout := COALESCE((v_quick_sell ->> v_card.current_tier::text)::bigint, 0);

  DELETE FROM public.card WHERE id = v_card.id;

  IF v_payout > 0 THEN
    v_balance := public.credit_coins(
      v_card.user_id, v_card.season_id, v_payout,
      'quick_sell'::coin_reason, 'card', v_card.id,
      'manual quick-sell'
    );
  ELSE
    SELECT coins INTO v_balance FROM public.user_season_state
    WHERE user_id = v_card.user_id AND season_id = v_card.season_id;
  END IF;

  RETURN jsonb_build_object(
    'coins_earned', v_payout,
    'balance_after', v_balance,
    'tier', v_card.current_tier::text
  );
END;
$$;

ALTER FUNCTION public.quick_sell_card(uuid, uuid)
  SET search_path = public, pg_catalog;


-- ── extend_card ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.extend_card(
  p_user_id uuid,
  p_card_id uuid,
  p_plays   integer
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_card           card;
  v_cfg            record;
  v_base_per_play  numeric;
  v_escalator      numeric;
  v_cost_per_play  numeric;
  v_total_cost     bigint;
  v_balance        bigint;
  v_ext_number     integer;
BEGIN
  IF p_plays NOT IN (5, 10, 15) THEN
    RAISE EXCEPTION 'extend_card: plays must be 5, 10, or 15 (got %)', p_plays
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_card
  FROM public.card
  WHERE id = p_card_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'extend_card: card not found or not owned'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_card.is_vaulted THEN
    RAISE EXCEPTION 'extend_card: card is vaulted'
      USING ERRCODE = '23514';
  END IF;

  SELECT extension_cost_per_play, extension_escalator
  INTO v_cfg
  FROM public.get_active_economy_config();

  v_base_per_play := COALESCE(
    ((v_cfg.extension_cost_per_play)->>v_card.current_tier::text)::numeric,
    0
  );
  v_escalator := v_cfg.extension_escalator;
  v_cost_per_play := v_base_per_play * (v_escalator ^ v_card.extension_count);
  v_total_cost := CEIL(v_cost_per_play * p_plays)::bigint;
  v_ext_number := v_card.extension_count + 1;

  v_balance := public.spend_coins(
    v_card.user_id, v_card.season_id, v_total_cost,
    'contract_extension'::coin_reason, 'card', v_card.id,
    format('extend by %s plays (ext #%s)', p_plays, v_ext_number)
  );

  UPDATE public.card
  SET contract_plays_remaining = contract_plays_remaining + p_plays,
      extension_count = extension_count + 1,
      is_expired = false,
      updated_at = now()
  WHERE id = v_card.id
  RETURNING contract_plays_remaining INTO v_card.contract_plays_remaining;

  INSERT INTO public.contract_extension (
    card_id, user_id, plays_added, coin_cost, extension_number, tier_at_extension
  ) VALUES (
    v_card.id, v_card.user_id, p_plays, v_total_cost,
    v_ext_number, v_card.current_tier
  );

  RETURN jsonb_build_object(
    'new_plays_remaining', v_card.contract_plays_remaining,
    'coin_cost', v_total_cost,
    'extension_number', v_ext_number,
    'balance_after', v_balance
  );
END;
$$;

ALTER FUNCTION public.extend_card(uuid, uuid, integer)
  SET search_path = public, pg_catalog;


-- ── open_pack ───────────────────────────────────────────────────────────
-- Simplified vs gameplay spec §6.3: player-value weighting is deferred
-- (no `designated_value` column on player yet). Draws uniformly across
-- active 40-man players with status='active'. Token drops are tunable
-- via economy_config.token_drop_rates[pack_type].
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
  v_quick_sell_val   bigint;
  v_opening_id       uuid;
  v_card_ids         uuid[] := '{}'::uuid[];
  v_dupe_player_ids  uuid[] := '{}'::uuid[];
  v_token_ids        uuid[] := '{}'::uuid[];
  v_coins_from_dupes bigint := 0;
  v_balance          bigint;
  v_new_card_id      uuid;
  v_new_token_id     uuid;
  v_token_types      text[] := ARRAY['hr_bonus','multi_hit_bonus','sb_bonus','strikeout_bonus','quality_start_bonus'];
  v_token_bonuses    jsonb;
  v_chosen_type      text;
  v_now              timestamptz := now();
  r                  record;
  i                  integer;
BEGIN
  -- Active season.
  SELECT id INTO v_season_id FROM public.season WHERE status = 'active' LIMIT 1;
  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'open_pack: no active season';
  END IF;

  -- Ensure + lock season state.
  PERFORM public._upsert_user_season_state(p_user_id, v_season_id);
  SELECT * INTO v_state FROM public.user_season_state
  WHERE user_id = p_user_id AND season_id = v_season_id
  FOR UPDATE;

  -- Load config.
  SELECT collection_cap, pack_sizes, pack_prices_coins, token_drop_rates,
         quick_sell_values, token_bonus_fp
  INTO v_cfg FROM public.get_active_economy_config();

  v_collection_cap := v_cfg.collection_cap::int;
  v_pack_size      := ((v_cfg.pack_sizes)->>p_pack_type::text)::int;
  v_pack_cost      := COALESCE(((v_cfg.pack_prices_coins)->>p_pack_type::text)::bigint, 0);
  v_token_rate     := COALESCE(((v_cfg.token_drop_rates)->>p_pack_type::text)::numeric, 0);
  v_quick_sell_val := COALESCE(((v_cfg.quick_sell_values)->>'bronze')::bigint, 10);
  v_token_bonuses  := v_cfg.token_bonus_fp;

  -- Collection cap pre-check. Simplified vs API spec §3.2 COLLECTION_AT_CAP flow.
  SELECT count(*) INTO v_current_count
  FROM public.card WHERE user_id = p_user_id AND is_vaulted = false;

  IF v_current_count + v_pack_size > v_collection_cap THEN
    RAISE EXCEPTION 'open_pack: collection at cap (have %, cap %, pack +%s)',
      v_current_count, v_collection_cap, v_pack_size
      USING ERRCODE = '53100';
  END IF;

  -- Daily pack: 24h cooldown + no coin cost.
  IF p_pack_type = 'daily' THEN
    IF v_state.daily_pack_claimed_at IS NOT NULL
       AND v_now - v_state.daily_pack_claimed_at < INTERVAL '24 hours' THEN
      RAISE EXCEPTION 'open_pack: daily pack already claimed'
        USING ERRCODE = '23505';
    END IF;
    v_pack_cost := 0;
  END IF;

  -- Charge coins (no-op for daily).
  IF v_pack_cost > 0 THEN
    v_balance := public.spend_coins(
      p_user_id, v_season_id, v_pack_cost,
      'pack_purchase'::coin_reason, NULL, NULL,
      format('%s pack purchase', p_pack_type)
    );
  ELSE
    v_balance := v_state.coins;
  END IF;

  -- Insert opening row early so card inserts can FK to it.
  INSERT INTO public.pack_opening (user_id, season_id, pack_type, coin_cost)
  VALUES (p_user_id, v_season_id, p_pack_type, v_pack_cost)
  RETURNING id INTO v_opening_id;

  -- Draw cards.
  FOR i IN 1..v_pack_size LOOP
    -- Pick a random active 40-man player we don't already own.
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

    IF FOUND THEN
      INSERT INTO public.card (user_id, player_id, season_id, acquired_pack_opening_id)
      VALUES (p_user_id, r.id, v_season_id, v_opening_id)
      RETURNING id INTO v_new_card_id;
      v_card_ids := array_append(v_card_ids, v_new_card_id);
    ELSE
      -- Fallback path: player pool exhausted OR all already owned →
      -- we draw a duplicate of a random active player and quick-sell it.
      SELECT p.id INTO r
      FROM public.player p
      WHERE p.is_active_40_man = true AND p.status = 'active'
      ORDER BY random() LIMIT 1;
      IF FOUND THEN
        v_dupe_player_ids := array_append(v_dupe_player_ids, r.id);
        v_balance := public.credit_coins(
          p_user_id, v_season_id, v_quick_sell_val,
          'quick_sell'::coin_reason, 'pack_opening', v_opening_id,
          'auto dupe quick-sell'
        );
        v_coins_from_dupes := v_coins_from_dupes + v_quick_sell_val;
      END IF;
    END IF;
  END LOOP;

  -- Token drops: one roll per pulled card, gated by pack's token_drop_rate.
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

  -- Update opening audit row.
  UPDATE public.pack_opening
  SET cards_granted = v_card_ids,
      duplicate_player_ids = v_dupe_player_ids,
      coins_from_dupes = v_coins_from_dupes,
      tokens_granted = v_token_ids
  WHERE id = v_opening_id;

  -- Mark daily claim.
  IF p_pack_type = 'daily' THEN
    UPDATE public.user_season_state
    SET daily_pack_claimed_at = v_now, updated_at = v_now
    WHERE user_id = p_user_id AND season_id = v_season_id;
  END IF;

  RETURN jsonb_build_object(
    'opening_id', v_opening_id,
    'card_ids', to_jsonb(v_card_ids),
    'duplicate_count', array_length(v_dupe_player_ids, 1),
    'coins_from_dupes', v_coins_from_dupes,
    'token_ids', to_jsonb(v_token_ids),
    'coin_cost', v_pack_cost,
    'balance_after', v_balance
  );
END;
$$;

ALTER FUNCTION public.open_pack(uuid, pack_type)
  SET search_path = public, pg_catalog;
