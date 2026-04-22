-- ─────────────────────────────────────────────────────────────────────────
-- 0023_pack_open_dupes_choice.sql — defer dupe quick-sell to reveal time.
--
-- Polish spec §10. Previously, open_pack() auto-quick-sold any dupe
-- (pool-exhausted) draw at Bronze value inside the same transaction —
-- the user never saw the dupe in the reveal modal. New reveal UX
-- shows dupes and lets the user pick which instance to sell
-- ("sell new" or "sell existing"). That requires:
--
--   1. Every pulled card (dupe or not) becomes a real card row so it
--      can be quick-sold via the existing path (quick_sell_card).
--   2. open_pack returns per-pulled-card metadata: is_dupe +
--      existing_card_id (defaults to the user's lowest-FP existing
--      instance for the "(change)" picker scope — but we pick one
--      here so the default UX is one tap).
--   3. Total coin credit from dupes is no longer emitted from
--      open_pack (shifts to post-reveal quick_sell_card calls).
--
-- The "pool exhausted" branch is still the only trigger today — the
-- draw loop still prefers unowned players. Dupes are rare by game
-- design; this change just makes the (rare) dupe path a user choice.
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
  r                  record;
  i                  integer;
BEGIN
  -- Active season.
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

  -- Draw cards. Every draw yields a real card row. A draw becomes a
  -- "dupe" only when the unowned pool is exhausted — the fallback
  -- picks any active player the user may already own. The dupe card
  -- is inserted normally (fresh bronze, 15 plays); the user settles
  -- it post-reveal via quick_sell_card on either instance.
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
      -- Exhaustion fallback: pick any active player (will be a dupe).
      SELECT p.id INTO r
      FROM public.player p
      WHERE p.is_active_40_man = true AND p.status = 'active'
      ORDER BY random() LIMIT 1;
      IF NOT FOUND THEN
        CONTINUE;  -- no active players exist (misconfigured season)
      END IF;
      v_is_dupe := true;
      -- Default "existing" candidate for the dupe panel: the user's
      -- lowest-FP instance of this player. Client can show a picker
      -- to choose differently; the server defaults to lowest-FP.
      SELECT c.id INTO v_existing_card_id
      FROM public.card c
      WHERE c.user_id = p_user_id
        AND c.player_id = r.id
        AND c.is_vaulted = false
      ORDER BY c.career_fp_total ASC, c.acquired_at ASC
      LIMIT 1;
      v_dupe_player_ids := array_append(v_dupe_player_ids, r.id);
    END IF;

    INSERT INTO public.card (user_id, player_id, season_id, acquired_pack_opening_id)
    VALUES (p_user_id, r.id, v_season_id, v_opening_id)
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

  -- Token drops (unchanged).
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

  -- Audit row. coins_from_dupes stays 0 now; legacy field preserved
  -- so historical rows stay intact and don't need a schema change.
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
