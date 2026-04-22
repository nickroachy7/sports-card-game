/**
 * Winning-pitcher attribution for a finalized MLB game.
 *
 * BallDontLie's SDK doesn't expose MLB's official W/L decision, so
 * we approximate. Rule (closer to MLB's actual scoring rule than the
 * legacy "most IP on winning team" heuristic):
 *
 *   1. Among pitchers on the winning team who threw ≥ 5 IP AND are
 *      listed as a Starting Pitcher in our player metadata, pick the
 *      one with the most IP. That's the W.
 *   2. If no starter qualifies (bullpen game, starter pulled early,
 *      or a reliever's turn to pocket the W), fall back to the
 *      winning-team pitcher with the most IP (floor 3 IP). That's
 *      the W.
 *   3. If no candidate meets the floor, return null — no attribution
 *      event is emitted for the game.
 *
 * This is intentionally simpler than MLB's full official rule (which
 * factors lead-changes and scorer discretion — data we don't have).
 * Matches ~90%+ of games in practice; close games with late lead
 * changes are the primary divergence.
 */

export type PitcherCandidate = {
  /** BDL player id — the external key we attribute the W against. */
  bdlPlayerId: number;
  /** Innings pitched in this game. Decimal allowed (5.1, 6.2, etc.). */
  ip: number;
  /** True when the player's primary position is "Starting Pitcher". */
  isStarter: boolean;
  /** True when the player was on the winning team in this game. */
  onWinningTeam: boolean;
};

const STARTER_FLOOR = 5;
const FALLBACK_FLOOR = 3;

/**
 * Pick the winning pitcher from a pool of candidates. Returns the
 * bdlPlayerId of the winner, or null when no candidate meets the
 * floor.
 *
 * Priority: qualifying starter (≥ 5 IP on winning team) → fallback
 * by most-IP on winning team (≥ 3 IP floor).
 */
export function pickWinningPitcher(candidates: PitcherCandidate[]): number | null {
  const onWinner = candidates.filter((c) => c.onWinningTeam);
  if (onWinner.length === 0) return null;

  // Prefer the starter with the most IP if any starter went 5+.
  const qualifyingStarters = onWinner
    .filter((c) => c.isStarter && c.ip >= STARTER_FLOOR)
    .sort((a, b) => b.ip - a.ip);
  if (qualifyingStarters.length > 0) {
    return qualifyingStarters[0].bdlPlayerId;
  }

  // Fallback: the most-IP pitcher on the winning team, floor 3 IP.
  const topByIp = onWinner.filter((c) => c.ip >= FALLBACK_FLOOR).sort((a, b) => b.ip - a.ip);
  if (topByIp.length > 0) {
    return topByIp[0].bdlPlayerId;
  }

  return null;
}
