-- ─────────────────────────────────────────────────────────────────────────
-- 0002_functions_economy.sql — coin ledger SQL functions
-- DB schema spec §9.1, §15.4. Every coin movement goes through these.
-- ─────────────────────────────────────────────────────────────────────────

-- -------------------------------------------------------------------------
-- _upsert_user_season_state — helper. Returns the user_season_state row
-- for (user_id, season_id), inserting it with coins=0 if none exists.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._upsert_user_season_state(
  p_user_id   uuid,
  p_season_id uuid
)
RETURNS user_season_state
LANGUAGE plpgsql
AS $$
DECLARE
  row_out user_season_state;
BEGIN
  INSERT INTO public.user_season_state (user_id, season_id)
  VALUES (p_user_id, p_season_id)
  ON CONFLICT (user_id, season_id) DO UPDATE
    SET updated_at = user_season_state.updated_at  -- no-op UPDATE, just to RETURNING
  RETURNING * INTO row_out;
  RETURN row_out;
END;
$$;

-- -------------------------------------------------------------------------
-- credit_coins — append a positive coin_transaction and update
-- user_season_state.coins atomically.
--
-- Returns the updated user_season_state.coins balance.
-- Raises EXCEPTION if p_amount <= 0.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_coins(
  p_user_id         uuid,
  p_season_id       uuid,
  p_amount          bigint,
  p_reason          coin_reason,
  p_reference_table text DEFAULT NULL,
  p_reference_id    uuid DEFAULT NULL,
  p_note            text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  state       user_season_state;
  new_balance bigint;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'credit_coins: amount must be positive (got %)', p_amount;
  END IF;

  state := public._upsert_user_season_state(p_user_id, p_season_id);

  UPDATE public.user_season_state
  SET coins = coins + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
    AND season_id = p_season_id
  RETURNING coins INTO new_balance;

  INSERT INTO public.coin_transaction (
    user_id, season_id, amount, balance_after,
    reason, reference_table, reference_id, note
  ) VALUES (
    p_user_id, p_season_id, p_amount, new_balance,
    p_reason, p_reference_table, p_reference_id, p_note
  );

  RETURN new_balance;
END;
$$;

-- -------------------------------------------------------------------------
-- spend_coins — debit a positive amount from user_season_state.coins and
-- append a negative coin_transaction. Rejects overdraws with a specific
-- SQLSTATE the API layer can map to INSUFFICIENT_COINS.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.spend_coins(
  p_user_id         uuid,
  p_season_id       uuid,
  p_amount          bigint,
  p_reason          coin_reason,
  p_reference_table text DEFAULT NULL,
  p_reference_id    uuid DEFAULT NULL,
  p_note            text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  state       user_season_state;
  new_balance bigint;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'spend_coins: amount must be positive (got %)', p_amount;
  END IF;

  state := public._upsert_user_season_state(p_user_id, p_season_id);

  IF state.coins < p_amount THEN
    -- SQLSTATE 23514 = check_violation. API layer maps to INSUFFICIENT_COINS.
    RAISE EXCEPTION 'spend_coins: insufficient balance (have %, need %)',
      state.coins, p_amount
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.user_season_state
  SET coins = coins - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
    AND season_id = p_season_id
  RETURNING coins INTO new_balance;

  INSERT INTO public.coin_transaction (
    user_id, season_id, amount, balance_after,
    reason, reference_table, reference_id, note
  ) VALUES (
    p_user_id, p_season_id, -p_amount, new_balance,
    p_reason, p_reference_table, p_reference_id, p_note
  );

  RETURN new_balance;
END;
$$;
