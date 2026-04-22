-- ─────────────────────────────────────────────────────────────────────────
-- 0024_realtime_game_event.sql — publish game_event for Supabase Realtime.
--
-- Polish spec §16.3. The lineup page's Event Feed subscribes to INSERTs
-- on public.game_event via Supabase Realtime. Tables must be members of
-- the `supabase_realtime` publication for the Realtime server to emit
-- changes to them; default publications don't auto-include our tables.
--
-- Only INSERTs matter for the feed (game_events are append-only). No RLS
-- change needed — `game_event_public_read` already allows anon +
-- authenticated SELECT (migration 0005), which is what the Realtime
-- WebSocket authorizes against.
-- ─────────────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.game_event;
