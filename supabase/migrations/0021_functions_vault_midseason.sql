-- ─────────────────────────────────────────────────────────────────────────
-- 0021_functions_vault_midseason.sql — mid-season vault SQL functions.
--
-- Two new fns (polish spec §7):
--   - vault_card_midseason(user, card) — freezes a playable card.
--   - destroy_vaulted_card(user, card) — removes a vaulted card for a
--     15% quick-sell-value refund. Appends to vault_card_destroy.
-- ─────────────────────────────────────────────────────────────────────────

-- ── vault_card_midseason ────────────────────────────────────────────────
--
-- Validates:
--   1. card exists + owned by user
--   2. card not already vaulted
--   3. user is below the season's 10-card vault cap
--   4. card is not locked in a submitted / live contest lineup
--
-- Side effects:
--   - clears card.applied_token_id (token is un-applied so it's not
--     orphaned on a frozen card; token row itself is preserved and
--     returns to the tray as available).
--   - clears any slot in a *building* contest_entry that held this
--     card (submitted/live entries are guarded against in step 4).
--   - sets is_vaulted=true, vaulted_at=now(), vault_source='midseason'.
CREATE OR REPLACE FUNCTION public.vault_card_midseason(
  p_user_id uuid,
  p_card_id uuid
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_card                 public.card;
  v_pre_vaulted_count    integer;
  v_submitted_slot_count integer;
BEGIN
  SELECT * INTO v_card
  FROM public.card
  WHERE id = p_card_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vault_card_midseason: card not found or not owned'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_card.is_vaulted THEN
    RAISE EXCEPTION 'vault_card_midseason: card already vaulted'
      USING ERRCODE = '23514';
  END IF;

  -- 10-card cap (season-scoped). Pre-vaulted cards live in `card` with
  -- is_vaulted=true. Ceremony-committed cards are deleted from `card`
  -- but remain in vault_entry; at this point in the season the card
  -- table is the authoritative source since ceremony hasn't run.
  SELECT COUNT(*) INTO v_pre_vaulted_count
  FROM public.card
  WHERE user_id = p_user_id
    AND season_id = v_card.season_id
    AND is_vaulted = true;
  IF v_pre_vaulted_count >= 10 THEN
    RAISE EXCEPTION 'vault_card_midseason: vault at cap (10)'
      USING ERRCODE = '23514';
  END IF;

  -- Locked-lineup guard: if the card is starter in a submitted /
  -- locked / live contest lineup, block until the contest scores.
  SELECT COUNT(*) INTO v_submitted_slot_count
  FROM public.contest_lineup_slot cls
  JOIN public.contest_entry ce ON ce.id = cls.contest_entry_id
  JOIN public.contest co ON co.id = ce.contest_id
  WHERE cls.starter_card_id = p_card_id
    AND ce.user_id = p_user_id
    AND ce.status IN ('submitted', 'locked', 'live')
    AND co.status IN ('locked', 'live');
  IF v_submitted_slot_count > 0 THEN
    RAISE EXCEPTION 'vault_card_midseason: card is locked in a submitted lineup'
      USING ERRCODE = '23514';
  END IF;

  -- Un-apply any token on this card. The token row stays usable.
  UPDATE public.token
  SET applied_to_card_id = NULL
  WHERE applied_to_card_id = p_card_id;

  -- Clear the card out of any *building* lineup slot so the user
  -- sees the diamond refresh without a phantom entry.
  UPDATE public.contest_lineup_slot cls
  SET starter_card_id = NULL
  WHERE cls.starter_card_id = p_card_id
    AND cls.contest_entry_id IN (
      SELECT id FROM public.contest_entry
      WHERE user_id = p_user_id AND status = 'building'
    );

  -- Freeze.
  UPDATE public.card
  SET is_vaulted       = true,
      vaulted_at       = now(),
      vault_source     = 'midseason',
      applied_token_id = NULL
  WHERE id = p_card_id;

  RETURN jsonb_build_object(
    'card_id',      p_card_id,
    'vault_count',  v_pre_vaulted_count + 1,
    'vault_source', 'midseason'
  );
END;
$$;

ALTER FUNCTION public.vault_card_midseason(uuid, uuid)
  SET search_path = public, pg_catalog;


-- ── destroy_vaulted_card ────────────────────────────────────────────────
--
-- Removes a vaulted card permanently. Refunds 15% of the tier's
-- quick-sell value (tier-scaled). Appends an audit row to
-- vault_card_destroy. Also removes any vault_entry snapshot (if the
-- user previously committed the ceremony for this card).
CREATE OR REPLACE FUNCTION public.destroy_vaulted_card(
  p_user_id uuid,
  p_card_id uuid
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_card         public.card;
  v_cfg          jsonb;
  v_quick_sell   jsonb;
  v_qs_value     bigint;
  v_refund       bigint;
  v_balance      bigint;
  v_vault_source vault_source;
BEGIN
  SELECT * INTO v_card
  FROM public.card
  WHERE id = p_card_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'destroy_vaulted_card: card not found or not owned'
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_card.is_vaulted THEN
    RAISE EXCEPTION 'destroy_vaulted_card: card is not vaulted'
      USING ERRCODE = '23514';
  END IF;

  -- Historical rows (pre-migration) may have NULL vault_source — the
  -- 0020 backfill sets 'ceremony' for those, but treat NULL as
  -- 'ceremony' here just in case.
  v_vault_source := COALESCE(v_card.vault_source, 'ceremony');

  -- Tier-scaled 15% refund of quick-sell value.
  SELECT quick_sell_values INTO v_quick_sell
  FROM public.get_active_economy_config();
  v_qs_value := COALESCE((v_quick_sell ->> v_card.current_tier::text)::bigint, 0);
  v_refund := floor(v_qs_value * 0.15);

  -- Audit first (append-only; card_id is stored as a plain uuid —
  -- the card row is about to be deleted).
  INSERT INTO public.vault_card_destroy
    (user_id, season_id, card_id, tier, refund_coins, vault_source)
  VALUES
    (p_user_id, v_card.season_id, p_card_id,
     v_card.current_tier, v_refund, v_vault_source);

  -- Remove the vault_entry snapshot if one exists (ceremony-committed
  -- card being destroyed mid-ceremony last-chance, or any other path).
  DELETE FROM public.vault_entry
  WHERE card_id = p_card_id AND user_id = p_user_id;

  -- Delete the card. Remaining FK references (contest_lineup_slot,
  -- token, token_application) are ON DELETE SET NULL as of 0019.
  DELETE FROM public.card WHERE id = p_card_id;

  IF v_refund > 0 THEN
    v_balance := public.credit_coins(
      p_user_id, v_card.season_id, v_refund,
      'vault_destroy'::coin_reason, 'card', p_card_id,
      'vault destroy (' || v_vault_source::text || ')'
    );
  ELSE
    SELECT coins INTO v_balance FROM public.user_season_state
    WHERE user_id = p_user_id AND season_id = v_card.season_id;
  END IF;

  RETURN jsonb_build_object(
    'card_id',       p_card_id,
    'tier',          v_card.current_tier::text,
    'refund_coins',  v_refund,
    'vault_source',  v_vault_source::text,
    'balance_after', v_balance
  );
END;
$$;

ALTER FUNCTION public.destroy_vaulted_card(uuid, uuid)
  SET search_path = public, pg_catalog;
