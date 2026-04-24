-- ─────────────────────────────────────────────────────────────────────────
-- 0052_open_pack_tier_weighted.sql — tier-weighted pack draws.
--
-- Polish spec §164 (Phase 45). open_pack rewrites its draw loop:
--   1. Filter pool to is_26_man = true (replaces is_active_40_man).
--   2. For each card slot: roll tier per pack_value_weights, then
--      random unowned player within that tier. Fallback chain if
--      the rolled tier is empty: star → starter → role.
--   3. Premium packs reserve the FIRST slot for a guaranteed star
--      draw (falls back to starter if no unowned stars).
--
-- Base revision is 0047 (tier-based bronze budget on mint). Only the
-- draw loop changes; everything else (collection-cap check, daily
-- cooldown, token drops, audit row, return shape) stays intact.
-- ─────────────────────────────────────────────────────────────────────────

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
  v_weights          jsonb;
  v_pack_weights     jsonb;
  v_guaranteed_map   jsonb;
  v_guaranteed_star  boolean := false;
  v_tier             text;
  v_pool_rule        text;
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
         quick_sell_values, token_bonus_fp, pack_value_weights
  INTO v_cfg FROM public.get_active_economy_config();

  v_collection_cap := v_cfg.collection_cap::int;
  v_pack_size      := ((v_cfg.pack_sizes)->>p_pack_type::text)::int;
  v_pack_cost      := COALESCE(((v_cfg.pack_prices_coins)->>p_pack_type::text)::bigint, 0);
  v_token_rate     := COALESCE(((v_cfg.token_drop_rates)->>p_pack_type::text)::numeric, 0);
  v_token_bonuses  := v_cfg.token_bonus_fp;
  v_weights        := v_cfg.pack_value_weights;
  v_pack_weights   := v_weights->p_pack_type::text;

  -- Phase 45: if economy_config has a `guaranteed_star_slot_per_pack`
  -- sibling on pack_value_weights, check it. Absence = false (so
  -- seeds pre-P45 behave unchanged).
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

  -- Phase 45 pool filter: if is_26_man has any matches, use it.
  -- Fallback to is_active_40_man so an empty sync state (brand new DB,
  -- cron hasn't run yet) doesn't break pack opening. Pool rule
  -- determined once per pack based on the 26-man pool size.
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

    -- §164 premium guaranteed-star slot: first slot of a premium pack
    -- tries for a star before the random tier roll.
    IF v_guaranteed_star AND i = 1 THEN
      v_tier := 'star';
    ELSE
      v_tier := public._roll_pack_tier(v_pack_weights);
    END IF;

    -- Draw a random unowned player in the rolled tier with fallback.
    r := public._draw_player_in_tier(p_user_id, v_tier, v_pool_rule);

    IF r.id IS NULL THEN
      -- True dupe fallback: any active player the user may already
      -- own. Preserves the existing dupe-resolution flow.
      SELECT p.id INTO r
      FROM public.player p
      WHERE
        (v_pool_rule = '26_man' AND p.is_26_man = true AND p.status = 'active')
        OR (v_pool_rule = '40_man' AND p.is_active_40_man = true AND p.status = 'active')
      ORDER BY random() LIMIT 1;
      IF FOUND THEN
        v_is_dupe := true;
        SELECT c.id INTO v_existing_card_id
        FROM public.card c
        WHERE c.user_id = p_user_id
          AND c.player_id = r.id
          AND c.is_vaulted = false
        ORDER BY c.career_fp_total ASC, c.acquired_at ASC
        LIMIT 1;
        v_dupe_player_ids := array_append(v_dupe_player_ids, r.id);
      ELSE
        CONTINUE;
      END IF;
    END IF;

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
    'balance_after',    v_balance,
    'pool_rule',        v_pool_rule
  );
END;
$$;

ALTER FUNCTION public.open_pack(uuid, pack_type)
  SET search_path = public, pg_catalog;


-- ── Helper: weighted tier roll ─────────────────────────────────────
-- p_weights is a jsonb like { "star":8, "starter":40, "role":52, "prospect":0 }.
-- Returns the text name of the chosen tier. Accumulates probabilities
-- in a stable order; weights should sum to 100 but the fn tolerates
-- small drift by falling through to the last non-zero tier.
CREATE OR REPLACE FUNCTION public._roll_pack_tier(p_weights jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_roll     numeric := random() * 100;
  v_accum    numeric := 0;
  v_w_star     numeric := COALESCE((p_weights->>'star')::numeric, 0);
  v_w_starter  numeric := COALESCE((p_weights->>'starter')::numeric, 0);
  v_w_role     numeric := COALESCE((p_weights->>'role')::numeric, 0);
  v_w_prospect numeric := COALESCE((p_weights->>'prospect')::numeric, 0);
BEGIN
  v_accum := v_w_star;
  IF v_roll < v_accum THEN RETURN 'star'; END IF;
  v_accum := v_accum + v_w_starter;
  IF v_roll < v_accum THEN RETURN 'starter'; END IF;
  v_accum := v_accum + v_w_role;
  IF v_roll < v_accum THEN RETURN 'role'; END IF;
  v_accum := v_accum + v_w_prospect;
  IF v_roll < v_accum THEN RETURN 'prospect'; END IF;
  -- Weight drift fallback: return the first non-zero tier.
  IF v_w_role > 0 THEN RETURN 'role'; END IF;
  IF v_w_starter > 0 THEN RETURN 'starter'; END IF;
  IF v_w_star > 0 THEN RETURN 'star'; END IF;
  RETURN 'role';
END;
$$;

ALTER FUNCTION public._roll_pack_tier(jsonb)
  SET search_path = public, pg_catalog;


-- ── Helper: random player in tier, with fallback ───────────────────
-- Returns a RECORD with `id` (player.id) or NULL if nothing found
-- even after tier fallback. Fallback chain: star → starter → role.
-- The pool filter flips between is_26_man (post-P45 sync run) and
-- is_active_40_man (pre-sync bootstrap) based on p_pool_rule.
CREATE OR REPLACE FUNCTION public._draw_player_in_tier(
  p_user_id   uuid,
  p_tier      text,
  p_pool_rule text
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
  v_tiers_to_try text[];
  v_current_tier text;
  v_found_id     uuid;
BEGIN
  v_tiers_to_try := CASE p_tier
    WHEN 'star'    THEN ARRAY['star', 'starter', 'role']
    WHEN 'starter' THEN ARRAY['starter', 'role']
    WHEN 'role'    THEN ARRAY['role']
    WHEN 'prospect' THEN ARRAY['prospect', 'role']
    ELSE ARRAY['role']
  END;

  FOREACH v_current_tier IN ARRAY v_tiers_to_try LOOP
    SELECT p.id INTO v_found_id
    FROM public.player p
    WHERE
      (p_pool_rule = '26_man' AND p.is_26_man = true AND p.status = 'active')
      OR (p_pool_rule = '40_man' AND p.is_active_40_man = true AND p.status = 'active')
    AND p.designated_value_tier = v_current_tier::player_value_tier
    AND NOT EXISTS (
      SELECT 1 FROM public.card c
      WHERE c.user_id = p_user_id
        AND c.player_id = p.id
        AND c.is_vaulted = false
    )
    ORDER BY random()
    LIMIT 1;

    IF v_found_id IS NOT NULL THEN
      id := v_found_id;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  -- No match even after fallback — return empty.
  RETURN;
END;
$$;

ALTER FUNCTION public._draw_player_in_tier(uuid, text, text)
  SET search_path = public, pg_catalog;
