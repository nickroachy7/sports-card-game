-- ─────────────────────────────────────────────────────────────────────────
-- 0033_drop_locked_entry_status.sql — drop 'locked' from
-- contest_entry_status.
--
-- Polish spec §56 (Phase 20). The 'locked' enum value was the gate
-- between `submitted` and `live` in the pre-Phase-18 contest lock model.
-- Phase 18 replaced contest-level lock with per-slot lock
-- (is_slot_locked), making 'locked' vestigial. Zero rows at this state
-- in prod (verified).
--
-- Postgres doesn't support DROP VALUE on an enum, so we rebuild:
--   1. Rename the old type out of the way.
--   2. Create a new type without 'locked'.
--   3. ALTER the column TYPE to the new enum via text round-trip.
--   4. Drop the old type.
--
-- Also drops the now-unused `locked` reference from the lineup SQL
-- fn status IN (...) lists. Defense in depth — none of them should
-- ever see 'locked' anyway.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TYPE public.contest_entry_status RENAME TO contest_entry_status_old;

CREATE TYPE public.contest_entry_status AS ENUM (
  'building',
  'submitted',
  'live',
  'final'
);

-- Drop dependencies that block ALTER COLUMN TYPE:
-- 1. DEFAULT expression (old-enum-typed).
-- 2. contest_entry_finalize_trigger (WHEN-clauses reference status).
-- 3. contest_entry_owner_update RLS policy (USING references status
--    IN (...) with old-enum-typed literals).
-- All three dropped, column re-typed, all three recreated with the
-- new enum's literals.
ALTER TABLE public.contest_entry
  ALTER COLUMN status DROP DEFAULT;

DROP TRIGGER IF EXISTS contest_entry_finalize_trigger ON public.contest_entry;

DROP POLICY IF EXISTS contest_entry_owner_update ON public.contest_entry;

-- Child-table policy references contest_entry.status too (via EXISTS).
DROP POLICY IF EXISTS contest_lineup_slot_owner_write ON public.contest_lineup_slot;

ALTER TABLE public.contest_entry
  ALTER COLUMN status TYPE public.contest_entry_status
  USING status::text::public.contest_entry_status;

-- Re-add the default using the new enum.
ALTER TABLE public.contest_entry
  ALTER COLUMN status SET DEFAULT 'building'::public.contest_entry_status;

-- Recreate the finalize trigger (same definition as migration 0013).
CREATE TRIGGER contest_entry_finalize_trigger
  AFTER UPDATE OF status ON public.contest_entry
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'final')
  EXECUTE FUNCTION public._on_contest_entry_final();

-- Recreate the RLS policies (same shape as migration 0005).
CREATE POLICY contest_entry_owner_update ON public.contest_entry FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status IN ('building', 'submitted'))
  WITH CHECK (user_id = auth.uid());

CREATE POLICY contest_lineup_slot_owner_write ON public.contest_lineup_slot FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contest_entry ce
    WHERE ce.id = contest_entry_id
      AND ce.user_id = auth.uid()
      AND ce.status IN ('building', 'submitted')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contest_entry ce
    WHERE ce.id = contest_entry_id AND ce.user_id = auth.uid()
  ));

DROP TYPE public.contest_entry_status_old;

-- SQL fn cleanup: drop 'locked' from the status IN (...) lists. The
-- per-slot lock logic from migration 0030 means 'locked' never appears
-- in practice, but narrowing the allowed set is cleaner.
CREATE OR REPLACE FUNCTION public.update_lineup_slot(
  p_user_id  uuid,
  p_entry_id uuid,
  p_position text,
  p_starter_card_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry       contest_entry;
  v_contest     contest;
  v_card        card;
  v_is_pitcher  boolean;
  v_slot_id     uuid;
BEGIN
  SELECT * INTO v_entry FROM public.contest_entry
  WHERE id = p_entry_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_lineup_slot: entry not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_entry.status NOT IN ('building', 'submitted', 'live') THEN
    RAISE EXCEPTION 'update_lineup_slot: entry not editable (status=%)', v_entry.status
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_contest FROM public.contest WHERE id = v_entry.contest_id;
  IF v_contest.status <> 'pending' THEN
    RAISE EXCEPTION 'update_lineup_slot: contest no longer pending (status=%)',
      v_contest.status USING ERRCODE = '23514';
  END IF;

  IF v_entry.status <> 'building' THEN
    SELECT id INTO v_slot_id
    FROM public.contest_lineup_slot
    WHERE contest_entry_id = p_entry_id AND position = p_position;
    IF v_slot_id IS NOT NULL AND public.is_slot_locked(v_slot_id) THEN
      RAISE EXCEPTION 'SLOT_LOCKED: % slot cannot be edited — game has started', p_position
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_starter_card_id IS NOT NULL THEN
    SELECT * INTO v_card FROM public.card
    WHERE id = p_starter_card_id AND user_id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'update_lineup_slot: card not found / not owned' USING ERRCODE = 'P0002';
    END IF;
    IF v_card.is_vaulted THEN
      RAISE EXCEPTION 'update_lineup_slot: card is vaulted' USING ERRCODE = '23514';
    END IF;
    IF v_card.is_expired THEN
      RAISE EXCEPTION 'update_lineup_slot: card is expired' USING ERRCODE = '23514';
    END IF;

    SELECT p.is_pitcher INTO v_is_pitcher FROM public.player p WHERE p.id = v_card.player_id;
    IF public._is_pitcher_slot(p_position) AND NOT v_is_pitcher THEN
      RAISE EXCEPTION 'update_lineup_slot: hitter cannot fill % slot', p_position
        USING ERRCODE = '23514';
    END IF;
    IF NOT public._is_pitcher_slot(p_position) AND v_is_pitcher THEN
      RAISE EXCEPTION 'update_lineup_slot: pitcher cannot fill % slot', p_position
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.contest_lineup_slot
    SET starter_card_id = NULL
    WHERE contest_entry_id = p_entry_id
      AND position <> p_position
      AND starter_card_id = p_starter_card_id;
  END IF;

  UPDATE public.contest_lineup_slot
  SET starter_card_id = p_starter_card_id
  WHERE contest_entry_id = p_entry_id AND position = p_position;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_lineup_slot: slot % not found', p_position
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

ALTER FUNCTION public.update_lineup_slot(uuid, uuid, text, uuid)
  SET search_path = public, pg_catalog;


CREATE OR REPLACE FUNCTION public.swap_lineup_slots(
  p_user_id    uuid,
  p_entry_id   uuid,
  p_position_a text,
  p_position_b text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry        contest_entry;
  v_contest      contest;
  v_card_a_id    uuid;
  v_card_b_id    uuid;
  v_a_is_pitcher boolean;
  v_b_is_pitcher boolean;
  v_a_slot_is_pitcher boolean;
  v_b_slot_is_pitcher boolean;
  v_slot_a_id    uuid;
  v_slot_b_id    uuid;
BEGIN
  IF p_position_a = p_position_b THEN
    RAISE EXCEPTION 'swap_lineup_slots: source and target positions are identical'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_entry FROM public.contest_entry
  WHERE id = p_entry_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'swap_lineup_slots: entry not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_entry.status NOT IN ('building', 'submitted', 'live') THEN
    RAISE EXCEPTION 'swap_lineup_slots: entry not editable (status=%)', v_entry.status
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_contest FROM public.contest WHERE id = v_entry.contest_id;
  IF v_contest.status <> 'pending' THEN
    RAISE EXCEPTION 'swap_lineup_slots: contest no longer pending (status=%)',
      v_contest.status USING ERRCODE = '23514';
  END IF;

  SELECT id, starter_card_id INTO v_slot_a_id, v_card_a_id
  FROM public.contest_lineup_slot
  WHERE contest_entry_id = p_entry_id AND position = p_position_a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'swap_lineup_slots: source slot % not found', p_position_a
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id, starter_card_id INTO v_slot_b_id, v_card_b_id
  FROM public.contest_lineup_slot
  WHERE contest_entry_id = p_entry_id AND position = p_position_b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'swap_lineup_slots: target slot % not found', p_position_b
      USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.status <> 'building' THEN
    IF public.is_slot_locked(v_slot_a_id) THEN
      RAISE EXCEPTION 'SLOT_LOCKED: % slot cannot be edited — game has started',
        p_position_a USING ERRCODE = '23514';
    END IF;
    IF public.is_slot_locked(v_slot_b_id) THEN
      RAISE EXCEPTION 'SLOT_LOCKED: % slot cannot be edited — game has started',
        p_position_b USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_card_a_id IS NULL AND v_card_b_id IS NULL THEN
    RAISE EXCEPTION 'swap_lineup_slots: both slots empty' USING ERRCODE = '22023';
  END IF;

  v_a_slot_is_pitcher := public._is_pitcher_slot(p_position_a);
  v_b_slot_is_pitcher := public._is_pitcher_slot(p_position_b);

  IF v_card_a_id IS NOT NULL THEN
    SELECT p.is_pitcher INTO v_a_is_pitcher
    FROM public.card c JOIN public.player p ON p.id = c.player_id
    WHERE c.id = v_card_a_id AND c.user_id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'swap_lineup_slots: source card not owned' USING ERRCODE = 'P0002';
    END IF;
    IF v_a_is_pitcher <> v_b_slot_is_pitcher THEN
      RAISE EXCEPTION
        'swap_lineup_slots: % cannot fill % slot',
        CASE WHEN v_a_is_pitcher THEN 'pitcher' ELSE 'hitter' END,
        p_position_b
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_card_b_id IS NOT NULL THEN
    SELECT p.is_pitcher INTO v_b_is_pitcher
    FROM public.card c JOIN public.player p ON p.id = c.player_id
    WHERE c.id = v_card_b_id AND c.user_id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'swap_lineup_slots: target card not owned' USING ERRCODE = 'P0002';
    END IF;
    IF v_b_is_pitcher <> v_a_slot_is_pitcher THEN
      RAISE EXCEPTION
        'swap_lineup_slots: % cannot fill % slot',
        CASE WHEN v_b_is_pitcher THEN 'pitcher' ELSE 'hitter' END,
        p_position_a
        USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.contest_lineup_slot
  SET starter_card_id = NULL
  WHERE contest_entry_id = p_entry_id AND position IN (p_position_a, p_position_b);

  UPDATE public.contest_lineup_slot
  SET starter_card_id = v_card_b_id
  WHERE contest_entry_id = p_entry_id AND position = p_position_a;

  UPDATE public.contest_lineup_slot
  SET starter_card_id = v_card_a_id
  WHERE contest_entry_id = p_entry_id AND position = p_position_b;
END;
$$;

ALTER FUNCTION public.swap_lineup_slots(uuid, uuid, text, text)
  SET search_path = public, pg_catalog;
