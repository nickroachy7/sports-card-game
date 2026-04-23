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

type EntryStatus = "building" | "submitted" | "live" | "final";

type SlotFill = {
  card: LineupCardVM | null;
  appliedToken: { bonusFp: number } | null;
  liveFp: number;
  finalFp: number;
  gameInfo?: SlotGameInfo | null;
};

/**
 * Polish spec §100 (Phase 34) — simplified lineup-only sidebar.
 *
 * The old team-summary block at the top (team name + vault stats +
 * career FP) was cut — that info already lives in the top nav header
 * + profile drawer, and the duplicate ate ~100px of vertical without
 * earning it. The `"summary"` variant (for the now-deleted
 * /collection page) was also dropped; AppSidebar is lineup-only.
 *
 * Layout (top to bottom):
 *
 *   Building state:
 *     Contest header (name + lock countdown)
 *     Readiness (X/10 + warnings)
 *     Auto-sub (inline)
 *     Submit button (pinned to bottom via mt-auto)
 *
 *   Post-submit state (submitted / live / final):
 *     Contest header (name + status copy)
 *     Live/Final Score (big) + Status chip inline — the headline
 *     Box Score (per-slot FP)
 *     Event Feed (fills remaining, scrolls internally)
 *
 * Post-submit reorders per user ask: score + status get top
 * billing, box score middle, event feed last.
 */
type Props = {
  contestName: string;
  lockCountdown: string;
  entryStatus: EntryStatus;
  liveScore: number;
  finalScore: number;
  contestGameIds: string[];
  slotFills: Record<LineupPosition, SlotFill>;
  autoSubMode: AutoSubMode;
  onAutoSubModeChange: (mode: AutoSubMode) => void;
  canSubmit: boolean;
  submitting: boolean;
  locked: boolean;
  onSubmit: () => void;
};

export function AppSidebar(props: Props) {
  return (
    <div className="flex h-full flex-col gap-4">
      <ContestHeaderCard
        contestName={props.contestName}
        entryStatus={props.entryStatus}
        lockCountdown={props.lockCountdown}
      />
      {props.entryStatus === "building" ? (
        <BuildingContent {...props} />
      ) : (
        <PostSubmitContent {...props} />
      )}
    </div>
  );
}

// ── Contest header ───────────────────────────────────────────────────

function ContestHeaderCard({
  contestName,
  entryStatus,
  lockCountdown,
}: {
  contestName: string;
  entryStatus: EntryStatus;
  lockCountdown: string;
}) {
  const submitted = entryStatus !== "building";
  return (
    <div className="flex flex-col gap-0.5 border-b border-[var(--border)] pb-3">
      <h1 className="font-sans text-sm font-bold tracking-tight text-[var(--text)]">
        {contestName}
      </h1>
      <span className="text-[11px] text-[var(--text-3)]">
        {submitted ? (
          <>{entryStatus === "final" ? "Final" : "Submitted"} · slots lock at game time</>
        ) : (
          <>Locks in {lockCountdown}</>
        )}
      </span>
    </div>
  );
}

// ── Building state ───────────────────────────────────────────────────

function BuildingContent({
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
      <SidebarSection title="Ready to play">
        <div className="flex items-baseline gap-3">
          <SidebarStat value={`${filledCount} / 10`} accent={filledCount === 10} />
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
            {projectedFp.toFixed(1)} proj FP
          </span>
        </div>
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

      <SidebarSection title="Auto-sub">
        <fieldset disabled={locked} className="flex flex-col gap-1 pt-0.5 disabled:opacity-60">
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

// ── Post-submit (submitted / live / final) ───────────────────────────

function PostSubmitContent({
  slotFills,
  entryStatus,
  liveScore,
  finalScore,
  contestGameIds,
}: Props) {
  const isFinal = entryStatus === "final";
  const displayScore = isFinal
    ? finalScore
    : liveScore > 0
      ? liveScore
      : slotSum(slotFills, "liveFp") + slotSum(slotFills, "finalFp");

  const latestInning = useLatestInning();
  const { count: gamesActive, ready: gamesReady } = useGamesActive(contestGameIds);

  return (
    <>
      {/* Polish spec §100 (Phase 34). Score + status are the headline;
          merged into one block at the top so users see "how am I
          doing" + "what's happening" at a glance. */}
      <ScoreHeadline
        isFinal={isFinal}
        displayScore={displayScore}
        entryStatus={entryStatus}
        latestInning={latestInning}
        gamesActive={gamesActive}
        gamesReady={gamesReady}
      />

      <BoxScoreSection slotFills={slotFills} isFinal={isFinal} />

      <EventFeed />
    </>
  );
}

function ScoreHeadline({
  isFinal,
  displayScore,
  entryStatus,
  latestInning,
  gamesActive,
  gamesReady,
}: {
  isFinal: boolean;
  displayScore: number;
  entryStatus: EntryStatus;
  latestInning: InningInfo | null;
  gamesActive: number;
  gamesReady: boolean;
}) {
  let statusLabel: string;
  switch (entryStatus) {
    case "submitted":
      statusLabel = "Waiting on first pitch";
      break;
    case "live":
      statusLabel = liveLabel(latestInning, gamesActive, gamesReady);
      break;
    case "final":
      statusLabel = "Contest final";
      break;
    default:
      statusLabel = "";
  }
  return (
    <section
      className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3"
      aria-label="Live score"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
          {isFinal ? "Final" : "Live"}
        </span>
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-wider",
            entryStatus === "live" ? "text-emerald-400" : "text-[var(--text-3)]",
          )}
        >
          {statusLabel}
        </span>
      </div>
      <div
        className={cn(
          "font-mono text-3xl font-bold tabular-nums",
          displayScore > 0 ? "text-[var(--text)]" : "text-[var(--text-3)]",
        )}
      >
        {displayScore.toFixed(1)}
      </div>
    </section>
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
    <SidebarSection title="Box Score">
      <ol className="flex flex-col gap-0.5">
        {LINEUP_POSITIONS.map((pos) => {
          const fill = slotFills[pos];
          const fp = isFinal ? fill.finalFp : fill.liveFp || fill.finalFp;
          const status = fill.gameInfo?.status ?? null;
          const gameStarted = status === "live" || status === "final";
          const hasPlayerInSlot = fill.card !== null;
          const showNumber = hasPlayerInSlot && gameStarted;
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
              <SlotGameState
                info={fill.gameInfo ?? null}
                variant="chip"
                className="font-mono text-[9px]"
              />
              <span
                className={cn(
                  "text-right font-mono tabular-nums",
                  showNumber && hasScored
                    ? "font-semibold text-[var(--text)]"
                    : "text-[var(--text-3)]",
                )}
              >
                {showNumber ? fp.toFixed(1) : "—"}
              </span>
            </li>
          );
        })}
      </ol>
    </SidebarSection>
  );
}

// ── Shared helpers ───────────────────────────────────────────────────

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
