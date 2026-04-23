-- 0039 — per-slot game start is the only edit lock.
--
-- Phase 39 context: we removed the user-initiated Submit flow. With
-- it gone, entries stay `status = 'building'` until a cron flips
-- them. That cron isn't reliably running (or isn't wired for the new
-- model), so in practice entries sit in 'building' even when their
-- players' games are live or final.
--
-- The existing edit gates in update_lineup_slot / swap_lineup_slots /
-- apply_token / remove_token had a "skip per-slot lock check when
-- entry.status = 'building'" branch — which meant users could swap a
-- player OUT of a slot whose game was already live. Surprising and
-- wrong under the new model.
--
-- Fix: pure per-slot game-start gating. `is_slot_locked(slot_id)` is
-- the only check that matters. Entry.status and contest.status no
-- longer gate edits. Ownership + FK checks stay (still load the
-- entry row, still validate card ownership + pitcher/hitter-slot
-- eligibility). The in-function status transitions still happen for
-- reconcile/scoring code elsewhere to read.

-- ── update_lineup_slot ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_lineup_slot(p_user_id uuid, p_entry_id uuid, p_position text, p_starter_card_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_entry       contest_entry;
  v_card        card;
  v_is_pitcher  boolean;
  v_slot_id     uuid;
BEGIN
  SELECT * INTO v_entry FROM public.contest_entry
  WHERE id = p_entry_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_lineup_slot: entry not found' USING ERRCODE = 'P0002';
  END IF;

  -- Per-slot game-start lock is the ONLY edit gate. No entry.status
  -- or contest.status check.
  SELECT id INTO v_slot_id
  FROM public.contest_lineup_slot
  WHERE contest_entry_id = p_entry_id AND position = p_position;
  IF v_slot_id IS NOT NULL AND public.is_slot_locked(v_slot_id) THEN
    RAISE EXCEPTION 'SLOT_LOCKED: % slot cannot be edited — game has started', p_position
      USING ERRCODE = '23514';
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
$function$;

-- ── swap_lineup_slots ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.swap_lineup_slots(p_user_id uuid, p_entry_id uuid, p_position_a text, p_position_b text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_entry        contest_entry;
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

  -- Per-slot game-start lock is the only edit gate. Check both slots.
  IF public.is_slot_locked(v_slot_a_id) THEN
    RAISE EXCEPTION 'SLOT_LOCKED: % slot cannot be edited — game has started',
      p_position_a USING ERRCODE = '23514';
  END IF;
  IF public.is_slot_locked(v_slot_b_id) THEN
    RAISE EXCEPTION 'SLOT_LOCKED: % slot cannot be edited — game has started',
      p_position_b USING ERRCODE = '23514';
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
$function$;

-- ── apply_token ──────────────────────────────────────────────────────
-- Keeps the P38 self-heal for stale card.applied_token_id from a
-- non-pending contest (migration 0038). Drops the entry.status and
-- contest.status gates — per-slot lock only.

CREATE OR REPLACE FUNCTION public.apply_token(p_user_id uuid, p_token_id uuid, p_card_id uuid, p_contest_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_token   token;
  v_card    card;
  v_player  player;
  v_contest contest;
  v_app_id  uuid;
  v_is_pitcher_token boolean;
  v_slot_id uuid;
  v_stale_token token;
  v_stale_contest_status contest_status;
BEGIN
  SELECT * INTO v_token FROM public.token
  WHERE id = p_token_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_token: token not found / not owned' USING ERRCODE = 'P0002';
  END IF;
  IF v_token.applied_to_card_id IS NOT NULL THEN
    RAISE EXCEPTION 'apply_token: token already applied' USING ERRCODE = '23514';
  END IF;
  IF v_token.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'apply_token: token already consumed' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_card FROM public.card
  WHERE id = p_card_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_token: card not found / not owned' USING ERRCODE = 'P0002';
  END IF;
  IF v_card.is_expired THEN
    RAISE EXCEPTION 'apply_token: card is expired' USING ERRCODE = '23514';
  END IF;

  -- Self-heal stale applied_token_id (migration 0038).
  IF v_card.applied_token_id IS NOT NULL THEN
    SELECT * INTO v_stale_token FROM public.token
    WHERE id = v_card.applied_token_id FOR UPDATE;
    IF FOUND THEN
      v_stale_contest_status := NULL;
      IF v_stale_token.applied_to_contest_id IS NOT NULL THEN
        SELECT status INTO v_stale_contest_status
        FROM public.contest
        WHERE id = v_stale_token.applied_to_contest_id;
      END IF;

      IF v_stale_contest_status IS NULL OR v_stale_contest_status <> 'pending' THEN
        IF v_stale_token.consumed_at IS NULL THEN
          UPDATE public.token
          SET applied_to_card_id = NULL,
              applied_to_contest_id = NULL,
              updated_at = NOW()
          WHERE id = v_stale_token.id;
        END IF;
        UPDATE public.token_application
        SET resolved_at = NOW()
        WHERE card_id = p_card_id
          AND resolved_at IS NULL
          AND (
            v_stale_token.applied_to_contest_id IS NULL
            OR contest_id = v_stale_token.applied_to_contest_id
          );
        UPDATE public.card
        SET applied_token_id = NULL, updated_at = NOW()
        WHERE id = p_card_id;
        v_card.applied_token_id := NULL;
      ELSE
        RAISE EXCEPTION 'apply_token: card already has a token' USING ERRCODE = '23514';
      END IF;
    ELSE
      UPDATE public.card
      SET applied_token_id = NULL, updated_at = NOW()
      WHERE id = p_card_id;
      v_card.applied_token_id := NULL;
    END IF;
  END IF;

  SELECT * INTO v_player FROM public.player WHERE id = v_card.player_id;
  v_is_pitcher_token := v_token.token_type IN (
    'strikeout_bonus'::token_type, 'quality_start_bonus'::token_type
  );
  IF v_is_pitcher_token AND NOT v_player.is_pitcher THEN
    RAISE EXCEPTION 'apply_token: pitcher token on a hitter' USING ERRCODE = '23514';
  END IF;
  IF NOT v_is_pitcher_token AND v_player.is_pitcher THEN
    RAISE EXCEPTION 'apply_token: hitter token on a pitcher' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_contest FROM public.contest WHERE id = p_contest_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_token: contest not found' USING ERRCODE = 'P0002';
  END IF;

  -- If the card is rostered in this contest, the slot must be
  -- unlocked. No entry.status or contest.status edit gate.
  SELECT s.id INTO v_slot_id
  FROM public.contest_lineup_slot s
  JOIN public.contest_entry ce ON ce.id = s.contest_entry_id
  WHERE ce.user_id = p_user_id
    AND ce.contest_id = p_contest_id
    AND s.starter_card_id = p_card_id
  LIMIT 1;
  IF v_slot_id IS NOT NULL AND public.is_slot_locked(v_slot_id) THEN
    RAISE EXCEPTION 'SLOT_LOCKED: slotted card cannot take a token — game has started'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.token_application (
    token_id, card_id, contest_id, user_id, bonus_fp_awarded
  ) VALUES (
    p_token_id, p_card_id, p_contest_id, p_user_id, 0
  )
  RETURNING id INTO v_app_id;

  UPDATE public.token
  SET applied_to_card_id = p_card_id,
      applied_to_contest_id = p_contest_id,
      updated_at = now()
  WHERE id = p_token_id;

  UPDATE public.card
  SET applied_token_id = p_token_id, updated_at = now()
  WHERE id = p_card_id;

  UPDATE public.contest_lineup_slot s
  SET token_application_id = v_app_id
  FROM public.contest_entry ce
  WHERE s.contest_entry_id = ce.id
    AND ce.user_id = p_user_id
    AND ce.contest_id = p_contest_id
    AND s.starter_card_id = p_card_id;

  RETURN v_app_id;
END;
$function$;

-- ── remove_token ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.remove_token(p_user_id uuid, p_app_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_app     token_application;
  v_slot_id uuid;
BEGIN
  SELECT * INTO v_app FROM public.token_application
  WHERE id = p_app_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'remove_token: application not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_app.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'remove_token: already resolved' USING ERRCODE = '23514';
  END IF;

  -- Per-slot game-start lock is the only edit gate. No
  -- contest.status check.
  SELECT id INTO v_slot_id
  FROM public.contest_lineup_slot
  WHERE token_application_id = p_app_id
  LIMIT 1;
  IF v_slot_id IS NOT NULL AND public.is_slot_locked(v_slot_id) THEN
    RAISE EXCEPTION 'SLOT_LOCKED: token cannot be removed — game has started'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.contest_lineup_slot
  SET token_application_id = NULL
  WHERE token_application_id = p_app_id;

  UPDATE public.card
  SET applied_token_id = NULL, updated_at = now()
  WHERE id = v_app.card_id;

  UPDATE public.token
  SET applied_to_card_id = NULL,
      applied_to_contest_id = NULL,
      updated_at = now()
  WHERE id = v_app.token_id;

  DELETE FROM public.token_application WHERE id = p_app_id;
END;
$function$;
