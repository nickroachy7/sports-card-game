-- ─────────────────────────────────────────────────────────────────────────
-- 0064_fix_open_pack_anon_composite.sql — hotfix.
--
-- User reported "Failed query: SELECT public.open_pack(...)" on
-- post-Wave-2 pack opens. The actual PG error (returned 0A000):
--
--   ERROR:  input of anonymous composite types is not implemented
--   CONTEXT: PL/pgSQL assignment
--            "r := public._draw_player_in_tier(p_user_id, v_tier, v_pool_rule)"
--
-- `_draw_player_in_tier` returns TABLE(id uuid). Direct assignment
-- to a `record` variable trips PG 17's stricter anonymous-composite
-- handling (the same `r := fn()` pattern in migration 0052 worked on
-- the prior PG version; the catalog re-bind in 0062/0063 surfaced
-- the latent issue).
--
-- Fix: replace direct assignment with a SELECT FROM the
-- table-returning fn, which PG handles cleanly. The `r` variable
-- stays declared as `record` so the dupe-fallback `SELECT p.id
-- INTO r FROM public.player p ...` further down is unchanged.
--
-- Body is otherwise byte-identical to 0063 (Phase 49 Wave 2 token
-- overflow); only the line at the start of the per-card loop differs.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.open_pack(
  p_user_id   uuid,
  p_pack_type pack_type
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_season_id          uuid;
  v_state              user_season_state;
  v_cfg                record;
  v_pack_size          integer;
  v_pack_cost          bigint;
  v_token_rate         numeric;
  v_collection_cap     integer;
  v_token_cap          integer;
  v_current_count      integer;
  v_token_count        integer;
  v_opening_id         uuid;
  v_card_ids           uuid[] := '{}'::uuid[];
  v_card_results       jsonb  := '[]'::jsonb;
  v_dupe_player_ids    uuid[] := '{}'::uuid[];
  v_token_ids          uuid[] := '{}'::uuid[];
  v_pending_token_ids  uuid[] := '{}'::uuid[];
  v_balance            bigint;
  v_new_card_id        uuid;
  v_new_token_id       uuid;
  v_token_types        text[] := ARRAY['hr_bonus','multi_hit_bonus','sb_bonus','strikeout_bonus','quality_start_bonus'];
  v_token_bonuses      jsonb;
  v_chosen_type        text;
  v_now                timestamptz := now();
  v_is_dupe            boolean;
  v_existing_card_id   uuid;
  v_bronze_plays       integer := public.tier_play_budget('bronze');
  v_weights            jsonb;
  v_pack_weights       jsonb;
  v_guaranteed_map     jsonb;
  v_guaranteed_star    boolean := false;
  v_tier               text;
  v_pool_rule          text;
  v_drawn_player_id    uuid;
  r                    record;
  i                    integer;
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
         quick_sell_values, token_bonus_fp, pack_value_weights, token_cap
  INTO v_cfg FROM public.get_active_economy_config();

  v_collection_cap := v_cfg.collection_cap::int;
  v_token_cap      := v_cfg.token_cap::int;
  v_pack_size      := ((v_cfg.pack_sizes)->>p_pack_type::text)::int;
  v_pack_cost      := COALESCE(((v_cfg.pack_prices_coins)->>p_pack_type::text)::bigint, 0);
  v_token_rate     := COALESCE(((v_cfg.token_drop_rates)->>p_pack_type::text)::numeric, 0);
  v_token_bonuses  := v_cfg.token_bonus_fp;
  v_weights        := v_cfg.pack_value_weights;
  v_pack_weights   := v_weights->p_pack_type::text;

  v_guaranteed_map := v_weights->'guaranteed_star_slot_per_pack';
  IF v_guaranteed_map IS NOT NULL AND (v_guaranteed_map->>p_pack_type::text)::boolean THEN
    v_guaranteed_star := true;
  END IF;

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

  PERFORM 1 FROM public.player
    WHERE is_26_man = true AND status = 'active' LIMIT 1;
  IF FOUND THEN
    v_pool_rule := '26_man';
  ELSE
    v_pool_rule := '40_man';
  END IF;

  FOR i IN 1..v_pack_size LOOP
    v_is_dupe := false;
    v_existing_card_id := NULL;
    v_drawn_player_id := NULL;

    IF v_guaranteed_star AND i = 1 THEN
      v_tier := 'star';
    ELSE
      v_tier := public._roll_pack_tier(v_pack_weights);
    END IF;

    -- Hotfix (§ migration 0064). PG 17 rejects direct assignment of
    -- a TABLE-returning function result to a `record` variable.
    -- SELECT FROM the function instead — same semantics, no anon
    -- composite type inference.
    SELECT t.id INTO v_drawn_player_id
    FROM public._draw_player_in_tier(p_user_id, v_tier, v_pool_rule) t
    LIMIT 1;

    IF v_drawn_player_id IS NULL THEN
      SELECT p.id INTO r
      FROM public.player p
      WHERE
        (v_pool_rule = '26_man' AND p.is_26_man = true AND p.status = 'active')
        OR (v_pool_rule = '40_man' AND p.is_active_40_man = true AND p.status = 'active')
      ORDER BY random() LIMIT 1;
      IF FOUND THEN
        v_is_dupe := true;
        v_drawn_player_id := r.id;
        SELECT c.id INTO v_existing_card_id
        FROM public.card c
        WHERE c.user_id = p_user_id
          AND c.player_id = v_drawn_player_id
          AND c.is_vaulted = false
        ORDER BY c.career_fp_total ASC, c.acquired_at ASC
        LIMIT 1;
        v_dupe_player_ids := array_append(v_dupe_player_ids, v_drawn_player_id);
      ELSE
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.card (
      user_id, player_id, season_id, acquired_pack_opening_id,
      contract_plays_remaining
    )
    VALUES (
      p_user_id, v_drawn_player_id, v_season_id, v_opening_id,
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
      SELECT count(*) INTO v_token_count
      FROM public.token
      WHERE user_id = p_user_id
        AND season_id = v_season_id
        AND consumed_at IS NULL
        AND is_pending = false;
      v_chosen_type := v_token_types[1 + floor(random() * array_length(v_token_types, 1))::int];
      IF v_token_count >= v_token_cap THEN
        INSERT INTO public.token (
          user_id, season_id, token_type, bonus_fp, acquired_source,
          is_pending
        ) VALUES (
          p_user_id, v_season_id, v_chosen_type::token_type,
          COALESCE((v_token_bonuses->>v_chosen_type)::numeric, 0),
          format('pack_%s', p_pack_type::text),
          true
        )
        RETURNING id INTO v_new_token_id;
        v_pending_token_ids := array_append(v_pending_token_ids, v_new_token_id);
      ELSE
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
    'opening_id',           v_opening_id,
    'card_ids',             to_jsonb(v_card_ids),
    'card_results',         v_card_results,
    'duplicate_count',      COALESCE(array_length(v_dupe_player_ids, 1), 0),
    'coins_from_dupes',     0,
    'token_ids',            to_jsonb(v_token_ids),
    'pending_token_ids',    to_jsonb(v_pending_token_ids),
    'coin_cost',            v_pack_cost,
    'balance_after',        v_balance,
    'pool_rule',            v_pool_rule
  );
END;
$$;

ALTER FUNCTION public.open_pack(uuid, pack_type)
  SET search_path = public, pg_catalog;
