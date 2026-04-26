-- ─────────────────────────────────────────────────────────────────────────
-- 0068_realtime_lineup_score.sql — Phase 51.
--
-- Polish spec §206–§212. The audit in P51 surfaced that
-- `contest_lineup_slot` and `contest_entry` were never added to
-- the `supabase_realtime` publication. The score reducer trigger
-- updates `live_fp` and `live_score` correctly, but the client
-- has no broadcast signal — users have to refresh the page to
-- see the new numbers.
--
-- Add both tables to the publication and set REPLICA IDENTITY FULL
-- so UPDATE payloads include the full row (matches the `game`
-- pattern shipped in 0027). RLS scopes broadcasts to each user's
-- own rows automatically (existing policies are owner-only SELECT).
--
-- After this migration, `LiveEventsProvider` (extended in the same
-- phase) subscribes to UPDATE events on both tables and pushes
-- `live_fp` / `live_score` changes into client-side hooks
-- (`useLiveSlotFp`, `useLiveEntryScore`).
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Replica identity FULL — needed so UPDATE Realtime payloads
-- include the full new row (Supabase Realtime defaults to primary
-- key only otherwise, which makes the UPDATE useless to the client).
ALTER TABLE public.contest_lineup_slot REPLICA IDENTITY FULL;
ALTER TABLE public.contest_entry REPLICA IDENTITY FULL;

-- 2) Add to the realtime publication. Idempotent via DO block —
-- ALTER PUBLICATION ... ADD TABLE errors if the table is already
-- a member, so we check first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contest_lineup_slot'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contest_lineup_slot;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contest_entry'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contest_entry;
  END IF;
END;
$$;
