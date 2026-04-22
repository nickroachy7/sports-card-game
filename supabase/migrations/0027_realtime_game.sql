-- ─────────────────────────────────────────────────────────────────────────
-- 0027_realtime_game.sql — publish game status changes for Supabase Realtime.
--
-- Polish spec §22. The lineup page's status chip narrates "Live · Top 5th ·
-- 3 games active" where the count depends on `public.game.status`. When a
-- game flips from 'live' → 'final', the chip should decrement in real
-- time without a refresh. Subscribing to UPDATEs on public.game gives us
-- that.
--
-- Two pieces:
--   1. REPLICA IDENTITY FULL — the default (REPLICA IDENTITY DEFAULT)
--      only sends the primary key on UPDATE events. We care about the
--      `status` column changing, so the Realtime payload needs the full
--      row. Same posture a future live-inning subscription would need.
--   2. ALTER PUBLICATION ... ADD TABLE — mirrors 0024_realtime_game_event.
--
-- No RLS change: `game_public_read` already allows anon + authenticated
-- SELECT (migration 0005). Realtime authorizes against that policy.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.game REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.game;
