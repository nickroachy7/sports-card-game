-- ─────────────────────────────────────────────────────────────────────────
-- 0001_functions_util.sql — utility SQL functions
-- DB schema spec §15 (Computed Fields & Triggers)
-- ─────────────────────────────────────────────────────────────────────────

-- -------------------------------------------------------------------------
-- touch_updated_at — generic trigger function. Sets NEW.updated_at = now()
-- on every UPDATE. Attached per-table in 0003_triggers.sql.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- -------------------------------------------------------------------------
-- get_active_economy_config — returns the most recent economy_config row
-- whose effective_from is in the past. Used by recompute_card_tier and by
-- read-only Server Actions that need the current tunables.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_economy_config()
RETURNS economy_config
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM public.economy_config
  WHERE effective_from <= now()
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

-- -------------------------------------------------------------------------
-- recompute_card_tier — BEFORE UPDATE OF career_fp_total ON card.
-- Reads tier_fp_thresholds from the active economy_config and sets
-- NEW.current_tier to the highest tier whose threshold is <= new FP.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_card_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  thresholds jsonb;
  fp numeric;
BEGIN
  SELECT tier_fp_thresholds INTO thresholds
  FROM public.economy_config
  WHERE effective_from <= now()
  ORDER BY effective_from DESC
  LIMIT 1;

  IF thresholds IS NULL THEN
    -- economy_config not yet seeded; leave tier unchanged.
    RETURN NEW;
  END IF;

  fp := NEW.career_fp_total;
  NEW.current_tier := CASE
    WHEN fp >= (thresholds->>'diamond')::numeric THEN 'diamond'
    WHEN fp >= (thresholds->>'gold')::numeric    THEN 'gold'
    WHEN fp >= (thresholds->>'silver')::numeric  THEN 'silver'
    ELSE 'bronze'
  END::card_tier;

  RETURN NEW;
END;
$$;

-- -------------------------------------------------------------------------
-- recompute_card_expiry — BEFORE UPDATE OF contract_plays_remaining ON card.
-- is_expired tracks whether plays_remaining has hit 0.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_card_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_expired := (NEW.contract_plays_remaining = 0);
  RETURN NEW;
END;
$$;

-- -------------------------------------------------------------------------
-- grant_manager_xp — atomically increments manager_xp + recomputes
-- manager_level from the thresholds in economy_config.manager_xp_sources.
-- Called from contest-resolution + milestone-award code paths.
--
-- The level curve is an array in economy_config; manager_level is
-- recomputed as 1 + (number of thresholds already reached).
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_manager_xp(
  p_user_id uuid,
  p_amount  bigint,
  p_source  text DEFAULT NULL
)
RETURNS manager_account
LANGUAGE plpgsql
AS $$
DECLARE
  updated_row manager_account;
  thresholds jsonb;
  level_count int;
  t numeric;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'grant_manager_xp: amount must be positive (got %)', p_amount;
  END IF;

  -- Upsert manager_account (all new users get one at onboarding; this
  -- is belt-and-suspenders for pre-onboarding grants).
  INSERT INTO public.manager_account (user_id, manager_xp)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET manager_xp = manager_account.manager_xp + p_amount,
        updated_at = now()
  RETURNING * INTO updated_row;

  -- Pull level thresholds from the active config.
  SELECT (manager_xp_sources->'level_thresholds')
  INTO thresholds
  FROM public.economy_config
  WHERE effective_from <= now()
  ORDER BY effective_from DESC
  LIMIT 1;

  IF thresholds IS NOT NULL AND jsonb_typeof(thresholds) = 'array' THEN
    level_count := 0;
    FOR t IN SELECT (value)::numeric FROM jsonb_array_elements_text(thresholds)
    LOOP
      IF updated_row.manager_xp >= t THEN
        level_count := level_count + 1;
      END IF;
    END LOOP;

    UPDATE public.manager_account
    SET manager_level = level_count + 1,
        updated_at    = now()
    WHERE user_id = p_user_id
    RETURNING * INTO updated_row;
  END IF;

  -- Suppress unused-param warning for p_source; kept in signature for
  -- auditability even though we don't persist it here (the call site
  -- writes to the relevant audit table: coin_transaction, contest_entry, etc.).
  PERFORM p_source;

  RETURN updated_row;
END;
$$;
