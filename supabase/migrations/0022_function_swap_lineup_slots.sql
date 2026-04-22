-- ─────────────────────────────────────────────────────────────────────────
-- 0022_function_swap_lineup_slots.sql — slot ↔ slot swap SQL fn.
--
-- Polish spec §11.2. Drag a card from slot A onto slot B → swap
-- cards atomically. Dual eligibility check: the card at A must fit
-- B's slot type (pitcher vs hitter) AND vice versa. Any violation
-- raises 23514.
--
-- Token applications travel with the card (they're keyed by card_id,
-- not slot position) so no extra wiring is needed for tokens.
-- ─────────────────────────────────────────────────────────────────────────

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
  IF v_entry.status <> 'building' THEN
    RAISE EXCEPTION 'swap_lineup_slots: entry not building (status=%)', v_entry.status
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_contest FROM public.contest WHERE id = v_entry.contest_id;
  IF v_contest.status <> 'pending' OR v_contest.lineup_locks_at <= now() THEN
    RAISE EXCEPTION 'swap_lineup_slots: contest locked' USING ERRCODE = '23514';
  END IF;

  -- Read both slots. starter_card_id may be NULL on either side.
  SELECT starter_card_id INTO v_card_a_id
  FROM public.contest_lineup_slot
  WHERE contest_entry_id = p_entry_id AND position = p_position_a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'swap_lineup_slots: source slot % not found', p_position_a
      USING ERRCODE = 'P0002';
  END IF;

  SELECT starter_card_id INTO v_card_b_id
  FROM public.contest_lineup_slot
  WHERE contest_entry_id = p_entry_id AND position = p_position_b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'swap_lineup_slots: target slot % not found', p_position_b
      USING ERRCODE = 'P0002';
  END IF;

  -- Need at least one filled slot to swap (swapping two empties is a no-op
  -- but semantically confusing — reject).
  IF v_card_a_id IS NULL AND v_card_b_id IS NULL THEN
    RAISE EXCEPTION 'swap_lineup_slots: both slots empty' USING ERRCODE = '22023';
  END IF;

  v_a_slot_is_pitcher := public._is_pitcher_slot(p_position_a);
  v_b_slot_is_pitcher := public._is_pitcher_slot(p_position_b);

  -- If card A exists, it must fit slot B.
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

  -- If card B exists, it must fit slot A.
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

  -- Atomic swap. Defer the constraint check (if any) by setting both
  -- to NULL first, then back.
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
