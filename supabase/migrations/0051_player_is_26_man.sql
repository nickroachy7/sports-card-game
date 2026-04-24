-- ─────────────────────────────────────────────────────────────────────────
-- 0051_player_is_26_man.sql — MLB 26-man active-roster flag.
--
-- Polish spec §162 (Phase 45). `is_active_40_man` (BDL-sourced) stays
-- as-is — it marks everyone on someone's 40-man. `is_26_man` (new)
-- is the tighter subset: players currently on an MLB active roster.
-- Sourced from MLB Stats API (statsapi.mlb.com), refreshed daily at
-- 4 AM ET via `/api/cron/mlb-26man-sync`.
--
-- open_pack (Phase 45 rewrite in migration 0052) filters to
-- is_26_man = true so AAA-optioned players don't appear in packs.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.player
  ADD COLUMN IF NOT EXISTS is_26_man boolean NOT NULL DEFAULT false;

-- Partial index — small footprint, speeds up the open_pack filter.
CREATE INDEX IF NOT EXISTS player_is_26_man_idx
  ON public.player (mlbam_id)
  WHERE is_26_man = true;
