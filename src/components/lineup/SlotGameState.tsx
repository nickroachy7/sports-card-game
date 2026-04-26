import { useLiveGameState } from "@/components/lineup/LiveEventsProvider";
import type { SlotGameInfo } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

/**
 * Polish spec §45 (Phase 18) — per-slot game-state narration line.
 *
 * Renders under each filled LineupSlot and also serves duty in the
 * box-score chip:
 *   - Pre-game:  vs LAD · 7:10p        (muted grey)
 *   - Live:      LIVE · 2-1            (emerald)
 *   - Final:     FINAL W 5-2           (neutral)
 *
 * No inning narration — MLB data via `scheduled_start` is reliable
 * but live-inning data isn't populated on `game` yet. Scope-limited
 * for this phase; the <StatusChip> still shows inning from the
 * event feed stream.
 *
 * `variant="chip"` is a compact inline rendering for the Box Score
 * — no team abbr, no score detail, just the state word + color.
 */

type Props = {
  info: SlotGameInfo | null;
  /**
   * - `footer` (default): full-copy footer rendered under lineup
   *   slots. Renders a muted `OFF` pill when `info` is null
   *   (polish spec §188).
   * - `chip`: compact PRE/LIVE/FINAL/OFF word for the Box Score
   *   row + sidebar roster row.
   * - `bench`: same full copy as `footer`, with a muted `OFF`
   *   pill when `info` is null (polish spec §58).
   */
  variant?: "footer" | "chip" | "bench";
  className?: string;
};

export function SlotGameState({ info, variant = "footer", className }: Props) {
  // Polish spec §208 (Phase 51). Live game state overrides the
  // server-rendered snapshot. Team abbrs + DH marker continue
  // to come from `info` (static); status/inning/outs/score come
  // from realtime via `useLiveGameState`. When the realtime map
  // hasn't seeded the gameId yet, fall back to `info` directly.
  const live = useLiveGameState(info?.gameId);
  const merged =
    info && live
      ? {
          ...info,
          status: live.status,
          homeRuns: live.homeRuns,
          awayRuns: live.awayRuns,
          currentInning: live.currentInning,
          currentInningHalf: live.currentInningHalf,
          currentOuts: live.currentOuts,
          scheduledStart: live.scheduledStart ?? info.scheduledStart,
        }
      : info;

  // Polish spec §62 + §188 — tone-washed pill wrapping for
  // footer + bench variants. Off-day cards get the same OFF pill
  // everywhere a game-state would otherwise appear, so users
  // always know whether a slot's player has a game today.
  if (!merged) {
    if (variant === "chip") {
      return (
        <span className={cn("inline-flex items-center gap-0.5", className)}>
          <span className={toneClass(null)}>OFF</span>
        </span>
      );
    }
    return (
      <span className={cn("inline-flex", className)}>
        <span className={cn(PILL_BASE, pillTone(null))}>OFF</span>
      </span>
    );
  }

  if (variant === "chip") {
    return (
      <span className={cn("inline-flex items-center gap-0.5", className)}>
        <span className={toneClass(merged.status)}>{stateWord(merged.status)}</span>
      </span>
    );
  }

  const body = renderFooter(merged);
  if (!body) return null;
  return (
    <span className={cn("inline-flex", className)}>
      <span className={cn(PILL_BASE, pillTone(merged.status))}>{body}</span>
    </span>
  );
}

/** Shared pill shape: rounded, bordered, compact, whitespace-nowrap. */
const PILL_BASE =
  "whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase leading-tight tracking-wider";

/**
 * Tone-by-state background + border + text color for the pill. `null`
 * means the off-day case (bench-only). Live gets an emerald wash to
 * stand out; scheduled + off stay muted; final is a neutral surface
 * wash.
 */
function pillTone(status: SlotGameInfo["status"] | null): string {
  if (status === "live") {
    return "border-emerald-800/60 bg-emerald-950/40 text-emerald-400";
  }
  if (status === "final") {
    return "border-[var(--border)] bg-[var(--surface-2)]/60 text-[var(--text-2)]";
  }
  // scheduled | postponed | suspended | canceled | null (off-day)
  return "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)]";
}

function stateWord(status: SlotGameInfo["status"]): string {
  switch (status) {
    case "scheduled":
      return "PRE";
    case "live":
      return "LIVE";
    case "final":
      return "FINAL";
    case "postponed":
      return "PPD";
    case "suspended":
      return "SUSP";
    case "canceled":
      return "CXL";
  }
}

function toneClass(status: SlotGameInfo["status"] | null): string {
  switch (status) {
    case "live":
      return "text-emerald-400";
    case "final":
      return "text-[var(--text-2)]";
    default:
      // scheduled | postponed | suspended | canceled | null (off-day)
      return "text-[var(--text-3)]";
  }
}

function renderFooter(info: SlotGameInfo): string | null {
  const vs = info.isHome ? "vs" : "@";
  // Polish spec §65 (Phase 22). Append "(DH1)" / "(DH2)" only when
  // THIS matchup has both DH games in our DB — a single-game matchup
  // shouldn't suffix "(DH1)" just because MLB Stats returns
  // gameNumber=1 by default for every non-DH game.
  const dhMarker =
    info.hasDoubleHeader && info.gameNumber !== null ? ` (DH${info.gameNumber})` : "";

  if (info.status === "scheduled") {
    const time = info.scheduledStart ? formatTime(info.scheduledStart) : "TBD";
    return `${vs} ${info.opponentAbbr} · ${time}${dhMarker}`;
  }
  if (info.status === "live") {
    // Polish spec §54 (Phase 20) + §64 (Phase 22). Inning like
    // "T5" / "B8" when populated; outs appended as "2O" when
    // present. Score always appended if we have both team runs.
    //   Examples: "LIVE · T5 2O · 2-1 (DH1)"  /  "LIVE · 2-1"
    const halfPrefix =
      info.currentInningHalf === "top" ? "T" : info.currentInningHalf === "bottom" ? "B" : null;
    const inningWord =
      halfPrefix !== null && info.currentInning !== null
        ? `${halfPrefix}${info.currentInning}`
        : null;
    const outsWord = info.currentOuts !== null ? `${info.currentOuts}O` : null;
    const innings =
      inningWord && outsWord
        ? `${inningWord} ${outsWord}`
        : inningWord
          ? inningWord
          : outsWord
            ? outsWord
            : null;
    const inningPart = innings ? ` · ${innings}` : "";
    const scorePart =
      info.homeRuns !== null && info.awayRuns !== null
        ? ` · ${info.homeRuns}-${info.awayRuns}`
        : "";
    return `LIVE${inningPart}${scorePart}${dhMarker}`;
  }
  if (info.status === "final") {
    const ourRuns = info.isHome ? info.homeRuns : info.awayRuns;
    const theirRuns = info.isHome ? info.awayRuns : info.homeRuns;
    if (ourRuns === null || theirRuns === null) return `FINAL${dhMarker}`;
    const wl = ourRuns > theirRuns ? "W" : ourRuns < theirRuns ? "L" : "T";
    return `FINAL ${wl} ${ourRuns}-${theirRuns}${dhMarker}`;
  }
  if (info.status === "postponed") return "POSTPONED";
  if (info.status === "suspended") return "SUSPENDED";
  if (info.status === "canceled") return "CANCELED";
  return null;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = d.getHours() >= 12 ? "p" : "a";
  return `${h}:${m}${ampm}`;
}

/**
 * Polish spec §44 — per-slot lock predicate. A slot is locked when
 * its player's game has started (live or final) OR when
 * `scheduled_start` is in the past even if BDL hasn't flipped the
 * status yet.
 */
export function isSlotLockedFromInfo(info: SlotGameInfo | null): boolean {
  if (!info) return false;
  if (info.status === "live" || info.status === "final") return true;
  if (info.scheduledStart && new Date(info.scheduledStart).getTime() <= Date.now()) return true;
  return false;
}
