-- ─────────────────────────────────────────────────────────────────────────
-- 0032_game_live_inning.sql — live inning tracking on public.game.
--
-- Polish spec §54 (Phase 20). The webhook handler already receives
-- `play.inning` + `play.inning_half` on every batter event but only
-- writes them to `game_event`. Surface on `public.game` so the slot
-- footer can show "LIVE · T5 · 2-1" without its own per-game Realtime
-- subscription (we already have `game` in the publication).
--
-- `current_inning_half` is constrained to 'top' / 'bottom' / NULL via
-- a CHECK. `current_inning` stays untyped int (1-15+ in practice).
-- Both NULL when the game is scheduled or final.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.game
  ADD COLUMN current_inning integer,
  ADD COLUMN current_inning_half text;

ALTER TABLE public.game
  ADD CONSTRAINT game_current_inning_half_valid
  CHECK (current_inning_half IN ('top', 'bottom') OR current_inning_half IS NULL);
