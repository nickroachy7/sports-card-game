import type { SlotGameInfo } from "@/lib/lineup/types";

/**
 * Polish spec §63 (Phase 22) — shared enumeration for bench + collection
 * game-state filter chips.
 *
 * - `pre` — scheduled (actionable: tokens, swaps)
 * - `live` — game in progress
 * - `final` — game done for the day
 * - `off` — player has no game in today's contest (key missing from
 *   the slotGame map, OR status is postponed/suspended/canceled).
 *
 * Lives in its own module (separate from `fetch-slot-games.ts`) so
 * client components can import it without dragging the server-only
 * `pg`-backed `getDb()` into the browser bundle.
 */
export type GameStateFilter = "all" | "pre" | "live" | "final" | "off";

/** True if `info` matches the chip `filter`. `null` info means off-day. */
export function matchesGameStateFilter(
  info: SlotGameInfo | null,
  filter: GameStateFilter,
): boolean {
  if (filter === "all") return true;
  if (!info) return filter === "off";
  if (filter === "pre") return info.status === "scheduled";
  if (filter === "live") return info.status === "live";
  if (filter === "final") return info.status === "final";
  if (filter === "off") {
    // Player has a contest game today, but it's unplayable (postponed
    // / suspended / canceled). Group with OFF for the filter chip.
    return info.status !== "scheduled" && info.status !== "live" && info.status !== "final";
  }
  return true;
}
