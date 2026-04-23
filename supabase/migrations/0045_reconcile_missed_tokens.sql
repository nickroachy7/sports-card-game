-- 0045 — reconcile_missed_tokens() sweep function.
--
-- Phase 40 §128 flipped un-triggered applied tokens to `false` inside
-- `_finalize_contest_entry` — but that fn only runs when an entry
-- transitions to 'final'. Phase 39 removed the user-initiated Submit
-- flow, so entries sit in 'building' indefinitely and finalize never
-- runs. Users saw tokens stuck on "pending" (null) even when the
-- player's game was clearly over.
--
-- Fix: a sweep fn that marks misses based purely on game state.
-- Called from the /lineup page load (server component) so the UI
-- reflects reality on every visit. Independent of contest /
-- entry status — the single source of truth is whether the player's
-- game is final/canceled/postponed.
--
-- Cheap enough to run on every page load: one CTE-driven UPDATE
-- filtered to `triggered IS NULL` + final-ish game status. No-op
-- when nothing needs flipping.

CREATE OR REPLACE FUNCTION public.reconcile_missed_tokens()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_count integer;
BEGIN
  WITH to_miss AS (
    SELECT ta.id
    FROM public.token_application ta
    JOIN public.contest_lineup_slot s ON s.token_application_id = ta.id
    JOIN public.card c ON c.id = s.starter_card_id
    JOIN public.player p ON p.id = c.player_id
    JOIN public.contest con ON con.id = ta.contest_id
    JOIN public.game g ON g.id = ANY(con.included_game_ids)
      AND (g.home_team_id = p.team_id OR g.away_team_id = p.team_id)
    WHERE ta.triggered IS NULL
      AND g.status IN ('final', 'canceled', 'postponed')
  ),
  updated AS (
    UPDATE public.token_application ta
    SET triggered = false
    WHERE ta.id IN (SELECT id FROM to_miss)
    RETURNING ta.id
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$function$;

ALTER FUNCTION public.reconcile_missed_tokens() SET search_path = public, pg_catalog;
