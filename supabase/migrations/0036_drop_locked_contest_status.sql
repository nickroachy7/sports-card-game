-- ─────────────────────────────────────────────────────────────────────────
-- 0036_drop_locked_contest_status.sql — drop 'locked' from
-- contest_status.
--
-- Polish spec §66 (Phase 22). Parallel to migration 0033 (which dropped
-- 'locked' from contest_entry_status). Contest-level 'locked' was the
-- pre-Phase-18 gate between 'pending' and 'live'; Phase 18 replaced
-- contest-level lock with per-slot lock (is_slot_locked), so the
-- 'locked' contest state never fires today. Verified zero rows at
-- this value in prod before running.
--
-- Postgres doesn't support DROP VALUE on an enum, so we rebuild:
--   1. Rename the old type out of the way.
--   2. Create a new type without 'locked'.
--   3. Drop dependencies blocking ALTER COLUMN TYPE:
--        - DEFAULT expression (old-enum-typed).
--        - public.vault_card_midseason (function body references
--          `co.status IN ('locked', 'live')`).
--   4. ALTER the column TYPE via text round-trip.
--   5. Restore DEFAULT + recreate vault_card_midseason without the
--      'locked' literal.
--   6. DROP TYPE old.
--
-- No RLS policies on public.contest reference status (only a
-- `contest_public_read` with `qual = true`). The `contest_status_idx`
-- btree index on status survives ALTER COLUMN TYPE automatically
-- — Postgres rewrites the index in place.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TYPE public.contest_status RENAME TO contest_status_old;

CREATE TYPE public.contest_status AS ENUM (
  'pending',
  'live',
  'final',
  'canceled'
);

-- Drop the DEFAULT (old-enum-typed) before ALTER COLUMN TYPE.
ALTER TABLE public.contest
  ALTER COLUMN status DROP DEFAULT;

-- Drop vault_card_midseason — its body references
-- `co.status IN ('locked', 'live')`, which is an old-enum-typed
-- literal set that blocks the ALTER.
DROP FUNCTION IF EXISTS public.vault_card_midseason(uuid, uuid);

ALTER TABLE public.contest
  ALTER COLUMN status TYPE public.contest_status
  USING status::text::public.contest_status;

-- Restore the DEFAULT on the new enum.
ALTER TABLE public.contest
  ALTER COLUMN status SET DEFAULT 'pending'::public.contest_status;

-- Recreate vault_card_midseason (identical to migration 0021 except
-- `co.status IN ('locked', 'live')` narrowed to `co.status = 'live'`).
-- The 'locked' literal is no longer valid; any contest we'd want to
-- guard against is already covered by `ce.status IN ('submitted',
-- 'live')` on the contest_entry join, and 'live' on the contest itself.
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

  -- Locked-lineup guard: if the card is a starter in a submitted /
  -- live contest lineup on a live contest, block until the contest
  -- scores. (Post-Phase-22 narrowing: dropped 'locked' from both the
  -- entry and contest status IN-lists — 'locked' is no longer a valid
  -- enum value in either enum.)
  SELECT COUNT(*) INTO v_submitted_slot_count
  FROM public.contest_lineup_slot cls
  JOIN public.contest_entry ce ON ce.id = cls.contest_entry_id
  JOIN public.contest co ON co.id = ce.contest_id
  WHERE cls.starter_card_id = p_card_id
    AND ce.user_id = p_user_id
    AND ce.status IN ('submitted', 'live')
    AND co.status = 'live';
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

DROP TYPE public.contest_status_old;
