-- ─────────────────────────────────────────────────────────────────────────
-- 0054_single_pack_type.sql — collapse to one paid pack type.
--
-- User feedback on P45 live: "I think we just need one pack type and
-- it should be luck of the draw." Retires the Standard/Premium
-- distinction. The `pack_type` enum keeps 'premium' for historical
-- pack_opening rows but the UI never surfaces it and weights become
-- moot.
--
-- Changes:
--   - `standard` weights → 10% star / 40% starter / 50% role (the
--     new "middle of the road" distribution — roughly the midpoint
--     between the prior Standard and Premium gradients).
--   - `guaranteed_star_slot_per_pack` dropped entirely. Every slot
--     is independent luck-of-the-draw.
--   - `daily` stays at its bench-weighted odds (0/25/75) — still the
--     free once-a-day gift.
--   - `premium` weights zeroed out (no UI path to buy one anyway).
-- ─────────────────────────────────────────────────────────────────────────

UPDATE public.economy_config
SET pack_value_weights = jsonb_build_object(
      'daily',    jsonb_build_object('star', 0,  'starter', 25, 'role', 75, 'prospect', 0),
      'standard', jsonb_build_object('star', 10, 'starter', 40, 'role', 50, 'prospect', 0),
      'premium',  jsonb_build_object('star', 0,  'starter', 0,  'role', 0,  'prospect', 0)
    )
WHERE id = (
  SELECT id FROM public.economy_config
  WHERE effective_from <= now()
  ORDER BY effective_from DESC
  LIMIT 1
);
