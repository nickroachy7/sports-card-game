-- ─────────────────────────────────────────────────────────────────────────
-- 0035_doubleheader_support.sql — first-class DH support on public.game.
--
-- Polish spec §65 (Phase 22). Two problems this solves:
--
--   1. Real doubleheaders (two distinct MLB games on the same matchup-
--      date, different start times) had no way to co-exist in our
--      schema — the lineup page's DISTINCT ON from Phase 20 was hiding
--      one of them from the UI.
--   2. BDL occasionally emits duplicate rows for the same MLB game
--      (same matchup + start time, different bdl_game_id). Observed in
--      prod today — one partner gets all the game_events, the other
--      stays empty. Dedup at schema level prevents re-insertion.
--
-- Changes:
--
--   - One-time dedup backfill. For each (date, home_team_id,
--     away_team_id) collision we rank partners by event_count DESC
--     first (so the authoritative BDL partner wins) then created_at
--     ASC. Losers' game_events get re-parented to the winner (safety
--     net for future dupes where both sides have events), then losers
--     get DELETEd.
--   - `game_number smallint` NULLable column with CHECK 1/2/NULL.
--     Existing rows backfilled to 1. Future BDL inserts leave NULL
--     until the MLB Stats pass populates.
--   - Partial unique on (date, home_team_id, away_team_id,
--     game_number) WHERE game_number IS NOT NULL — lets two BDL
--     rows co-exist as NULLs pre-enrichment; enforces uniqueness
--     once MLB Stats pass assigns numbers.
--   - Keep `bdl_game_id` unique (BDL game ids are globally unique
--     in practice).
--
-- schedule-sync will populate game_number via MLB Stats API's
-- `games[].gameNumber` in its next run.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Rank matchup-date dupes by event_count DESC, created_at ASC.
--    Stash ranked partners into a temp CTE so we can both re-parent
--    events and delete losers in the same transaction.
WITH ranked AS (
  SELECT
    g.id,
    g.date, g.home_team_id, g.away_team_id,
    (SELECT COUNT(*) FROM public.game_event ge WHERE ge.game_id = g.id) AS event_count,
    g.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY g.date, g.home_team_id, g.away_team_id
      ORDER BY
        (SELECT COUNT(*) FROM public.game_event ge WHERE ge.game_id = g.id) DESC,
        g.created_at ASC,
        g.id
    ) AS rn
  FROM public.game g
),
winners AS (
  SELECT r.date, r.home_team_id, r.away_team_id, r.id AS winner_id
  FROM ranked r
  WHERE r.rn = 1
),
losers AS (
  SELECT r.id AS loser_id,
         w.winner_id
  FROM ranked r
  JOIN winners w
    ON w.date = r.date AND w.home_team_id = r.home_team_id AND w.away_team_id = r.away_team_id
  WHERE r.rn > 1
),
-- 2) Re-parent any event rows from a loser to its winner. Only fires
--    if a loser actually has events (current prod data has at most one
--    side of each pair with events, so this is belt-and-suspenders).
reparent AS (
  UPDATE public.game_event ge
  SET game_id = l.winner_id
  FROM losers l
  WHERE ge.game_id = l.loser_id
  RETURNING ge.id
)
-- 3) Delete the loser game rows.
DELETE FROM public.game g
USING losers l
WHERE g.id = l.loser_id;

-- 4) Add game_number column (NULLable) with CHECK.
ALTER TABLE public.game
  ADD COLUMN game_number smallint;

ALTER TABLE public.game
  ADD CONSTRAINT game_game_number_valid
  CHECK (game_number IS NULL OR game_number IN (1, 2));

-- 5) Backfill existing rows to game_number=1 (post-dedup, every row
--    is the only one for its matchup-date). Future BDL inserts leave
--    NULL until MLB Stats pass assigns.
UPDATE public.game SET game_number = 1;

-- 6) Partial unique index — enforces only against non-null values so
--    BDL can land two DH rows as NULL before schedule-sync reconciles.
CREATE UNIQUE INDEX game_matchup_number_uidx
  ON public.game (date, home_team_id, away_team_id, game_number)
  WHERE game_number IS NOT NULL;
