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
  variant?: "footer" | "chip";
  className?: string;
};

export function SlotGameState({ info, variant = "footer", className }: Props) {
  if (!info) return null;

  if (variant === "chip") {
    return (
      <span className={cn("inline-flex items-center gap-0.5", className)}>
        <span className={toneClass(info.status)}>{stateWord(info.status)}</span>
      </span>
    );
  }

  const body = renderFooter(info);
  if (!body) return null;
  return (
    <span
      className={cn(
        "whitespace-nowrap font-mono text-[10px] uppercase tracking-wider leading-tight",
        toneClass(info.status),
        className,
      )}
    >
      {body}
    </span>
  );
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

function toneClass(status: SlotGameInfo["status"]): string {
  switch (status) {
    case "live":
      return "text-emerald-400";
    case "final":
      return "text-[var(--text-2)]";
    default:
      return "text-[var(--text-3)]";
  }
}

function renderFooter(info: SlotGameInfo): string | null {
  const vs = info.isHome ? "vs" : "@";
  if (info.status === "scheduled") {
    const time = info.scheduledStart ? formatTime(info.scheduledStart) : "TBD";
    return `${vs} ${info.opponentAbbr} · ${time}`;
  }
  if (info.status === "live") {
    return info.homeRuns !== null && info.awayRuns !== null
      ? `LIVE · ${info.homeRuns}-${info.awayRuns}`
      : "LIVE";
  }
  if (info.status === "final") {
    const ourRuns = info.isHome ? info.homeRuns : info.awayRuns;
    const theirRuns = info.isHome ? info.awayRuns : info.homeRuns;
    if (ourRuns === null || theirRuns === null) return "FINAL";
    const wl = ourRuns > theirRuns ? "W" : ourRuns < theirRuns ? "L" : "T";
    return `FINAL ${wl} ${ourRuns}-${theirRuns}`;
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
