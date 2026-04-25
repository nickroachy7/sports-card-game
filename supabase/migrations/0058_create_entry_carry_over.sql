-- ─────────────────────────────────────────────────────────────────────────
-- 0058_create_entry_carry_over.sql — sticky-lineup carry-over.
--
-- Polish spec §173 (Phase 46). When a user's contest entry is created
-- for a new slate, pre-fill its slots from the user's most recent
-- prior entry (within 7 days), but only where:
--   1. The prior slot was is_sticky = true.
--   2. The card is still owned, unvaulted, and not expired.
--   3. The card's player has a game in today's slate.
--
-- If the card exists + sticky but has no game today, the slot is left
-- empty (starter_card_id NULL) but is_sticky stays true so smart-auto
-- can fill from bench (Phase 46 §174).
--
-- Idempotent: only fills slots where today's slot is currently empty
-- (won't stomp manual placements made earlier in the day).
--
-- Adds `update_slot_sticky` helper for the UI toggle (Phase 46 §177).
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_contest_entry(
  p_user_id    uuid,
  p_contest_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id           uuid;
  v_season_id          uuid;
  v_status             contest_status;
  v_pos                text;
  v_today_starts_at    timestamptz;
  v_today_game_ids     uuid[];
  v_prior_entry_id     uuid;
  v_carried            integer := 0;
BEGIN
  SELECT season_id, status, starts_at, included_game_ids
  INTO v_season_id, v_status, v_today_starts_at, v_today_game_ids
  FROM public.contest WHERE id = p_contest_id;
  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'create_contest_entry: contest not found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent lookup first (existing behavior from 0037).
  SELECT id INTO v_entry_id
  FROM public.contest_entry
  WHERE user_id = p_user_id AND contest_id = p_contest_id;

  IF v_entry_id IS NOT NULL THEN
    -- Entry exists. Still attempt carry-over for any slots that are
    -- empty — this handles the case where the user loaded /lineup
    -- earlier (entry created with empty slots) but no carry-over had
    -- happened yet (e.g. pre-Phase 46 entry from migration day).
    PERFORM public._carry_over_sticky_slots(
      p_user_id, v_entry_id, v_today_starts_at, v_today_game_ids
    );
    RETURN v_entry_id;
  END IF;

  -- New entry path. Status guard from 0037.
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'create_contest_entry: contest not pending (status=%)', v_status
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.contest_entry (user_id, contest_id, season_id)
  VALUES (p_user_id, p_contest_id, v_season_id)
  RETURNING id INTO v_entry_id;

  FOREACH v_pos IN ARRAY public._lineup_positions() LOOP
    INSERT INTO public.contest_lineup_slot (contest_entry_id, position)
    VALUES (v_entry_id, v_pos);
  END LOOP;

  -- Carry-over from yesterday (or the most recent prior entry) per
  -- §173. Empty new slots may receive a starter_card_id + sticky=true
  -- if the prior slot was sticky and the card is playable today.
  PERFORM public._carry_over_sticky_slots(
    p_user_id, v_entry_id, v_today_starts_at, v_today_game_ids
  );

  RETURN v_entry_id;
END;
$$;

ALTER FUNCTION public.create_contest_entry(uuid, uuid)
  SET search_path = public, pg_catalog;


-- ── _carry_over_sticky_slots helper ────────────────────────────────
-- For each empty slot in the user's new entry, look up the matching
-- slot in their most recent prior entry (within 7 days) where
-- is_sticky=true. Carry the starter_card_id + is_sticky if the card
-- is still playable AND has a game today.
CREATE OR REPLACE FUNCTION public._carry_over_sticky_slots(
  p_user_id         uuid,
  p_entry_id        uuid,
  p_today_starts_at timestamptz,
  p_today_game_ids  uuid[]
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_prior_entry_id uuid;
  v_carried        integer := 0;
  v_slot           record;
BEGIN
  -- Find the most recent prior entry (within 7 days) with at least
  -- one filled, sticky slot. Skip the entry-being-created itself.
  SELECT ce.id INTO v_prior_entry_id
  FROM public.contest_entry ce
  JOIN public.contest co ON co.id = ce.contest_id
  WHERE ce.user_id = p_user_id
    AND ce.id <> p_entry_id
    AND co.starts_at < p_today_starts_at
    AND co.starts_at > p_today_starts_at - INTERVAL '7 days'
    AND EXISTS (
      SELECT 1 FROM public.contest_lineup_slot s
      WHERE s.contest_entry_id = ce.id
        AND s.starter_card_id IS NOT NULL
        AND s.is_sticky = true
    )
  ORDER BY co.starts_at DESC
  LIMIT 1;

  IF v_prior_entry_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Walk each prior sticky slot; carry-over if the card is playable.
  FOR v_slot IN
    SELECT
      s.position,
      s.starter_card_id,
      s.is_sticky,
      c.is_vaulted,
      c.is_expired,
      c.user_id AS card_user_id,
      p.team_id AS player_team_id
    FROM public.contest_lineup_slot s
    JOIN public.card c ON c.id = s.starter_card_id
    JOIN public.player p ON p.id = c.player_id
    WHERE s.contest_entry_id = v_prior_entry_id
      AND s.is_sticky = true
      AND s.starter_card_id IS NOT NULL
  LOOP
    -- Skip if card no longer owned, vaulted, or expired.
    IF v_slot.card_user_id <> p_user_id
       OR v_slot.is_vaulted
       OR v_slot.is_expired THEN
      CONTINUE;
    END IF;

    -- Skip if today's matching slot is already filled (don't stomp).
    PERFORM 1
    FROM public.contest_lineup_slot s2
    WHERE s2.contest_entry_id = p_entry_id
      AND s2.position = v_slot.position
      AND s2.starter_card_id IS NOT NULL;
    IF FOUND THEN
      CONTINUE;
    END IF;

    -- Check if the player's team has a game in today's slate. If not,
    -- leave the slot empty + sticky=true (smart-auto may fill).
    IF EXISTS (
      SELECT 1 FROM public.game g
      WHERE g.id = ANY(p_today_game_ids)
        AND (g.home_team_id = v_slot.player_team_id
             OR g.away_team_id = v_slot.player_team_id)
    ) THEN
      UPDATE public.contest_lineup_slot
      SET starter_card_id = v_slot.starter_card_id,
          is_sticky = true
      WHERE contest_entry_id = p_entry_id
        AND position = v_slot.position;
      v_carried := v_carried + 1;
    ELSE
      -- Player has no game today. Keep slot empty but preserve
      -- sticky=true so smart-auto can fill from bench.
      UPDATE public.contest_lineup_slot
      SET is_sticky = true
      WHERE contest_entry_id = p_entry_id
        AND position = v_slot.position;
    END IF;
  END LOOP;

  RETURN v_carried;
END;
$$;

ALTER FUNCTION public._carry_over_sticky_slots(uuid, uuid, timestamptz, uuid[])
  SET search_path = public, pg_catalog;


-- ── update_slot_sticky helper for the UI toggle ─────────────────────
-- Asserts ownership + per-slot lock state before mutating. Exposed
-- via the toggleSlotSticky Server Action.
CREATE OR REPLACE FUNCTION public.update_slot_sticky(
  p_user_id  uuid,
  p_slot_id  uuid,
  p_sticky   boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner uuid;
  v_locked boolean;
BEGIN
  SELECT ce.user_id INTO v_owner
  FROM public.contest_lineup_slot s
  JOIN public.contest_entry ce ON ce.id = s.contest_entry_id
  WHERE s.id = p_slot_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'update_slot_sticky: slot not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_owner <> p_user_id THEN
    RAISE EXCEPTION 'update_slot_sticky: slot not owned by user' USING ERRCODE = '42501';
  END IF;

  IF public.is_slot_locked(p_slot_id) THEN
    RAISE EXCEPTION 'SLOT_LOCKED: cannot toggle sticky on a locked slot'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.contest_lineup_slot
  SET is_sticky = p_sticky
  WHERE id = p_slot_id;
END;
$$;

ALTER FUNCTION public.update_slot_sticky(uuid, uuid, boolean)
  SET search_path = public, pg_catalog;
