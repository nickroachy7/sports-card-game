-- ─────────────────────────────────────────────────────────────────────────
-- 0016_functions_opening_day.sql — grant_opening_day_bundle().
--
-- Per-user starter-bundle grant for the new season. Shares the shape of
-- onboard_user() (10 Bronze cards + 2 tokens + 500 coins + audit
-- pack_opening row) but skips profile/manager_account creation — those
-- already exist for returning users.
--
-- Called in a loop from /api/cron/opening-day once per pending season
-- that has reached its opening_day.
--
-- Idempotency: if a user_season_state row already exists for (user,
-- season), we assume the bundle was already granted and return early
-- with the existing pack_opening id if any, or NULL. Callers treat NULL
-- as "skipped" and the cron moves on to the next user without failure.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.grant_opening_day_bundle(
  p_user_id   uuid,
  p_season_id uuid
)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_existing_state  int;
  v_pack_opening_id uuid;
  v_token_bonus     jsonb;
  v_card_ids        uuid[] := '{}'::uuid[];
  v_token_ids       uuid[] := '{}'::uuid[];
  v_card_id         uuid;
  v_token_id        uuid;
  r                 record;
BEGIN
  IF p_user_id IS NULL OR p_season_id IS NULL THEN
    RAISE EXCEPTION 'grant_opening_day_bundle: user_id and season_id required';
  END IF;

  -- Idempotency: already granted for this season.
  SELECT 1 INTO v_existing_state
  FROM public.user_season_state
  WHERE user_id = p_user_id AND season_id = p_season_id;
  IF FOUND THEN
    RETURN NULL;
  END IF;

  PERFORM public._upsert_user_season_state(p_user_id, p_season_id);

  INSERT INTO public.pack_opening (user_id, season_id, pack_type, coin_cost)
  VALUES (p_user_id, p_season_id, 'standard', 0)
  RETURNING id INTO v_pack_opening_id;

  -- 10 starter Bronze cards, drawn at random from active 40-man roster.
  FOR r IN
    SELECT id AS player_id FROM public.player
    WHERE is_active_40_man = true
      AND status = 'active'
    ORDER BY random()
    LIMIT 10
  LOOP
    INSERT INTO public.card (user_id, player_id, season_id, acquired_pack_opening_id)
    VALUES (p_user_id, r.player_id, p_season_id, v_pack_opening_id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_card_id;
    IF FOUND THEN
      v_card_ids := array_append(v_card_ids, v_card_id);
    END IF;
  END LOOP;

  -- 2 starter tokens: 1 HR, 1 multi-hit.
  SELECT token_bonus_fp INTO v_token_bonus FROM public.get_active_economy_config();

  INSERT INTO public.token (user_id, season_id, token_type, bonus_fp, acquired_source)
  VALUES (
    p_user_id, p_season_id, 'hr_bonus',
    COALESCE((v_token_bonus->>'hr_bonus')::numeric, 5.0),
    'opening_day'
  )
  RETURNING id INTO v_token_id;
  v_token_ids := array_append(v_token_ids, v_token_id);

  INSERT INTO public.token (user_id, season_id, token_type, bonus_fp, acquired_source)
  VALUES (
    p_user_id, p_season_id, 'multi_hit_bonus',
    COALESCE((v_token_bonus->>'multi_hit_bonus')::numeric, 3.0),
    'opening_day'
  )
  RETURNING id INTO v_token_id;
  v_token_ids := array_append(v_token_ids, v_token_id);

  UPDATE public.pack_opening
  SET cards_granted = v_card_ids,
      tokens_granted = v_token_ids
  WHERE id = v_pack_opening_id;

  PERFORM public.credit_coins(
    p_user_id, p_season_id, 500::bigint,
    'onboarding_bundle'::coin_reason, 'pack_opening', v_pack_opening_id,
    'Opening Day starter bundle'
  );

  RETURN v_pack_opening_id;
END;
$$;

ALTER FUNCTION public.grant_opening_day_bundle(uuid, uuid)
  SET search_path = public, pg_catalog;
