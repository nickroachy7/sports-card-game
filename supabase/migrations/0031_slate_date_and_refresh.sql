-- ─────────────────────────────────────────────────────────────────────────
-- 0031_slate_date_and_refresh.sql — ET-aware slate date + refresh on read.
--
-- Polish spec §50 + §51 (Phase 19). Two fixes to the daily-contest path:
--
-- 1. `current_slate_date()` helper: 4 AM ET pivot. MLB fantasy convention —
--    late-night West Coast games (ending 1-2 AM ET) stay on "tonight's"
--    slate until 4 AM ET. Postgres CURRENT_DATE (UTC) rolls over at 8 PM
--    ET, which is the wrong answer during prime MLB evening hours.
--
-- 2. `create_daily_contest` refreshes `included_game_ids` on every call.
--    Previously the fn cached games at contest-creation time; if BDL
--    added games for today later in the day, the contest was stale. The
--    refresh runs idempotently (no UPDATE if the set is unchanged).
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Slate-date helper.
CREATE OR REPLACE FUNCTION public.current_slate_date()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'America/New_York' - INTERVAL '4 hours')::date;
$$;

ALTER FUNCTION public.current_slate_date()
  SET search_path = public, pg_catalog;

-- 2) create_daily_contest — ET-aware default + recompute included_game_ids.
CREATE OR REPLACE FUNCTION public.create_daily_contest(
  p_contest_date date DEFAULT public.current_slate_date()
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_season_id  uuid;
  v_contest_id uuid;
  v_game_ids   uuid[];
  v_starts_at  timestamptz;
BEGIN
  SELECT id INTO v_season_id FROM public.season WHERE status = 'active' LIMIT 1;
  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'create_daily_contest: no active season';
  END IF;

  v_starts_at := (p_contest_date::timestamp AT TIME ZONE 'UTC');

  -- Always compute the current game set for this date — even when
  -- reusing an existing contest — so the cache stays fresh if BDL
  -- adds games later in the day.
  SELECT COALESCE(array_agg(id ORDER BY scheduled_start NULLS LAST, id), '{}'::uuid[])
    INTO v_game_ids
  FROM public.game
  WHERE date = p_contest_date;

  -- Reuse if already exists; refresh included_game_ids if changed.
  SELECT id INTO v_contest_id
  FROM public.contest
  WHERE season_id = v_season_id
    AND type = 'daily_slate'
    AND starts_at::date = p_contest_date;

  IF v_contest_id IS NOT NULL THEN
    UPDATE public.contest
    SET included_game_ids = v_game_ids,
        updated_at = now()
    WHERE id = v_contest_id
      AND included_game_ids IS DISTINCT FROM v_game_ids;
    RETURN v_contest_id;
  END IF;

  -- New contest path. Same schema as the old fn; name uses the date
  -- formatted for display.
  INSERT INTO public.contest (
    season_id, type, name, lineup_locks_at, starts_at, ends_at,
    entry_fee_coins, status, included_game_ids
  ) VALUES (
    v_season_id,
    'daily_slate',
    format('Tonight''s Slate · %s', to_char(p_contest_date, 'Mon DD')),
    v_starts_at + INTERVAL '24 hours',
    v_starts_at,
    v_starts_at + INTERVAL '48 hours',
    0,
    'pending',
    v_game_ids
  )
  RETURNING id INTO v_contest_id;

  RETURN v_contest_id;
END;
$$;

ALTER FUNCTION public.create_daily_contest(date)
  SET search_path = public, pg_catalog;
