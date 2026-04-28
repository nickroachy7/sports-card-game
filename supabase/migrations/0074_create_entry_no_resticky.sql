-- ─────────────────────────────────────────────────────────────────────────
-- Phase 58 §229. Stop sticky-carry-over from re-firing on every
-- idempotent `create_contest_entry` call.
--
-- Bug: `create_contest_entry` is called on every /lineup page load
-- (server component at `src/app/(app)/lineup/page.tsx:44`). Pre-§229
-- it called `_carry_over_sticky_slots` on BOTH the new-entry path
-- AND the existing-entry idempotent path. The idempotent path was
-- added in §173 (Phase 46 / migration 0058) as a "migration day
-- backfill" so legacy entries created before sticky existed got
-- their sticky-fill once. That backfill ran weeks ago and is no
-- longer needed.
--
-- Symptom: user removes a player from a slot → server clears it →
-- `router.refresh()` → page server-component re-runs → idempotent
-- `create_contest_entry` fires → `_carry_over_sticky_slots` walks
-- yesterday's sticky slots, finds the just-removed player, sees
-- today's slot is empty + the player has a game today, and
-- re-fills the slot. The user sees the player flicker out then
-- right back in.
--
-- Fix: drop the `PERFORM _carry_over_sticky_slots(...)` from the
-- existing-entry path. Carry-over only fires on the new-entry
-- creation path (which still runs at the 4 AM ET slate flip when
-- the day's contest first gets a /lineup visit). User removals
-- within a slate now persist.
--
-- The sticky pin contract is unchanged: pin = "carry to tomorrow,"
-- one-shot = "drops after today." Phase 58 just enforces that
-- TODAY's manual changes win against yesterday's pin within the
-- same slate.
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
BEGIN
  SELECT season_id, status, starts_at, included_game_ids
  INTO v_season_id, v_status, v_today_starts_at, v_today_game_ids
  FROM public.contest WHERE id = p_contest_id;
  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'create_contest_entry: contest not found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent lookup. §229: existing-entry path no longer runs
  -- carry-over. The user's current slot state (incl. manual clears)
  -- is authoritative within a slate.
  SELECT id INTO v_entry_id
  FROM public.contest_entry
  WHERE user_id = p_user_id AND contest_id = p_contest_id;

  IF v_entry_id IS NOT NULL THEN
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

  -- Carry-over from yesterday (§173) — runs ONCE on entry creation,
  -- at the 4 AM ET slate flip when the user first visits /lineup
  -- for the new day. Pre-fills empty slots from yesterday's sticky
  -- picks where the player has a game today.
  PERFORM public._carry_over_sticky_slots(
    p_user_id, v_entry_id, v_today_starts_at, v_today_game_ids
  );

  RETURN v_entry_id;
END;
$$;

ALTER FUNCTION public.create_contest_entry(uuid, uuid)
  SET search_path = public, pg_catalog;
