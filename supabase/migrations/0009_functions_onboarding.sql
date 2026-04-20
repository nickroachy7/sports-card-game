-- ─────────────────────────────────────────────────────────────────────────
-- 0009_functions_onboarding.sql — onboard_user() atomic bootstrap.
-- API spec §3.1 completeOnboarding: creates profile + manager_account +
-- user_season_state, grants 500 coins + 2 tokens + 10 starter Bronze cards,
-- records the onboarding pack_opening.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.onboard_user(
  p_user_id           uuid,
  p_team_name         text,
  p_primary_color     text,
  p_secondary_color   text,
  p_logo_id           text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_season_id       uuid;
  v_profile_id      uuid;
  v_pack_opening_id uuid;
  v_token_bonus     jsonb;
  v_card_ids        uuid[] := '{}'::uuid[];
  v_token_ids       uuid[] := '{}'::uuid[];
  r                 record;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'onboard_user: p_user_id is required';
  END IF;

  -- Reject re-onboarding — per the API spec, profile row exists = done.
  IF EXISTS (SELECT 1 FROM public.profile WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'onboard_user: user already onboarded'
      USING ERRCODE = '23505';
  END IF;

  SELECT id INTO v_season_id FROM public.season WHERE status = 'active' LIMIT 1;
  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'onboard_user: no active season';
  END IF;

  -- Profile, manager_account, user_season_state.
  INSERT INTO public.profile (user_id, team_name, team_color_primary, team_color_secondary, team_logo_id)
  VALUES (p_user_id, p_team_name, p_primary_color, p_secondary_color, p_logo_id)
  RETURNING id INTO v_profile_id;

  INSERT INTO public.manager_account (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM public._upsert_user_season_state(p_user_id, v_season_id);

  -- pack_opening audit row (source = onboarding).
  INSERT INTO public.pack_opening (user_id, season_id, pack_type, coin_cost)
  VALUES (p_user_id, v_season_id, 'standard', 0)
  RETURNING id INTO v_pack_opening_id;

  -- 10 starter Bronze cards, drawn from the active 40-man "role" pool.
  -- Skips gracefully when the player pool is empty (M3 runs before the
  -- M4 roster sync seeds players) — the rest of onboarding still succeeds.
  FOR r IN
    SELECT id AS player_id FROM public.player
    WHERE is_active_40_man = true
      AND status = 'active'
    ORDER BY random()
    LIMIT 10
  LOOP
    INSERT INTO public.card (user_id, player_id, season_id, acquired_pack_opening_id)
    VALUES (p_user_id, r.player_id, v_season_id, v_pack_opening_id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_profile_id;  -- reuse var; value unused
    IF FOUND THEN
      v_card_ids := array_append(v_card_ids, v_profile_id);
    END IF;
  END LOOP;

  -- 2 starter tokens: 1 HR bonus + 1 multi-hit bonus, bonus_fp from config.
  SELECT token_bonus_fp INTO v_token_bonus FROM public.get_active_economy_config();

  INSERT INTO public.token (user_id, season_id, token_type, bonus_fp, acquired_source)
  VALUES (
    p_user_id, v_season_id, 'hr_bonus',
    COALESCE((v_token_bonus->>'hr_bonus')::numeric, 5.0),
    'onboarding'
  )
  RETURNING id INTO v_profile_id;
  v_token_ids := array_append(v_token_ids, v_profile_id);

  INSERT INTO public.token (user_id, season_id, token_type, bonus_fp, acquired_source)
  VALUES (
    p_user_id, v_season_id, 'multi_hit_bonus',
    COALESCE((v_token_bonus->>'multi_hit_bonus')::numeric, 3.0),
    'onboarding'
  )
  RETURNING id INTO v_profile_id;
  v_token_ids := array_append(v_token_ids, v_profile_id);

  -- Update pack_opening with the cards + tokens granted.
  UPDATE public.pack_opening
  SET cards_granted = v_card_ids,
      tokens_granted = v_token_ids
  WHERE id = v_pack_opening_id;

  -- Grant 500 coins + audit.
  PERFORM public.credit_coins(
    p_user_id, v_season_id, 500::bigint,
    'onboarding_bundle'::coin_reason, 'pack_opening', v_pack_opening_id,
    'Onboarding starter bundle'
  );

  RETURN v_pack_opening_id;
END;
$$;

ALTER FUNCTION public.onboard_user(uuid, text, text, text, text)
  SET search_path = public, pg_catalog;
