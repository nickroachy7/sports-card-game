-- ─────────────────────────────────────────────────────────────────────────
-- 0063_token_overflow_resolve.sql — Phase 49 Wave 2.
--
-- Polish spec §198–§200. Replaces Wave 1's silent skip of token
-- rolls at cap with player-choice overflow:
--
--   1. New column `token.is_pending boolean` (default false).
--      `is_pending=true` rows are limbo: granted by `open_pack`,
--      not yet resolved by the user. Don't count toward cap, can't
--      be applied, sit visible on the reveal slot but not in the
--      tray.
--
--   2. `open_pack` updated:
--      - Cap check now `consumed_at IS NULL AND is_pending = false`
--        — pending rows don't gate further rolls. (Lets a 5-pack
--        batch generate multiple pending tokens; user resolves all
--        in one modal at the end.)
--      - When at cap and a token roll fires, INSERT with
--        `is_pending=true` and append id to `v_pending_token_ids`.
--      - Returns `pending_token_ids` array in jsonb result.
--      - `tokens_skipped_at_cap` retired (the new field replaces it).
--
--   3. New SQL fn `resolve_pending_token(p_user_id, p_pending_id,
--      p_action, p_replaced_id)`:
--      - `p_action='keep_replace'` + `p_replaced_id` required:
--        quicksell `p_replaced_id` (calls existing quicksell_token),
--        flip pending row to active (`is_pending=false`).
--        Net cap delta = 0.
--      - `p_action='quicksell_new'`: quicksell the pending row
--        directly. Pending row's `consumed_at` set; `is_pending`
--        stays true (audit trail).
--
--      Returns `{action, coins_earned, balance_after}`.
--
-- All non-DDL changes idempotent; column add uses IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Schema: pending flag.
ALTER TABLE public.token
  ADD COLUMN IF NOT EXISTS is_pending boolean NOT NULL DEFAULT false;

-- Partial index for fast pending-tokens-by-user lookup. Pending rows
-- are always a tiny subset; this keeps the modal's fetch cheap even
-- as the season grows.
CREATE INDEX IF NOT EXISTS token_pending_by_user_idx
  ON public.token (user_id)
  WHERE is_pending = true AND consumed_at IS NULL;


-- 2) resolve_pending_token. Mirrors the validation pattern in
-- quicksell_token. Two action codes, one return shape.
CREATE OR REPLACE FUNCTION public.resolve_pending_token(
  p_user_id      uuid,
  p_pending_id   uuid,
  p_action       text,
  p_replaced_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_pending     public.token;
  v_quicksell   jsonb;
  v_payout      bigint;
  v_balance     bigint;
BEGIN
  IF p_action NOT IN ('keep_replace', 'quicksell_new') THEN
    RAISE EXCEPTION 'resolve_pending_token: invalid action %', p_action
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pending
  FROM public.token
  WHERE id = p_pending_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resolve_pending_token: pending token not found or not owned'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_pending.is_pending = false THEN
    RAISE EXCEPTION 'resolve_pending_token: token is not pending (already resolved)'
      USING ERRCODE = '23514';
  END IF;
  IF v_pending.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'resolve_pending_token: pending token already consumed'
      USING ERRCODE = '23514';
  END IF;

  IF p_action = 'keep_replace' THEN
    IF p_replaced_id IS NULL THEN
      RAISE EXCEPTION 'resolve_pending_token: keep_replace requires p_replaced_id'
        USING ERRCODE = '22023';
    END IF;
    -- Quicksell the chosen replacement target. The existing fn
    -- handles ownership + non-consumed + non-applied checks; we
    -- bubble its errors as-is.
    SELECT public.quicksell_token(p_user_id, p_replaced_id) INTO v_quicksell;
    v_payout  := (v_quicksell->>'coins_earned')::bigint;
    v_balance := (v_quicksell->>'balance_after')::bigint;
    -- Flip pending → active. No coin change for the kept one;
    -- inventory net delta is zero (replaced one consumed, new
    -- one activated).
    UPDATE public.token
    SET is_pending = false,
        updated_at = now()
    WHERE id = v_pending.id;

    RETURN jsonb_build_object(
      'action',         'keep_replace',
      'coins_earned',   v_payout,
      'balance_after',  v_balance,
      'kept_token_id',  v_pending.id,
      'sold_token_id',  p_replaced_id
    );
  ELSE
    -- 'quicksell_new': sell the pending row directly. Reuse the
    -- existing quicksell fn for consistent audit + coin credit.
    -- We need to flip is_pending to false first so quicksell_token's
    -- internal applied/consumed checks don't trip on the pending
    -- state machine. Order matters: clear is_pending, then call
    -- the fn.
    UPDATE public.token
    SET is_pending = false,
        updated_at = now()
    WHERE id = v_pending.id;
    SELECT public.quicksell_token(p_user_id, v_pending.id) INTO v_quicksell;
    v_payout  := (v_quicksell->>'coins_earned')::bigint;
    v_balance := (v_quicksell->>'balance_after')::bigint;

    RETURN jsonb_build_object(
      'action',         'quicksell_new',
      'coins_earned',   v_payout,
      'balance_after',  v_balance,
      'sold_token_id',  v_pending.id
    );
  END IF;
END;
$$;

ALTER FUNCTION public.resolve_pending_token(uuid, uuid, text, uuid)
  SET search_path = public, pg_catalog;


-- 3) open_pack — overflow-aware token rolls. Body forks from 0062
-- with cap check + INSERT block updated.
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

    IF v_guaranteed_star AND i = 1 THEN
      v_tier := 'star';
    ELSE
      v_tier := public._roll_pack_tier(v_pack_weights);
    END IF;

    r := public._draw_player_in_tier(p_user_id, v_tier, v_pool_rule);

    IF r.id IS NULL THEN
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

  -- Token rolls (overflow-aware). Polish spec §198. Cap check
  -- excludes is_pending — pending tokens are awaiting user
  -- resolution and shouldn't gate further rolls.
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
        -- Overflow: insert as pending; user will resolve via
        -- TokenOverflowResolveModal post-reveal (§199).
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
