-- ─────────────────────────────────────────────────────────────────────────
-- 0029_per_slot_lock.sql — per-slot lock helper + token_application realtime.
--
-- Polish spec §44 (Phase 18): swap contest-level 'locked' semantics for per-
-- slot lock. A slot locks when its player's game has started
-- (`status IN ('live','final')` OR `scheduled_start <= now()`). Other slots
-- stay editable.
--
-- Polish spec §47 (Phase 18): event feed gains token trigger narration; the
-- `token_application` table needs to be in the Supabase realtime
-- publication + REPLICA IDENTITY FULL so client subscribers see the full
-- row on UPDATE events.
--
-- Two pieces:
--   1. `is_slot_locked(slot_id)` helper used by the mutation SQL fns.
--   2. Realtime publication addition for `token_application`.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Per-slot lock helper.
CREATE OR REPLACE FUNCTION public.is_slot_locked(p_slot_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT
        g.status IN ('live', 'final')
        OR (g.scheduled_start IS NOT NULL AND g.scheduled_start <= now())
      FROM public.contest_lineup_slot s
      JOIN public.contest_entry ce ON ce.id = s.contest_entry_id
      JOIN public.contest c ON c.id = ce.contest_id
      JOIN public.card crd ON crd.id = s.starter_card_id
      JOIN public.player p ON p.id = crd.player_id
      JOIN public.game g ON g.id = ANY(c.included_game_ids)
        AND (g.home_team_id = p.team_id OR g.away_team_id = p.team_id)
      WHERE s.id = p_slot_id
      ORDER BY g.scheduled_start ASC NULLS LAST
      LIMIT 1
    ),
    false -- no game today → not locked
  );
$$;

ALTER FUNCTION public.is_slot_locked(uuid)
  SET search_path = public, pg_catalog;

-- 2) token_application → realtime publication.
ALTER TABLE public.token_application REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.token_application;
