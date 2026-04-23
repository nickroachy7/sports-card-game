-- 0042 — apply_token self-heal triggers on "token already consumed"
-- regardless of the token's contest status.
--
-- Root cause: migration 0041 taught _finalize_contest_entry to
-- consume every applied token, but didn't clear the card's
-- `applied_token_id` or the token's `applied_to_*` fields for
-- entries that were already in flight. Also, my earlier manual
-- consumption of two stuck tokens set `token.consumed_at = NOW()`
-- but left every reference to them in place.
--
-- apply_token's self-heal was gated on "non-pending contest" for
-- the stale token. When the stale token was pointing at the
-- CURRENT pending contest (via `applied_to_contest_id`), self-heal
-- skipped and threw "card already has a token" — even though the
-- stale token was already consumed and therefore unusable.
--
-- New rule: a stale `card.applied_token_id` is ALWAYS cleanable
-- when the referenced token is consumed (one-time-use complete),
-- regardless of its contest's status. The non-pending branch still
-- handles the case where an unconsumed token got left behind after
-- a contest ended without finalize running — we consume it in
-- place, per the one-time-use rule.

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
  v_stale_is_consumed boolean;
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

  PERFORM 1 FROM public.token_application WHERE token_id = p_token_id;
  IF FOUND THEN
    UPDATE public.contest_lineup_slot
    SET token_application_id = NULL
    WHERE token_application_id IN (
      SELECT id FROM public.token_application WHERE token_id = p_token_id
    );
    DELETE FROM public.token_application WHERE token_id = p_token_id;
  END IF;

  SELECT * INTO v_card FROM public.card
  WHERE id = p_card_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_token: card not found / not owned' USING ERRCODE = 'P0002';
  END IF;
  IF v_card.is_expired THEN
    RAISE EXCEPTION 'apply_token: card is expired' USING ERRCODE = '23514';
  END IF;

  -- Self-heal stale card.applied_token_id. Stale when:
  --   (a) pointed-at token is consumed — always clean up, regardless
  --       of contest state (one-time-use token is always stale), OR
  --   (b) pointed-at token's contest is no longer 'pending' — consume
  --       the unconsumed stale token in place (per §122 one-time-use
  --       rule).
  IF v_card.applied_token_id IS NOT NULL THEN
    SELECT * INTO v_stale_token FROM public.token
    WHERE id = v_card.applied_token_id FOR UPDATE;
    IF FOUND THEN
      v_stale_is_consumed := v_stale_token.consumed_at IS NOT NULL;
      v_stale_contest_status := NULL;
      IF v_stale_token.applied_to_contest_id IS NOT NULL THEN
        SELECT status INTO v_stale_contest_status
        FROM public.contest
        WHERE id = v_stale_token.applied_to_contest_id;
      END IF;

      IF v_stale_is_consumed
         OR v_stale_contest_status IS NULL
         OR v_stale_contest_status <> 'pending'
      THEN
        IF v_stale_token.consumed_at IS NULL THEN
          UPDATE public.token
          SET consumed_at = NOW(),
              applied_to_card_id = NULL,
              applied_to_contest_id = NULL,
              updated_at = NOW()
          WHERE id = v_stale_token.id;
        ELSE
          UPDATE public.token
          SET applied_to_card_id = NULL,
              applied_to_contest_id = NULL,
              updated_at = NOW()
          WHERE id = v_stale_token.id
            AND (applied_to_card_id IS NOT NULL OR applied_to_contest_id IS NOT NULL);
        END IF;
        UPDATE public.contest_lineup_slot
        SET token_application_id = NULL
        WHERE token_application_id IN (
          SELECT id FROM public.token_application WHERE card_id = p_card_id
        );
        DELETE FROM public.token_application
        WHERE card_id = p_card_id
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
