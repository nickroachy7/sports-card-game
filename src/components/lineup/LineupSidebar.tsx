"use client";

import { SidebarSection, SidebarStat } from "@/components/layout/sidebar-card";
import { EventFeed } from "@/components/lineup/EventFeed";
import { useLatestInning } from "@/components/lineup/LiveEventsProvider";
import { SlotGameState } from "@/components/lineup/SlotGameState";
import { useGamesActive } from "@/components/lineup/useGamesActive";
import { Button } from "@/components/ui/button";
import type { AutoSubMode, LineupPosition } from "@/lib/contracts/lineup";
import { LINEUP_POSITIONS } from "@/lib/contracts/lineup";
import { type InningInfo, liveLabel } from "@/lib/lineup/status-chip-label";
import type { LineupCardVM, SlotGameInfo } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

type SlotFill = {
  card: LineupCardVM | null;
  appliedToken: { bonusFp: number } | null;
  liveFp: number;
  finalFp: number;
  /** Polish spec §48 — per-slot game state drives the Box Score
   *  row chip the same way it drives the slot footer. */
  gameInfo?: SlotGameInfo | null;
};

type EntryStatus = "building" | "submitted" | "live" | "final";

type Props = {
  slotFills: Record<LineupPosition, SlotFill>;
  entryStatus: EntryStatus;
  liveScore: number;
  finalScore: number;
  autoSubMode: AutoSubMode;
  onAutoSubModeChange: (mode: AutoSubMode) => void;
  canSubmit: boolean;
  submitting: boolean;
  locked: boolean;
  lockCountdown: string;
  onSubmit: () => void;
  /** Contest's included game ids (for Event Feed initial fetch scope). */
  contestGameIds: string[];
};

export function LineupSidebar(props: Props) {
  if (props.entryStatus === "building") {
    return <BuildingSidebar {...props} />;
  }
  return <PostSubmitSidebar {...props} />;
}

// ── Building state ────────────────────────────────────────────────────

function BuildingSidebar({
  slotFills,
  autoSubMode,
  onAutoSubModeChange,
  canSubmit,
  submitting,
  locked,
  lockCountdown,
  onSubmit,
}: Props) {
  const filledCount = LINEUP_POSITIONS.filter((pos) => slotFills[pos].card !== null).length;
  const warnings = computeWarnings(slotFills);
  const projectedFp = computeProjectedFp(slotFills);

  return (
    <>
      <SidebarSection title="Readiness">
        <SidebarStat value={`${filledCount} / 10`} accent={filledCount === 10} />
        {warnings.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5">
            {warnings.map((w) => (
              <li key={`${w.position}-${w.kind}`} className="text-xs text-[#D4A647]">
                <span className="font-mono">{w.position}</span> · {w.message}
              </li>
            ))}
          </ul>
        )}
      </SidebarSection>

      <SidebarSection title="Projected FP">
        <SidebarStat value={projectedFp.toFixed(1)} />
      </SidebarSection>

      <SidebarSection title="Auto-sub">
        <fieldset disabled={locked} className="flex flex-col gap-1.5 pt-1 disabled:opacity-60">
          <legend className="sr-only">Auto-sub mode</legend>
          <ModeRadio
            label="Smart Auto"
            value="smart_auto"
            current={autoSubMode}
            onChange={onAutoSubModeChange}
          />
          <ModeRadio
            label="Manual Priority"
            value="manual_priority"
            current={autoSubMode}
            onChange={onAutoSubModeChange}
          />
        </fieldset>
      </SidebarSection>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <p className="text-xs text-[var(--text-3)]">
          {locked ? <>Locked · {lockCountdown}</> : <>Locks in {lockCountdown}</>}
        </p>
        <Button onClick={onSubmit} disabled={!canSubmit} className="w-full">
          {submitting
            ? "Submitting…"
            : locked
              ? "Locked"
              : filledCount < 10
                ? `Fill ${10 - filledCount} more`
                : "Submit lineup"}
        </Button>
      </div>
    </>
  );
}

// ── Submitted / Live / Final state ────────────────────────────────────

function PostSubmitSidebar({
  slotFills,
  entryStatus,
  liveScore,
  finalScore,
  lockCountdown,
  contestGameIds,
}: Props) {
  const isFinal = entryStatus === "final";
  const displayScore = isFinal
    ? finalScore
    : liveScore > 0
      ? liveScore
      : slotSum(slotFills, "liveFp") + slotSum(slotFills, "finalFp");
  // The rollup inside reconcileGame only updates contest_entry.live_score /
  // final_score when status is 'live' or 'final' — while 'submitted' the
  // entry aggregate stays at zero even though slot FPs may be populated
  // (see ADR-0014). Derive from slotFills as a fallback so the Live Score
  // reads correctly during the submitted → live transition window.
  // The Event Feed + per-slot glow both consume <LiveEventsProvider>
  // higher up the tree — no subscription wiring happens here anymore.

  const latestInning = useLatestInning();
  const { count: gamesActive, ready: gamesReady } = useGamesActive(contestGameIds);

  return (
    <>
      <SidebarSection title={isFinal ? "Final Score" : "Live Score"}>
        <SidebarStat value={displayScore.toFixed(1)} accent={displayScore > 0} />
      </SidebarSection>

      <BoxScoreSection slotFills={slotFills} isFinal={isFinal} />

      <EventFeed />

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <p className="text-xs text-[var(--text-3)]">
          {entryStatus === "live" ? <>Live · {lockCountdown}</> : <>Locked · {lockCountdown}</>}
        </p>
        <StatusChip
          entryStatus={entryStatus}
          displayScore={displayScore}
          latestInning={latestInning}
          gamesActive={gamesActive}
          gamesReady={gamesReady}
        />
      </div>
    </>
  );
}

function BoxScoreSection({
  slotFills,
  isFinal,
}: {
  slotFills: Record<LineupPosition, SlotFill>;
  isFinal: boolean;
}) {
  return (
    <SidebarSection title="Box Score" className="min-h-0 flex-1">
      <ol className="flex flex-col gap-0.5">
        {LINEUP_POSITIONS.map((pos) => {
          const fill = slotFills[pos];
          const fp = isFinal ? fill.finalFp : fill.liveFp || fill.finalFp;
          const hasScored = fp !== 0 || fill.finalFp !== 0;
          const playerLabel = fill.card ? shortName(fill.card.playerName) : "—";
          return (
            <li
              key={pos}
              className="grid grid-cols-[2rem_1fr_auto_3rem] items-baseline gap-1 text-[11px]"
            >
              <span className="font-mono text-[var(--text-3)]">{pos}</span>
              <span
                className={cn(
                  "truncate",
                  fill.card ? "text-[var(--text-2)]" : "text-[var(--text-3)]",
                )}
              >
                {playerLabel}
              </span>
              {/* Polish spec §48 — state chip in Box Score row. */}
              <SlotGameState
                info={fill.gameInfo ?? null}
                variant="chip"
                className="font-mono text-[9px]"
              />
              <span
                className={cn(
                  "text-right font-mono tabular-nums",
                  hasScored ? "font-semibold text-[var(--text)]" : "text-[var(--text-3)]",
                )}
              >
                {hasScored ? fp.toFixed(1) : "—"}
              </span>
            </li>
          );
        })}
      </ol>
    </SidebarSection>
  );
}

function StatusChip({
  entryStatus,
  displayScore,
  latestInning,
  gamesActive,
  gamesReady,
}: {
  entryStatus: EntryStatus;
  displayScore: number;
  latestInning: InningInfo | null;
  gamesActive: number;
  gamesReady: boolean;
}) {
  let label: string;
  switch (entryStatus) {
    case "submitted":
      label = "Submitted · Waiting on first pitch";
      break;
    case "live":
      label = liveLabel(latestInning, gamesActive, gamesReady);
      break;
    case "final":
      label = `Final · ${displayScore.toFixed(1)} FP`;
      break;
    default:
      label = "Submitted";
  }
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-center font-medium text-xs text-[var(--text-2)] tabular-nums">
      {label}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  const first = parts[0] ?? "";
  const last = parts.slice(1).join(" ");
  return `${first.charAt(0)}. ${last}`;
}

function slotSum(slotFills: Record<LineupPosition, SlotFill>, key: "liveFp" | "finalFp"): number {
  let total = 0;
  for (const pos of LINEUP_POSITIONS) total += slotFills[pos][key];
  return total;
}

function ModeRadio({
  label,
  value,
  current,
  onChange,
}: {
  label: string;
  value: AutoSubMode;
  current: AutoSubMode;
  onChange: (v: AutoSubMode) => void;
}) {
  const active = value === current;
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-sm text-[var(--text-2)] transition-colors",
        active && "text-[var(--text)]",
      )}
    >
      <input
        type="radio"
        name="auto-sub-mode"
        value={value}
        checked={active}
        onChange={() => onChange(value)}
        className="accent-[var(--text)]"
      />
      <span>{label}</span>
    </label>
  );
}

type SlotWarning = {
  position: LineupPosition;
  kind: "low-contract" | "expired" | "il" | "dfa";
  message: string;
};

function computeWarnings(slotFills: Record<LineupPosition, SlotFill>): SlotWarning[] {
  const out: SlotWarning[] = [];
  for (const position of LINEUP_POSITIONS) {
    const card = slotFills[position].card;
    if (!card) continue;
    if (card.isExpired) {
      out.push({ position, kind: "expired", message: "contract expired" });
      continue;
    }
    if (card.playerStatus === "il") {
      out.push({ position, kind: "il", message: "on IL" });
      continue;
    }
    if (card.playerStatus === "dfa") {
      out.push({ position, kind: "dfa", message: "FA / DFA" });
      continue;
    }
    if (card.contractPlays > 0 && card.contractPlays <= 2) {
      out.push({
        position,
        kind: "low-contract",
        message: `${card.contractPlays} play${card.contractPlays === 1 ? "" : "s"} left`,
      });
    }
  }
  return out;
}

// Per-card projection: avg career FP per play used, plus any applied
// token bonus. Unplayed cards (15/15) fall back to a tier baseline.
// Rough heuristic — good enough for a sidebar hint; swap for a scoring
// model when one exists.
const TIER_BASELINE_FP: Record<"bronze" | "silver" | "gold" | "diamond", number> = {
  bronze: 3,
  silver: 6,
  gold: 10,
  diamond: 15,
};

function computeProjectedFp(slotFills: Record<LineupPosition, SlotFill>): number {
  let total = 0;
  for (const position of LINEUP_POSITIONS) {
    const fill = slotFills[position];
    if (!fill.card) continue;
    const playsUsed = Math.max(0, fill.card.contractMax - fill.card.contractPlays);
    const perCard =
      playsUsed > 0 ? fill.card.careerFp / playsUsed : TIER_BASELINE_FP[fill.card.tier];
    total += perCard + (fill.appliedToken?.bonusFp ?? 0);
  }
  return total;
}
