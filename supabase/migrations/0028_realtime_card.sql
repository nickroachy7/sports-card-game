-- ─────────────────────────────────────────────────────────────────────────
-- 0028_realtime_card.sql — publish card changes for Supabase Realtime.
--
-- Polish spec §30. The lineup page's per-slot contract-depletion glow
-- subscribes to UPDATE events on public.card filtered to rostered
-- card_ids. When reconcile decrements contract_plays_remaining, the
-- slot briefly pulses amber with "-1 play" narration (sibling to
-- Phase 12's per-slot FP glow).
--
-- REPLICA IDENTITY FULL emits the full row on UPDATE events (the
-- default only sends the primary key). The contract-glow hook keys
-- on contract_plays_remaining specifically — without the full row we
-- wouldn't see the decrement. Same pattern as migration 0027 for
-- game + 0024 for game_event.
--
-- No RLS change needed. `card` already has an owner-scoped SELECT
-- policy (card_owner_select) that Realtime will authorize against.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.card REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.card;
