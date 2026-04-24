-- ─────────────────────────────────────────────────────────────────────────
-- 0053_pack_value_weights_p45.sql — Phase 45 pack odds.
--
-- Polish spec §165. Rewrites pack_value_weights to match the v1.30
-- gradient + adds `guaranteed_star_slot_per_pack` sibling for the
-- premium guaranteed-star rule. Applies to the currently-active
-- economy_config row.
--
-- Weights:
--   Daily:    0%  star /  25% starter / 75% role / 0% prospect
--   Standard: 8%  star /  40% starter / 52% role / 0% prospect
--   Premium: 18%  star /  52% starter / 30% role / 0% prospect + guaranteed star slot
-- ─────────────────────────────────────────────────────────────────────────

-- economy_config has no updated_at column (append-only by design).
-- For this phase we mutate in place on the currently-active row — the
-- column values for pack_value_weights were placeholders (everyone
-- tier=role made weighting moot), so retroactive recomputation of
-- prior pack_opening rows isn't meaningful. Append-only historical
-- tracking of economy_config revisions is a later phase if needed.
UPDATE public.economy_config
SET pack_value_weights = jsonb_build_object(
      'daily',    jsonb_build_object('star', 0,  'starter', 25, 'role', 75, 'prospect', 0),
      'standard', jsonb_build_object('star', 8,  'starter', 40, 'role', 52, 'prospect', 0),
      'premium',  jsonb_build_object('star', 18, 'starter', 52, 'role', 30, 'prospect', 0),
      'guaranteed_star_slot_per_pack', jsonb_build_object(
        'daily',    false,
        'standard', false,
        'premium',  true
      )
    )
WHERE id = (
  SELECT id FROM public.economy_config
  WHERE effective_from <= now()
  ORDER BY effective_from DESC
  LIMIT 1
);
