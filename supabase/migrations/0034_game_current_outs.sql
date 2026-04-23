-- ─────────────────────────────────────────────────────────────────────────
-- 0034_game_current_outs.sql — live outs tracking on public.game.
--
-- Polish spec §64 (Phase 22). Webhook handler already receives
-- `payload.play?.outs` on every batter event but doesn't surface it.
-- Add a smallint column + CHECK constraint; the handler updates it
-- idempotently (IS DISTINCT FROM). LIVE slot footer renders
-- "LIVE · T5 2O · 2-1" when populated.
--
-- Column is nullable: NULL when scheduled or final (cleared by
-- handleGameEnded); 0-2 during live play (seeded to 0 by
-- handleGameStarted).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.game
  ADD COLUMN current_outs smallint;

ALTER TABLE public.game
  ADD CONSTRAINT game_current_outs_valid
  CHECK (current_outs IS NULL OR (current_outs >= 0 AND current_outs <= 2));
