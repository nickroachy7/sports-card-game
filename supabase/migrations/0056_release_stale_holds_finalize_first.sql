-- ─────────────────────────────────────────────────────────────────────────
-- 0056_release_stale_holds_finalize_first.sql — partition stale-sweep.
--
-- Bug surfaced by user: yesterday's contest entry had 33 live_fp
-- accumulated from real game events (4 slots scored: 1B=6, 2B=20,
-- C=2, OF2=5). When the user loaded /lineup today, the previous
-- release_stale_contest_holds sweep treated yesterday's pending
-- entry as "stale" — it set status=final, final_score=0, AND
-- nulled starter_card_id on every slot. The proper FP rollup
-- (_finalize_contest_entry → card.career_fp_total) was never
-- called, AND the slot→card mapping needed to do it later got
-- destroyed in the same sweep. The 33 FP is unrecoverable on prod.
--
-- Fix: partition the sweep based on real game activity:
--   - "active" = entry has live_score > 0 or any slot has live_fp > 0
--     → call _finalize_contest_entry (proper FP rollup) instead of
--     zero-out cleanup.
--   - "truly stale" = no game activity, no real lineup played
--     → existing zero-out cleanup (the original Phase 41 intent).
--
-- _finalize_contest_entry is idempotent — it consumes slot.live_fp
-- into card.career_fp_total, sets slot.final_fp = live_fp, marks
-- contract_play_consumed = true, and sets entry.status = 'final'
-- with the correct final_score. Calling it on an entry that was
-- already partially finalized (e.g. partial slot consume) is safe.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.release_stale_contest_holds(
  p_user_id            uuid,
  p_current_contest_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_stale_entry_ids   uuid[];
  v_active_entry_ids  uuid[];
  v_stale_contest_ids uuid[];
  v_entry_id          uuid;
BEGIN
  -- Identify candidate entries (user's, not today's, not yet final).
  -- Partition by real game activity. has_activity = either entry
  -- live_score > 0 OR any slot live_fp > 0.
  WITH partitioned AS (
    SELECT ce.id,
           ce.contest_id,
           (
             ce.live_score > 0
             OR EXISTS (
               SELECT 1 FROM public.contest_lineup_slot s
               WHERE s.contest_entry_id = ce.id AND s.live_fp > 0
             )
           ) AS has_activity
    FROM public.contest_entry ce
    WHERE ce.user_id = p_user_id
      AND ce.contest_id <> p_current_contest_id
      AND ce.status <> 'final'
  )
  SELECT
    array_agg(id) FILTER (WHERE NOT has_activity),
    array_agg(id) FILTER (WHERE has_activity),
    array_agg(DISTINCT contest_id) FILTER (WHERE NOT has_activity)
  INTO v_stale_entry_ids, v_active_entry_ids, v_stale_contest_ids
  FROM partitioned;

  -- ── ACTIVE: proper FP rollup ────────────────────────────────────
  -- _finalize_contest_entry consumes live_fp → final_fp + adds to
  -- card.career_fp_total + sets entry status='final' + final_score.
  -- Idempotent.
  IF v_active_entry_ids IS NOT NULL AND array_length(v_active_entry_ids, 1) > 0 THEN
    FOREACH v_entry_id IN ARRAY v_active_entry_ids LOOP
      PERFORM public._finalize_contest_entry(v_entry_id);
    END LOOP;
  END IF;

  -- ── TRULY STALE: zero-out cleanup ──────────────────────────────
  -- No game activity, no real lineup. Same behavior as before this
  -- migration: clear card token bindings, slot refs, delete
  -- unresolved token_applications, mark entries final with score 0.
  IF v_stale_entry_ids IS NULL OR array_length(v_stale_entry_ids, 1) = 0 THEN
    RETURN;
  END IF;

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

  UPDATE public.contest_lineup_slot
  SET starter_card_id      = NULL,
      token_application_id = NULL
  WHERE contest_entry_id = ANY(v_stale_entry_ids);

  DELETE FROM public.token_application
  WHERE resolved_at IS NULL
    AND user_id = p_user_id
    AND contest_id = ANY(v_stale_contest_ids);

  UPDATE public.contest_entry
  SET status      = 'final',
      final_score = 0,
      updated_at  = now()
  WHERE id = ANY(v_stale_entry_ids);
END;
$$;

ALTER FUNCTION public.release_stale_contest_holds(uuid, uuid)
  SET search_path = public, pg_catalog;
