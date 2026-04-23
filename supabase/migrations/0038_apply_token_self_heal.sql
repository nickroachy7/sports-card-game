-- 0038 — apply_token self-heals stale card.applied_token_id.
--
-- Context: contest-end / reconcile flow doesn't currently clear a
-- card's `applied_token_id` + the paired token's `applied_to_card_id`
-- when a contest finalizes. Tokens that were applied to a card in a
-- contest that went final without triggering got "stuck" attached at
-- the DB level — the contest-scoped `token_application` query on
-- /lineup didn't surface them (different contest), so the client
-- thought the card was empty, but `apply_token` rejected new token
-- applies with "card already has a token" because
-- `v_card.applied_token_id IS NOT NULL`.
--
-- Fix: before throwing, check if the card's stale token points to a
-- non-pending contest. If so, return the token to the tray (when
-- unconsumed) and clear the card reference inline. Real conflicts
-- (same-contest duplicate applies) still throw.
--
-- Also handles the "dangling FK" edge case where card.applied_token_id
-- points to a token row that no longer exists (shouldn't happen but
-- costs nothing to guard).

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

  -- Self-heal stale applied_token_id. See migration header for the
  -- rationale.
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
        -- Stale reference — clean up and proceed.
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
        -- Current contest's token — real conflict.
        RAISE EXCEPTION 'apply_token: card already has a token' USING ERRCODE = '23514';
      END IF;
    ELSE
      -- FK pointed at a non-existent token — clear and proceed.
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
  IF v_contest.status <> 'pending' THEN
    RAISE EXCEPTION 'apply_token: contest no longer pending (status=%)',
      v_contest.status USING ERRCODE = '23514';
  END IF;

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
