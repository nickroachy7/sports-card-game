-- ─────────────────────────────────────────────────────────────────────────
-- 0057_slot_is_sticky.sql — per-slot sticky flag for lineup carry-over.
--
-- Polish spec §171 (Phase 46). Default true so existing slots
-- retroactively become sticky — the next slate-rollover after this
-- migration carries every existing user's current lineup forward.
-- New slot inserts (via create_contest_entry) inherit the default.
--
-- Sticky semantics: if `is_sticky=true`, the slot's content carries
-- over to the next slate's contest entry on the next /lineup load.
-- Toggleable per-slot via the lineup UI (see migration 0058 for the
-- update_slot_sticky helper).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.contest_lineup_slot
  ADD COLUMN IF NOT EXISTS is_sticky boolean NOT NULL DEFAULT true;
