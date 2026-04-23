/**
 * Manager-level XP thresholds — mirrored from the active economy_config
 * seed in `supabase/migrations/0006_seed_economy_config.sql`. Lives in
 * TypeScript so the profile drawer + other surfaces can compute
 * "progress to next level" without a DB round-trip.
 *
 * The actual level is recomputed server-side in `grant_manager_xp`
 * (migration 0001) using the same array; this copy is display-only.
 * If the economy_config thresholds ever change, update this constant
 * too.
 */
export const MANAGER_XP_LEVEL_THRESHOLDS: readonly number[] = [
  100, 250, 500, 1000, 2000, 4000, 7500, 12500, 20000, 30000, 45000, 65000, 90000, 125000, 175000,
  250000,
];

export type LevelProgress = {
  /** XP earned toward the next level (since the previous threshold). */
  earned: number;
  /** Total XP needed between the previous level and the next. */
  span: number;
  /** Percent complete 0–1 (for a progress bar width). */
  fraction: number;
  /** True when the user has already reached the highest level. */
  maxed: boolean;
};

/**
 * Compute progress toward the next level from raw XP + current level.
 *
 * Level is 1-indexed:
 *   - Level 1 = 0 thresholds passed, next threshold = array[0]
 *   - Level 2 = 1 threshold passed, next threshold = array[1]
 *   - Level N = N-1 thresholds passed, next threshold = array[N-1]
 *
 * Max level = thresholds.length + 1 (all thresholds passed).
 */
export function computeLevelProgress(xp: number, level: number): LevelProgress {
  const thresholds = MANAGER_XP_LEVEL_THRESHOLDS;
  if (level > thresholds.length) {
    return { earned: 0, span: 0, fraction: 1, maxed: true };
  }
  const prev = level > 1 ? (thresholds[level - 2] ?? 0) : 0;
  const next = thresholds[level - 1] ?? 0;
  const span = Math.max(1, next - prev);
  const earned = Math.max(0, xp - prev);
  const fraction = Math.min(1, earned / span);
  return { earned, span, fraction, maxed: false };
}
