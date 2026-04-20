-- ─────────────────────────────────────────────────────────────────────────
-- 0007_seed_season.sql — insert the 2026 MLB season as the inaugural
-- Draft Deck season. Status is 'active' since today's date (2026-04-20)
-- is past Opening Day (2026-03-26). world_series_end left NULL until the
-- postseason schedule is finalized.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.season (year, opening_day, status)
VALUES (2026, '2026-03-26', 'active')
ON CONFLICT (year) DO NOTHING;
