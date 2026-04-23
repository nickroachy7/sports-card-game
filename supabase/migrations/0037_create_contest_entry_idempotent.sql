-- ─────────────────────────────────────────────────────────────────────────
-- 0037_create_contest_entry_idempotent.sql — reorder the status guard
-- in public.create_contest_entry so the function is truly idempotent.
--
-- Bug surfaced in prod: once today's daily contest transitions through
-- pending → live → final, any /lineup page load throws
-- `create_contest_entry: contest not pending (status=final)` — even
-- for users who already have an entry. The status guard in the
-- original function (migration 0011) fires BEFORE the
-- "entry-already-exists" lookup, so returning-users can't load their
-- own finalized lineup after the contest ends.
--
-- The fix: check for an existing entry first and return it if found,
-- regardless of contest status. Only fail the status guard when
-- actually trying to create a NEW entry (user with no prior entry +
-- contest no longer pending).
--
-- Behavior preserved 1:1 for the happy path (pending contest, user
-- has no entry → creates entry + seeds 10 slots + returns id). The
-- only behavior change is that users with an existing entry can
-- now load /lineup post-contest-finalization.
-- ─────────────────────────────────────────────────────────────────────────

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

  -- Idempotent lookup runs FIRST — if the user already has an entry
  -- for this contest, return it regardless of contest status. Fixes
  -- the regression where post-final contest loads threw on every
  -- /lineup page render.
  SELECT id INTO v_entry_id
  FROM public.contest_entry
  WHERE user_id = p_user_id AND contest_id = p_contest_id;
  IF v_entry_id IS NOT NULL THEN
    RETURN v_entry_id;
  END IF;

  -- Only block NEW entry creation when the contest has moved past
  -- pending. Existing entries surface unconditionally (above).
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

  RETURN v_entry_id;
END;
$$;

ALTER FUNCTION public.create_contest_entry(uuid, uuid)
  SET search_path = public, pg_catalog;
