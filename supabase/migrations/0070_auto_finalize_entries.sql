-- ─────────────────────────────────────────────────────────────────────────
-- 0070_auto_finalize_entries.sql — Phase 53A (final form).
--
-- Polish spec §215. Per-user contest entries never auto-finalized
-- when their slate ended. Side effect: the score reducer
-- (`_apply_game_event_to_lineups`) credits FP to every entry where
-- `ce.status <> 'final'`, so events from later days landed on prior
-- "still-open" entries — the "ghost FP" the user observed (April 25
-- entry sitting at 106 FP from accumulated April 26/27 events).
--
-- Three pieces:
--   1. `_check_and_finalize_entry(p_entry_id)` — if all the entry's
--      contest games are "done", flip status='final' and write
--      final_score from slot live_fp sum. "Done" predicate covers
--      sandbox-quirky cases:
--        - Trustworthy-final per §190 (gold standard), OR
--        - scheduled_start IS NULL (TBD games that never properly
--          materialized — don't block), OR
--        - scheduled_start > 24h ago (BDL-missing-game.ended fallback;
--          real MLB games take 3-4h, 24h is a safe floor)
--   2. `_finalize_entries_for_game(p_game_id)` — webhook helper.
--      `mlb.game.ended` → flip game to final → call this →
--      check every entry whose contest includes the game.
--   3. One-shot backfill — flip every current non-final entry that
--      already meets the "done" predicate.
--
-- final_score uses `sum(slot.live_fp)` rather than `sum(slot.final_fp)`
-- so sandbox runs (where reconcile returns bogus 0-0 box scores +
-- zero final_fp) still surface trigger-summed FP. live_fp is the
-- running total from the score reducer; final_fp is reconcile's
-- post-game writeback. In normal ops they should match.
--
-- (Filed migrations 0070 + 0071 + 0072 during prod iteration; this
-- file consolidates the final form. Each ALTER applied via MCP at
-- the time of writing; this canonical SQL re-applies cleanly via
-- CREATE OR REPLACE.)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._check_and_finalize_entry(
  p_entry_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_contest_id  uuid;
  v_game_ids    uuid[];
  v_unfinished  integer;
  v_total       numeric;
BEGIN
  SELECT ce.contest_id, c.included_game_ids
  INTO v_contest_id, v_game_ids
  FROM public.contest_entry ce
  JOIN public.contest c ON c.id = ce.contest_id
  WHERE ce.id = p_entry_id
    AND ce.status <> 'final'
  FOR UPDATE OF ce;

  IF v_contest_id IS NULL THEN RETURN false; END IF;
  IF v_game_ids IS NULL OR array_length(v_game_ids, 1) IS NULL THEN
    RETURN false;
  END IF;

  -- Count games still blocking finalize.
  -- A game blocks iff: has a real scheduled_start, AND not yet
  -- trustworthy-final, AND start within last 24h (still possibly
  -- running). NULL-start + >24h-old games never block.
  SELECT count(*) INTO v_unfinished
  FROM public.game g
  WHERE g.id = ANY(v_game_ids)
    AND g.scheduled_start IS NOT NULL
    AND NOT (
      g.status = 'final'
      AND public.is_trustworthy_final(
            g.status, g.scheduled_start, g.home_runs, g.away_runs)
    )
    AND g.scheduled_start > now() - INTERVAL '24 hours';

  IF v_unfinished > 0 THEN RETURN false; END IF;

  -- All games done → finalize. final_score from live_fp sum
  -- (sandbox-resilient — see header).
  SELECT COALESCE(SUM(s.live_fp), 0) INTO v_total
  FROM public.contest_lineup_slot s
  WHERE s.contest_entry_id = p_entry_id;

  UPDATE public.contest_entry
  SET status = 'final'::contest_entry_status,
      final_score = v_total,
      updated_at = now()
  WHERE id = p_entry_id AND status <> 'final';

  RETURN true;
END;
$$;

ALTER FUNCTION public._check_and_finalize_entry(uuid)
  SET search_path = public, pg_catalog;


CREATE OR REPLACE FUNCTION public._finalize_entries_for_game(
  p_game_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id uuid;
  v_count    integer := 0;
BEGIN
  FOR v_entry_id IN
    SELECT ce.id
    FROM public.contest_entry ce
    JOIN public.contest c ON c.id = ce.contest_id
    WHERE ce.status <> 'final'
      AND p_game_id = ANY(c.included_game_ids)
  LOOP
    IF public._check_and_finalize_entry(v_entry_id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

ALTER FUNCTION public._finalize_entries_for_game(uuid)
  SET search_path = public, pg_catalog;


-- One-shot backfill at migration time.
DO $$
DECLARE
  v_entry_id uuid;
  v_count    integer := 0;
BEGIN
  FOR v_entry_id IN SELECT id FROM public.contest_entry WHERE status <> 'final'
  LOOP
    IF public._check_and_finalize_entry(v_entry_id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '_check_and_finalize_entry backfill: % entries finalized', v_count;
END;
$$;
