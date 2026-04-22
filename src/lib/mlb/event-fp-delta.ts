/**
 * Per-event FP delta approximation for the live event feed.
 *
 * Reconcile is the authoritative scoring path (see
 * `src/lib/mlb/reconcile.ts`) — it pulls aggregate box scores at
 * game end and writes final_fp. This helper is UX narration only:
 * one row in the feed per webhook event, labeled with the
 * approximate FP change. Small divergences vs. the eventual
 * reconcile total are acceptable for the feed; the Box Score
 * section of the sidebar always reads the authoritative slot FP.
 *
 * Approximations worth calling out:
 *   - HR as a batter scores +12 here (HR +10 + implicit own-run +2).
 *     Other RBIs on the swing aren't captured without
 *     baserunner-state lookups.
 *   - HR as a pitcher scores -2.67 (hit allowed -0.67 + ER -2).
 *     Additional runs off that pitcher come in via later events.
 *   - "hit" events default to a single's +3 unless play.type
 *     disambiguates to double / triple / home run.
 */

import type { TokenType } from "@/lib/contracts/cards";

export type FpDeltaRole = "batter" | "pitcher";

const HIT_DELTA_HITTER: Record<string, number> = {
  single: 3,
  "bunt single": 3,
  "infield single": 3,
  double: 5,
  triple: 8,
  "home run": 12,
};

export function eventFpDelta(
  eventType: string,
  playType: string | null | undefined,
  role: FpDeltaRole,
): number {
  if (role === "batter") {
    if (eventType === "mlb.batter.home_run") return 12;
    if (eventType === "mlb.batter.hit") {
      const normalized = (playType ?? "").toLowerCase().trim();
      if (normalized in HIT_DELTA_HITTER) return HIT_DELTA_HITTER[normalized] ?? 3;
      // Unknown hit variant → default to single.
      return 3;
    }
    if (eventType === "mlb.batter.walk") return 2;
    if (eventType === "mlb.batter.hit_by_pitch") return 2;
    return 0;
  }
  // Pitcher role — same event catalogue, different signs.
  if (eventType === "mlb.batter.strikeout") return 2;
  if (eventType === "mlb.batter.walk") return -0.6;
  if (eventType === "mlb.batter.hit_by_pitch") return -0.6;
  if (eventType === "mlb.batter.home_run") return -2.67;
  if (eventType === "mlb.batter.hit") return -0.67;
  return 0;
}

/**
 * Short action label for the event feed — derived from the BDL
 * event type and play text. Falls back to a generic label when
 * we can't tell.
 */
export function eventActionLabel(eventType: string, playType: string | null | undefined): string {
  const pt = (playType ?? "").trim();
  switch (eventType) {
    case "mlb.batter.home_run":
      return "hit a home run";
    case "mlb.batter.hit": {
      const n = pt.toLowerCase();
      if (n.includes("home")) return "hit a home run";
      if (n.includes("triple")) return "tripled";
      if (n.includes("double")) return "doubled";
      if (n.includes("bunt")) return "bunt single";
      return "singled";
    }
    case "mlb.batter.walk":
      return "walked";
    case "mlb.batter.strikeout":
      return "struck out";
    case "mlb.batter.hit_by_pitch":
      return "hit by pitch";
    default:
      // Unknown — fall back to the play_type if present.
      return pt ? pt.toLowerCase() : "played";
  }
}

/** Event types the feed will render (others are skipped). */
export const FEED_EVENT_TYPES = new Set([
  "mlb.batter.hit",
  "mlb.batter.home_run",
  "mlb.batter.walk",
  "mlb.batter.strikeout",
  "mlb.batter.hit_by_pitch",
]);

/**
 * Returns true when a token application's trigger condition has
 * just been met by this event. Exposed for consumers that want
 * to visually cue a token fire in the feed.
 */
export function eventTriggersToken(
  eventType: string,
  tokenType: TokenType | null | undefined,
): boolean {
  if (!tokenType) return false;
  if (tokenType === "hr_bonus") return eventType === "mlb.batter.home_run";
  if (tokenType === "sb_bonus") return false; // stolen bases aren't in our feed
  // multi_hit / strikeout_bonus / quality_start resolve at game-end,
  // not per-event.
  return false;
}
