-- ─────────────────────────────────────────────────────────────────────────
-- 0006_seed_economy_config.sql — launch defaults per DB schema spec §12.1.
-- One row; get_active_economy_config() returns it.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.economy_config (
  collection_cap,
  contract_default_plays,
  vault_cap_per_season,
  tier_fp_thresholds,
  quick_sell_values,
  extension_cost_per_play,
  extension_escalator,
  pack_prices_coins,
  pack_sizes,
  pack_value_weights,
  token_bonus_fp,
  token_drop_rates,
  login_streak_rewards,
  milestone_tiers,
  milestone_rewards,
  manager_xp_sources
) VALUES (
  100,
  15,
  10,
  '{"bronze": 0, "silver": 250, "gold": 1000, "diamond": 5000}'::jsonb,
  '{"bronze": 10, "silver": 50, "gold": 200, "diamond": 1000}'::jsonb,
  '{"bronze": 20, "silver": 50, "gold": 150, "diamond": 500}'::jsonb,
  1.50,
  '{"daily": 0, "standard": 250, "premium": 1000}'::jsonb,
  '{"daily": 3, "standard": 5, "premium": 8}'::jsonb,
  -- Distribution of player_value_tier by pack type. Rows must sum to 100.
  '{
    "daily":    {"star": 5,  "starter": 20, "role": 60, "prospect": 15},
    "standard": {"star": 10, "starter": 30, "role": 50, "prospect": 10},
    "premium":  {"star": 25, "starter": 40, "role": 30, "prospect": 5}
  }'::jsonb,
  -- Bonus FP awarded when each token type triggers.
  '{
    "hr_bonus":             5.0,
    "multi_hit_bonus":      3.0,
    "sb_bonus":             4.0,
    "strikeout_bonus":      0.5,
    "quality_start_bonus":  6.0
  }'::jsonb,
  -- Probability a pack awards a token, per pack type.
  '{
    "daily":    0.10,
    "standard": 0.25,
    "premium":  0.60
  }'::jsonb,
  -- Login streak coin rewards by streak day (index = day - 1).
  '[25, 50, 75, 100, 150, 200, 300]'::jsonb,
  -- Tier thresholds per milestone key.
  '{
    "hits":          [50, 250, 500, 1000],
    "home_runs":     [10, 50, 100, 250],
    "stolen_bases":  [10, 50, 100, 200],
    "pitching_wins": [5, 25, 50, 100]
  }'::jsonb,
  -- Reward bundle per milestone-tier crossing.
  '{
    "hits":          [{"coins":100,"xp":100},{"coins":250,"xp":250},{"coins":500,"xp":500},{"coins":1500,"xp":1500}],
    "home_runs":     [{"coins":100,"xp":100},{"coins":250,"xp":250},{"coins":500,"xp":500},{"coins":1500,"xp":1500}],
    "stolen_bases":  [{"coins":100,"xp":100},{"coins":250,"xp":250},{"coins":500,"xp":500},{"coins":1500,"xp":1500}],
    "pitching_wins": [{"coins":100,"xp":100},{"coins":250,"xp":250},{"coins":500,"xp":500},{"coins":1500,"xp":1500}]
  }'::jsonb,
  -- Manager XP: per-event amounts + level curve.
  '{
    "per_event": {
      "contest_entry":      10,
      "contest_win":        100,
      "contest_top_10":     25,
      "pack_opened":        5,
      "contract_extended":  5,
      "diamond_vaulted":    500,
      "token_triggered":    15,
      "milestone_tier_hit": 250
    },
    "level_thresholds": [
      100, 250, 500, 1000, 2000, 4000, 7500, 12500, 20000,
      30000, 45000, 65000, 90000, 125000, 175000, 250000
    ]
  }'::jsonb
);
