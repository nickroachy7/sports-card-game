-- ─────────────────────────────────────────────────────────────────────────
-- 0062_token_cap_and_quicksell.sql — Phase 49 Wave 1.
--
-- Polish spec §195–§197. Token inventory hygiene: cap accumulation,
-- give the user agency to clear the backlog.
--
-- Three pieces:
--   1. economy_config gets two new fields:
--      - token_cap: int (default 20). Hard ceiling on
--        unconsumed tokens per (user, season).
--      - token_quicksell_values: jsonb keyed by token_type.
--   2. New SQL fn `quicksell_token(p_user_id, p_token_id)` —
--      validates ownership + non-consumed, refunds coins via
--      `credit_coins`, marks `consumed_at`. Mirrors quick_sell_card.
--   3. `open_pack` updated: token rolls silently no-op when the
--      user is at cap. Wave 2 (separate migration) will add the
--      pending-token + overflow-resolve flow.
--
-- Base revisions for `open_pack` are 0052 (tier-weighted draws) +
-- 0055 (mlbam_id dedup). Only the token-roll block changes here;
-- card-draw block + return shape stay byte-identical to 0052.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Schema additions.
ALTER TABLE public.economy_config
  ADD COLUMN IF NOT EXISTS token_cap integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS token_quicksell_values jsonb NOT NULL DEFAULT '{
    "hr_bonus":            25,
    "multi_hit_bonus":     15,
    "sb_bonus":            20,
    "strikeout_bonus":     25,
    "quality_start_bonus": 30
  }'::jsonb;

-- 2) quicksell_token. Mirrors quick_sell_card semantics.
CREATE OR REPLACE FUNCTION public.quicksell_token(
  p_user_id  uuid,
  p_token_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_token       public.token;
  v_quicksell   jsonb;
  v_payout      bigint;
  v_balance     bigint;
BEGIN
  SELECT * INTO v_token
  FROM public.token
  WHERE id = p_token_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quicksell_token: token not found or not owned'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_token.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'quicksell_token: token already consumed'
      USING ERRCODE = '23514';
  END IF;
  IF v_token.applied_to_card_id IS NOT NULL THEN
    RAISE EXCEPTION 'quicksell_token: token is currently applied to a card'
      USING ERRCODE = '23514';
  END IF;

  SELECT token_quicksell_values INTO v_quicksell
  FROM public.get_active_economy_config();
  v_payout := COALESCE(
    (v_quicksell ->> v_token.token_type::text)::bigint,
    0
  );

  -- Mark consumed (don't DELETE — preserve audit trail like cards
  -- keep history via pack_opening). Append ":quicksold" to source
  -- so future telemetry queries can distinguish lifetime outcomes.
  UPDATE public.token
  SET consumed_at = now(),
      acquired_source = v_token.acquired_source || ':quicksold',
      updated_at = now()
  WHERE id = v_token.id;

  IF v_payout > 0 THEN
    v_balance := public.credit_coins(
      v_token.user_id, v_token.season_id, v_payout,
      'quick_sell'::coin_reason, 'token', v_token.id,
      'token quick-sell'
    );
  ELSE
    SELECT coins INTO v_balance FROM public.user_season_state
    WHERE user_id = v_token.user_id AND season_id = v_token.season_id;
  END IF;

  RETURN jsonb_build_object(
    'coins_earned',  v_payout,
    'balance_after', v_balance,
    'token_type',    v_token.token_type::text
  );
END;
$$;

ALTER FUNCTION public.quicksell_token(uuid, uuid)
  SET search_path = public, pg_catalog;


-- 3) open_pack — cap-aware token rolls. Body forks from 0052 with
--    the only delta inside the per-card token-roll FOR loop.
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
  v_token_cap        integer;
  v_current_count    integer;
  v_token_count      integer;
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
  v_tokens_skipped   integer := 0;
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

  -- Token rolls (cap-aware, polish spec §196). When at cap,
  -- the per-slot `random() < drop_rate` test still fires so
  -- drop-rate metrics stay consistent, but the INSERT is skipped
  -- and we count the suppression for the result payload.
  -- Wave 2 will replace this with a pending-token + overflow
  -- resolve flow (§198–§200).
  FOR i IN 1..v_pack_size LOOP
    IF random() < v_token_rate THEN
      -- Recount inside the loop in case earlier iterations granted
      -- new tokens this pack — a 5-roll pack from cap-1 to cap stops
      -- granting after the 1st roll on the same call.
      SELECT count(*) INTO v_token_count
      FROM public.token
      WHERE user_id = p_user_id
        AND season_id = v_season_id
        AND consumed_at IS NULL;
      IF v_token_count >= v_token_cap THEN
        v_tokens_skipped := v_tokens_skipped + 1;
      ELSE
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
    'tokens_skipped_at_cap',v_tokens_skipped,
    'coin_cost',            v_pack_cost,
    'balance_after',        v_balance,
    'pool_rule',            v_pool_rule
  );
END;
$$;

ALTER FUNCTION public.open_pack(uuid, pack_type)
  SET search_path = public, pg_catalog;
