-- ─────────────────────────────────────────────────────────────────────────
-- 0050_release_stale_contest_holds.sql — release card + token holds in
-- stale contest entries.
--
-- Post-Phase-39 the Submit button is gone; entries stay in 'building'
-- forever unless their games finalize and the per-game reconcile
-- fires. If a user drafted a lineup yesterday but today rolled over
-- without any games that touched yesterday's cards, yesterday's entry
-- stays 'building' with starter_card_id refs + token bindings still
-- active. Those bindings then block quick_sell / vault today ("card
-- has an applied token" — from yesterday's ghost lineup).
--
-- This sweep runs on every /lineup page load alongside
-- reconcile_missed_tokens(). Cheap: bounded by the user's historical
-- entries, typically a handful.
--
-- Behavior:
--   1. Find user's entries in contests OTHER than today's where
--      the entry isn't already 'final'.
--   2. For each card held by those entries' slots, clear
--      applied_token_id IF the card isn't also slotted in today's
--      entry (defensive — today's binding wins).
--   3. For each token bound to a stale-entry card, clear
--      applied_to_card_id / applied_to_contest_id (unless also
--      bound via today's entry).
--   4. Null out starter_card_id + token_application_id on stale
--      slots. Delete unresolved token_applications tied to stale
--      contests.
--   5. Mark stale entries as 'final' with final_score=0 so they
--      don't reappear on the next sweep. (No 'canceled' status
--      exists on contest_entry; 'final' + 0 score is the idiom.)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.release_stale_contest_holds(
  p_user_id            uuid,
  p_current_contest_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_stale_entry_ids  uuid[];
  v_stale_contest_ids uuid[];
BEGIN
  SELECT array_agg(ce.id), array_agg(DISTINCT ce.contest_id)
  INTO v_stale_entry_ids, v_stale_contest_ids
  FROM public.contest_entry ce
  WHERE ce.user_id = p_user_id
    AND ce.contest_id <> p_current_contest_id
    AND ce.status <> 'final';

  IF v_stale_entry_ids IS NULL OR array_length(v_stale_entry_ids, 1) = 0 THEN
    RETURN;
  END IF;

  -- Release applied_token_id on cards held by stale slots. Skip any
  -- card that's currently in today's lineup — today's binding takes
  -- priority.
  UPDATE public.card c
  SET applied_token_id = NULL,
      updated_at = now()
  WHERE c.user_id = p_user_id
    AND c.applied_token_id IS NOT NULL
    AND c.id IN (
      SELECT DISTINCT s.starter_card_id
      FROM public.contest_lineup_slot s
      WHERE s.contest_entry_id = ANY(v_stale_entry_ids)
        AND s.starter_card_id IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.contest_lineup_slot s2
      JOIN public.contest_entry ce2 ON ce2.id = s2.contest_entry_id
      WHERE s2.starter_card_id = c.id
        AND ce2.contest_id = p_current_contest_id
        AND ce2.user_id = p_user_id
    );

  -- Release tokens bound via stale-entry applications. Don't release
  -- a token that's still bound via today's entry (user may have
  -- reapplied it).
  UPDATE public.token t
  SET applied_to_card_id    = NULL,
      applied_to_contest_id = NULL,
      updated_at            = now()
  WHERE t.user_id = p_user_id
    AND t.consumed_at IS NULL
    AND t.applied_to_card_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.token_application ta
      WHERE ta.token_id = t.id
        AND ta.contest_id = ANY(v_stale_contest_ids)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.token_application ta2
      WHERE ta2.token_id = t.id
        AND ta2.resolved_at IS NULL
        AND ta2.contest_id = p_current_contest_id
    );

  -- Clear slot-level refs on the stale entries. Cosmetic — the
  -- entries are about to be marked final.
  UPDATE public.contest_lineup_slot
  SET starter_card_id      = NULL,
      token_application_id = NULL
  WHERE contest_entry_id = ANY(v_stale_entry_ids);

  -- Drop unresolved token_applications tied to stale contests. These
  -- were never going to resolve anyway (contest never went live for
  -- this entry); removing them keeps the audit table clean.
  DELETE FROM public.token_application
  WHERE resolved_at IS NULL
    AND user_id = p_user_id
    AND contest_id = ANY(v_stale_contest_ids);

  -- Finalize the entries so the sweep skips them next time.
  UPDATE public.contest_entry
  SET status       = 'final',
      final_score  = 0,
      updated_at   = now()
  WHERE id = ANY(v_stale_entry_ids);
END;
$$;

ALTER FUNCTION public.release_stale_contest_holds(uuid, uuid)
  SET search_path = public, pg_catalog;
