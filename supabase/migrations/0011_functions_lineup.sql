-- ─────────────────────────────────────────────────────────────────────────
-- 0011_functions_lineup.sql — Phase 2 lineup + token functions.
-- create_daily_contest()      — auto-creates today's slate
-- create_contest_entry()      — entry + 10 empty slots
-- update_lineup_slot()        — drag-drop handler
-- apply_token() / remove_token()
-- set_auto_sub_mode()
-- submit_lineup()             — validate + lock
--
-- Position eligibility is relaxed for Phase 2: pitchers only fit SP*,
-- hitters only fit non-SP slots. Finer-grained position-tag matching
-- (C ↔ catcher, SS ↔ shortstop, etc.) is Phase 3 work.
-- ─────────────────────────────────────────────────────────────────────────

-- Canonical lineup positions. Used by create_contest_entry to seed 10 slots.
CREATE OR REPLACE FUNCTION public._lineup_positions() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['C','1B','2B','3B','SS','OF1','OF2','OF3','SP1','SP2']::text[];
$$;

-- Is a slot position a pitcher slot?
CREATE OR REPLACE FUNCTION public._is_pitcher_slot(p_position text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_position LIKE 'SP%';
$$;

-- ── create_daily_contest ────────────────────────────────────────────────
-- Idempotent: one `daily_slate` contest per (season, contest_date).
-- lineup_locks_at set to 24h after starts_at (Phase 2 simplification;
-- Phase 3 will lock at the earliest game's first pitch from live BDL data).
CREATE OR REPLACE FUNCTION public.create_daily_contest(
  p_contest_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_season_id  uuid;
  v_contest_id uuid;
  v_game_ids   uuid[];
  v_starts_at  timestamptz;
BEGIN
  SELECT id INTO v_season_id FROM public.season WHERE status = 'active' LIMIT 1;
  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'create_daily_contest: no active season';
  END IF;

  v_starts_at := (p_contest_date::timestamp AT TIME ZONE 'UTC');

  -- Reuse if already exists.
  SELECT id INTO v_contest_id
  FROM public.contest
  WHERE season_id = v_season_id
    AND type = 'daily_slate'
    AND starts_at::date = p_contest_date;
  IF v_contest_id IS NOT NULL THEN
    RETURN v_contest_id;
  END IF;

  -- Include every game happening on the contest_date.
  SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_game_ids
  FROM public.game
  WHERE date = p_contest_date;

  INSERT INTO public.contest (
    season_id, type, name, lineup_locks_at, starts_at, ends_at,
    entry_fee_coins, status, included_game_ids
  ) VALUES (
    v_season_id,
    'daily_slate',
    format('Tonight''s Slate · %s', to_char(p_contest_date, 'Mon DD')),
    v_starts_at + INTERVAL '24 hours',
    v_starts_at,
    v_starts_at + INTERVAL '48 hours',
    0,
    'pending',
    v_game_ids
  )
  RETURNING id INTO v_contest_id;

  RETURN v_contest_id;
END;
$$;

ALTER FUNCTION public.create_daily_contest(date)
  SET search_path = public, pg_catalog;


-- ── create_contest_entry ────────────────────────────────────────────────
-- Idempotent per (user_id, contest_id). Creates entry + seeds 10 empty
-- slots in one transaction. Returns the entry id.
CREATE OR REPLACE FUNCTION public.create_contest_entry(
  p_user_id    uuid,
  p_contest_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id   uuid;
  v_season_id  uuid;
  v_status     contest_status;
  v_pos        text;
BEGIN
  SELECT season_id, status INTO v_season_id, v_status
  FROM public.contest WHERE id = p_contest_id;
  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'create_contest_entry: contest not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'create_contest_entry: contest not pending (status=%)', v_status
      USING ERRCODE = '23514';
  END IF;

  SELECT id INTO v_entry_id
  FROM public.contest_entry
  WHERE user_id = p_user_id AND contest_id = p_contest_id;
  IF v_entry_id IS NOT NULL THEN
    RETURN v_entry_id;
  END IF;

  INSERT INTO public.contest_entry (user_id, contest_id, season_id)
  VALUES (p_user_id, p_contest_id, v_season_id)
  RETURNING id INTO v_entry_id;

  FOREACH v_pos IN ARRAY public._lineup_positions() LOOP
    INSERT INTO public.contest_lineup_slot (contest_entry_id, position)
    VALUES (v_entry_id, v_pos);
  END LOOP;

  RETURN v_entry_id;
END;
$$;

ALTER FUNCTION public.create_contest_entry(uuid, uuid)
  SET search_path = public, pg_catalog;


-- ── update_lineup_slot ──────────────────────────────────────────────────
-- Assigns or clears starter_card_id on one slot. Enforces:
--   - user owns entry, entry is still `building`
--   - card (if any) is owned by user, not vaulted, not expired
--   - card's is_pitcher flag matches slot's pitcher-ness
--   - card isn't already a starter in a different slot in THIS entry
--   - contest isn't locked
CREATE OR REPLACE FUNCTION public.update_lineup_slot(
  p_user_id  uuid,
  p_entry_id uuid,
  p_position text,
  p_starter_card_id uuid  -- NULL = clear slot
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry       contest_entry;
  v_contest     contest;
  v_card        card;
  v_is_pitcher  boolean;
BEGIN
  SELECT * INTO v_entry FROM public.contest_entry
  WHERE id = p_entry_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_lineup_slot: entry not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_entry.status <> 'building' THEN
    RAISE EXCEPTION 'update_lineup_slot: entry not building (status=%)', v_entry.status
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_contest FROM public.contest WHERE id = v_entry.contest_id;
  IF v_contest.status <> 'pending' OR v_contest.lineup_locks_at <= now() THEN
    RAISE EXCEPTION 'update_lineup_slot: contest locked' USING ERRCODE = '23514';
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

    -- If this card already occupies a different slot in this entry, move it.
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


-- ── apply_token ─────────────────────────────────────────────────────────
-- Creates a token_application bound to (token, card, contest).
-- Mutates token.applied_to_card_id + token.applied_to_contest_id.
-- Mutates card.applied_token_id.
-- If the card is rostered in the entry's lineup for this contest, also
-- updates contest_lineup_slot.token_application_id.
-- Enforces token ownership, card ownership, contest pending, token type
-- matches card type (hitter tokens on hitters, pitcher tokens on pitchers),
-- token not already applied, card not already tokened.
CREATE OR REPLACE FUNCTION public.apply_token(
  p_user_id    uuid,
  p_token_id   uuid,
  p_card_id    uuid,
  p_contest_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_token   token;
  v_card    card;
  v_player  player;
  v_contest contest;
  v_app_id  uuid;
  v_is_pitcher_token boolean;
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
  IF v_card.applied_token_id IS NOT NULL THEN
    RAISE EXCEPTION 'apply_token: card already has a token' USING ERRCODE = '23514';
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
  IF v_contest.status <> 'pending' OR v_contest.lineup_locks_at <= now() THEN
    RAISE EXCEPTION 'apply_token: contest locked' USING ERRCODE = '23514';
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
$$;

ALTER FUNCTION public.apply_token(uuid, uuid, uuid, uuid)
  SET search_path = public, pg_catalog;


-- ── remove_token ────────────────────────────────────────────────────────
-- Inverse of apply_token. Only valid while entry + contest are still editable.
CREATE OR REPLACE FUNCTION public.remove_token(
  p_user_id  uuid,
  p_app_id   uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_app     token_application;
  v_contest contest;
BEGIN
  SELECT * INTO v_app FROM public.token_application
  WHERE id = p_app_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'remove_token: application not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_app.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'remove_token: already resolved' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_contest FROM public.contest WHERE id = v_app.contest_id;
  IF v_contest.status <> 'pending' OR v_contest.lineup_locks_at <= now() THEN
    RAISE EXCEPTION 'remove_token: contest locked' USING ERRCODE = '23514';
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
$$;

ALTER FUNCTION public.remove_token(uuid, uuid)
  SET search_path = public, pg_catalog;


-- ── set_auto_sub_mode ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_auto_sub_mode(
  p_user_id  uuid,
  p_entry_id uuid,
  p_mode     auto_sub_mode
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.contest_entry
  SET auto_sub_mode = p_mode, updated_at = now()
  WHERE id = p_entry_id
    AND user_id = p_user_id
    AND status = 'building';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_auto_sub_mode: entry not found or not building'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

ALTER FUNCTION public.set_auto_sub_mode(uuid, uuid, auto_sub_mode)
  SET search_path = public, pg_catalog;


-- ── submit_lineup ───────────────────────────────────────────────────────
-- Validates: all 10 slots filled; contest still pending; user has
-- entry_fee_coins available. Debits coins if fee > 0. Atomically sets
-- status = 'submitted'.
CREATE OR REPLACE FUNCTION public.submit_lineup(
  p_user_id  uuid,
  p_entry_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry    contest_entry;
  v_contest  contest;
  v_empty    integer;
  v_balance  bigint;
BEGIN
  SELECT * INTO v_entry FROM public.contest_entry
  WHERE id = p_entry_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'submit_lineup: entry not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_entry.status <> 'building' THEN
    RAISE EXCEPTION 'submit_lineup: entry not building (status=%)', v_entry.status
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_contest FROM public.contest WHERE id = v_entry.contest_id;
  IF v_contest.status <> 'pending' OR v_contest.lineup_locks_at <= now() THEN
    RAISE EXCEPTION 'submit_lineup: contest locked' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_empty FROM public.contest_lineup_slot
  WHERE contest_entry_id = p_entry_id AND starter_card_id IS NULL;
  IF v_empty > 0 THEN
    RAISE EXCEPTION 'submit_lineup: % empty slots', v_empty USING ERRCODE = '23514';
  END IF;

  IF v_contest.entry_fee_coins > 0 THEN
    v_balance := public.spend_coins(
      p_user_id, v_entry.season_id, v_contest.entry_fee_coins,
      'contest_entry'::coin_reason, 'contest_entry', p_entry_id,
      format('contest entry: %s', v_contest.name)
    );
  ELSE
    SELECT coins INTO v_balance FROM public.user_season_state
    WHERE user_id = p_user_id AND season_id = v_entry.season_id;
  END IF;

  UPDATE public.contest_entry
  SET status = 'submitted',
      submitted_at = now(),
      entry_coin_cost = v_contest.entry_fee_coins,
      updated_at = now()
  WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'entry_id', p_entry_id,
    'status', 'submitted',
    'entry_coin_cost', v_contest.entry_fee_coins,
    'balance_after', v_balance
  );
END;
$$;

ALTER FUNCTION public.submit_lineup(uuid, uuid)
  SET search_path = public, pg_catalog;
