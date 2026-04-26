/**
 * Polish spec §213 (Phase 51 hotfix). Client-side mirror of the
 * SQL trust predicate from §190 (`public.is_trustworthy_final`).
 *
 * Used by:
 *   - `fetchGameStateById` server query (initial seed)
 *   - `applyGameStateUpdate` realtime channel handler
 *
 * Both paths feed `LiveEventsProvider.gameState`. Without this
 * shared demote, P51 regressed P48: the SQL display CTE in
 * `fetchSlotGameByCardId` demoted untrustworthy finals correctly,
 * but the realtime override (added in P51) pushed raw DB values
 * to the client — the SlotGameState pill rendered "FINAL T 0-0"
 * for BDL's bogus finals.
 *
 * Mirrors the SQL exactly:
 *   - status='final' is "trustworthy" iff start is set, was at least
 *     2h ago, scores are populated, AND not 0-0.
 *   - Any other final → demote display:
 *     - start NULL or in the future  → 'scheduled'
 *     - else                         → 'live'
 *   - In either demote case, scores zero out (NULL).
 *
 * 2-hour grace covers all realistic MLB game lengths (avg 2h 50min,
 * shortest ~78 min historically). 0-0 final is structurally
 * impossible in 2026 MLB (Manfred ghost-runner guarantees a winner).
 */

import type { LiveGameStateSnapshot } from "@/lib/lineup/types";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export function applyGameStateTrustGate(state: LiveGameStateSnapshot): LiveGameStateSnapshot {
  if (state.status !== "final") return state;

  const startMs = state.scheduledStart ? new Date(state.scheduledStart).getTime() : null;
  const now = Date.now();

  const trustworthy =
    startMs !== null &&
    startMs <= now - TWO_HOURS_MS &&
    state.homeRuns !== null &&
    state.awayRuns !== null &&
    !(state.homeRuns === 0 && state.awayRuns === 0);

  if (trustworthy) return state;

  // Demote: scheduled if start unknown / future, otherwise live.
  // Scores zero out so the W/L renderer never sees bogus values.
  const demoted: LiveGameStateSnapshot["status"] =
    startMs === null || startMs > now ? "scheduled" : "live";

  return {
    ...state,
    status: demoted,
    homeRuns: null,
    awayRuns: null,
  };
}
