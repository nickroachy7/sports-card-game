"use client";

import { EventFeed } from "@/components/lineup/EventFeed";
import { useLatestInning } from "@/components/lineup/LiveEventsProvider";
import { SlotGameState } from "@/components/lineup/SlotGameState";
import { useGamesActive } from "@/components/lineup/useGamesActive";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CardTier } from "@/lib/contracts/cards";
import type { AutoSubMode, LineupPosition } from "@/lib/contracts/lineup";
import { LINEUP_POSITIONS } from "@/lib/contracts/lineup";
import { liveLabel } from "@/lib/lineup/status-chip-label";
import type { LineupCardVM, SlotGameInfo } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

type EntryStatus = "building" | "submitted" | "live" | "final";

type SlotFill = {
  card: LineupCardVM | null;
  appliedToken: { bonusFp: number } | null;
  liveFp: number;
  finalFp: number;
  locked?: boolean;
  gameInfo?: SlotGameInfo | null;
};

/**
 * Polish spec §122 (Phase 39) — unified lineup sidebar.
 *
 * Single layout used throughout the day. No building-state vs
 * post-submit split; no Submit button; no global lock countdown.
 * The lineup commits implicitly when each slot's player game
 * starts (existing per-slot lock from polish spec §44 enforces
 * the edit rule).
 *
 * Structure (top → bottom):
 *   ContestHeader     — name + date, no countdown
 *   SidebarHeadline   — one adaptive block (Drafting / Live / Final)
 *   RosterSection     — one persistent row per slot
 *   <Tabs>
 *     Lineup Actions  — auto-sub mode + readiness warnings
 *     Live Events     — existing EventFeed
 *
 * Prior phases: §100 (Phase 34) cut team-summary + introduced the
 * post-submit three-block layout; §103 (Phase 35) gave building-
 * state structural parity; §122 merges both into one.
 */
type Props = {
  contestName: string;
  entryStatus: EntryStatus;
  liveScore: number;
  finalScore: number;
  contestGameIds: string[];
  slotFills: Record<LineupPosition, SlotFill>;
  autoSubMode: AutoSubMode;
  onAutoSubModeChange: (mode: AutoSubMode) => void;
};

export function AppSidebar(props: Props) {
  return (
    <div className="flex h-full flex-col gap-4">
      <ContestHeader contestName={props.contestName} />
      <SidebarHeadline
        slotFills={props.slotFills}
        entryStatus={props.entryStatus}
        liveScore={props.liveScore}
        finalScore={props.finalScore}
        contestGameIds={props.contestGameIds}
      />
      <RosterSection slotFills={props.slotFills} />
      <SidebarTabs
        slotFills={props.slotFills}
        autoSubMode={props.autoSubMode}
        onAutoSubModeChange={props.onAutoSubModeChange}
        allSlotsLocked={LINEUP_POSITIONS.every((pos) => props.slotFills[pos].locked)}
      />
    </div>
  );
}

// ── Contest header ───────────────────────────────────────────────────

function ContestHeader({ contestName }: { contestName: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-[var(--border)] pb-3">
      <h1 className="font-sans text-sm font-bold tracking-tight text-[var(--text)]">
        {contestName}
      </h1>
      <span className="text-[11px] text-[var(--text-3)]">Slots lock at game time</span>
    </div>
  );
}

// ── SidebarHeadline — adapts through Drafting → Live → Final ─────────

function SidebarHeadline({
  slotFills,
  entryStatus,
  liveScore,
  finalScore,
  contestGameIds,
}: {
  slotFills: Record<LineupPosition, SlotFill>;
  entryStatus: EntryStatus;
  liveScore: number;
  finalScore: number;
  contestGameIds: string[];
}) {
  // State derivation:
  //   anySlotLocked → at least one player's game has started
  //   allFinal      → every locked slot is final AND nothing pending
  const filledCount = LINEUP_POSITIONS.filter((pos) => slotFills[pos].card !== null).length;
  const anySlotLocked = LINEUP_POSITIONS.some((pos) => slotFills[pos].locked);
  const allFinal = LINEUP_POSITIONS.every((pos) => {
    const info = slotFills[pos].gameInfo;
    if (!slotFills[pos].card) return true;
    return info?.status === "final" || info?.status === "canceled" || info?.status === "postponed";
  });

  const latestInning = useLatestInning();
  const { count: gamesActive, ready: gamesReady } = useGamesActive(contestGameIds);

  const projectedFp = computeProjectedFp(slotFills);

  if (!anySlotLocked && entryStatus === "building") {
    return (
      <Headline
        label="Drafting"
        statusLine={`${filledCount} / 10 slots filled`}
        statusTone={filledCount === 10 ? "accent" : "muted"}
        bigNumber={projectedFp.toFixed(1)}
        bigNumberLabel="Projected FP"
        bigNumberMuted={projectedFp === 0}
      />
    );
  }

  if (anySlotLocked && !allFinal) {
    const displayScore = liveScore > 0 ? liveScore : slotSum(slotFills, "liveFp");
    return (
      <Headline
        label="Live"
        statusLine={liveLabel(latestInning, gamesActive, gamesReady)}
        statusTone="live"
        bigNumber={displayScore.toFixed(1)}
        bigNumberMuted={displayScore === 0}
      />
    );
  }

  // All final (or the contest is fully wrapped).
  const displayScore = finalScore > 0 ? finalScore : slotSum(slotFills, "finalFp");
  return (
    <Headline
      label="Final"
      statusLine="Contest final"
      statusTone="muted"
      bigNumber={displayScore.toFixed(1)}
      bigNumberMuted={displayScore === 0}
    />
  );
}

function Headline({
  label,
  statusLine,
  statusTone,
  bigNumber,
  bigNumberLabel,
  bigNumberMuted,
}: {
  label: string;
  statusLine: string;
  statusTone: "muted" | "accent" | "live";
  bigNumber: string;
  bigNumberLabel?: string;
  bigNumberMuted: boolean;
}) {
  return (
    <section
      className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3"
      aria-label={label}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">{label}</span>
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-wider",
            statusTone === "accent" && "text-emerald-400",
            statusTone === "live" && "text-emerald-400",
            statusTone === "muted" && "text-[var(--text-3)]",
          )}
        >
          {statusLine}
        </span>
      </div>
      <div
        className={cn(
          "font-mono text-3xl font-bold tabular-nums",
          bigNumberMuted ? "text-[var(--text-3)]" : "text-[var(--text)]",
        )}
      >
        {bigNumber}
      </div>
      {bigNumberLabel && (
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
          {bigNumberLabel}
        </div>
      )}
    </section>
  );
}

// ── RosterSection — single persistent block ──────────────────────────

function RosterSection({ slotFills }: { slotFills: Record<LineupPosition, SlotFill> }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-xs uppercase tracking-wider text-[var(--text-3)]">Roster</h2>
      <ol data-scroll="lineup-roster" className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        {LINEUP_POSITIONS.map((pos) => (
          <RosterRow key={pos} position={pos} fill={slotFills[pos]} />
        ))}
      </ol>
    </section>
  );
}

function RosterRow({ position, fill }: { position: LineupPosition; fill: SlotFill }) {
  const card = fill.card;
  if (!card) {
    return (
      <li className="grid grid-cols-[2rem_1fr] items-baseline gap-1 text-[11px]">
        <span className="font-mono text-[var(--text-3)]">{position}</span>
        <span className="truncate text-[var(--text-3)] italic">
          Drag a {formatPosition(position)}
        </span>
      </li>
    );
  }
  const warning = playerWarning(card);
  const fpCell = pickFpCell(fill);
  return (
    <li className="grid grid-cols-[2rem_1fr_auto_3rem] items-baseline gap-1 text-[11px]">
      <span className="font-mono text-[var(--text-3)]">{position}</span>
      <span className="flex min-w-0 items-baseline gap-1">
        <span className="truncate text-[var(--text-2)]">{shortName(card.playerName)}</span>
        {warning && (
          <span
            className="font-mono text-[9px] uppercase tracking-wider text-[#D4A647]"
            title={warning}
          >
            !
          </span>
        )}
      </span>
      <SlotGameState info={fill.gameInfo ?? null} variant="chip" className="font-mono text-[9px]" />
      <span
        className={cn(
          "text-right font-mono tabular-nums",
          fpCell.tone === "white" && "font-semibold text-[var(--text)]",
          fpCell.tone === "emerald" && "font-semibold text-emerald-400",
          fpCell.tone === "muted" && "text-[var(--text-3)]",
        )}
      >
        {fpCell.text}
      </span>
    </li>
  );
}

/**
 * FP cell adapts through the day:
 *   scheduled w/ projected → projected (muted)
 *   live                   → liveFp (emerald)
 *   final                  → finalFp (white)
 *   otherwise              → em-dash
 */
function pickFpCell(fill: SlotFill): { text: string; tone: "muted" | "emerald" | "white" } {
  const status = fill.gameInfo?.status ?? null;
  if (status === "live") return { text: fill.liveFp.toFixed(1), tone: "emerald" };
  if (status === "final") return { text: fill.finalFp.toFixed(1), tone: "white" };
  // Scheduled or off-day: show projected FP if we have a card and it makes sense.
  if (fill.card && status === "scheduled") {
    const proj = computeSingleProjected(fill);
    return { text: proj.toFixed(1), tone: "muted" };
  }
  return { text: "—", tone: "muted" };
}

// ── Tabs — Lineup Actions + Live Events ──────────────────────────────

function SidebarTabs({
  slotFills,
  autoSubMode,
  onAutoSubModeChange,
  allSlotsLocked,
}: {
  slotFills: Record<LineupPosition, SlotFill>;
  autoSubMode: AutoSubMode;
  onAutoSubModeChange: (mode: AutoSubMode) => void;
  allSlotsLocked: boolean;
}) {
  return (
    <Tabs defaultValue="actions" className="mt-auto flex min-h-0 flex-1 flex-col gap-3">
      <TabsList className="w-full">
        <TabsTrigger value="actions" className="flex-1 text-xs">
          Actions
        </TabsTrigger>
        <TabsTrigger value="events" className="flex-1 text-xs">
          Events
        </TabsTrigger>
      </TabsList>
      <TabsContent value="actions" className="flex flex-col gap-3">
        <LineupActions
          slotFills={slotFills}
          autoSubMode={autoSubMode}
          onAutoSubModeChange={onAutoSubModeChange}
          allSlotsLocked={allSlotsLocked}
        />
      </TabsContent>
      <TabsContent value="events" className="min-h-0 flex-1">
        <EventFeed />
      </TabsContent>
    </Tabs>
  );
}

function LineupActions({
  slotFills,
  autoSubMode,
  onAutoSubModeChange,
  allSlotsLocked,
}: {
  slotFills: Record<LineupPosition, SlotFill>;
  autoSubMode: AutoSubMode;
  onAutoSubModeChange: (mode: AutoSubMode) => void;
  allSlotsLocked: boolean;
}) {
  const warnings = LINEUP_POSITIONS.flatMap((pos) => {
    const card = slotFills[pos].card;
    if (!card) return [];
    const reason = cardWarning(card);
    if (!reason) return [];
    return [{ position: pos, playerName: shortName(card.playerName), reason }];
  });

  return (
    <>
      <fieldset
        disabled={allSlotsLocked}
        className="flex flex-col gap-1 disabled:opacity-60"
        aria-label="Auto-sub mode"
      >
        <legend className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
          Auto-sub
        </legend>
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
      <section className="flex flex-col gap-1">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
          Warnings
        </h3>
        {warnings.length === 0 ? (
          <p className="text-[11px] text-[var(--text-3)]">No warnings.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {warnings.map((w) => (
              <li
                key={`${w.position}-${w.reason}`}
                className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-1 text-[11px]"
              >
                <span className="font-mono text-[var(--text-3)]">{w.position}</span>
                <span className="truncate text-[var(--text-2)]">{w.playerName}</span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#D4A647]">
                  {w.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
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

function formatPosition(pos: LineupPosition): string {
  switch (pos) {
    case "C":
      return "Catcher";
    case "1B":
      return "First Baseman";
    case "2B":
      return "Second Baseman";
    case "3B":
      return "Third Baseman";
    case "SS":
      return "Shortstop";
    case "OF1":
    case "OF2":
    case "OF3":
      return "Outfielder";
    case "SP1":
    case "SP2":
      return "Pitcher";
    default:
      return pos;
  }
}

function playerWarning(card: LineupCardVM): string | null {
  if (card.isExpired) return "Contract expired";
  if (card.playerStatus === "il") return "On IL";
  if (card.playerStatus === "dfa") return "FA / DFA";
  return null;
}

function cardWarning(card: LineupCardVM): string | null {
  if (card.isExpired) return "expired";
  if (card.playerStatus === "il") return "IL";
  if (card.playerStatus === "dfa") return "FA/DFA";
  if (card.contractPlays > 0 && card.contractPlays <= 2)
    return `${card.contractPlays} play${card.contractPlays === 1 ? "" : "s"}`;
  return null;
}

// Re-exported so LineupView's legacy TierChip pattern still has a
// callable import path; the new RosterRow no longer uses it.
export function TierChip({ tier }: { tier: CardTier }) {
  const colorVar = `var(--tier-${tier})`;
  return (
    <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: colorVar }}>
      {tier.charAt(0).toUpperCase()}
    </span>
  );
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
    total += computeSingleProjected(slotFills[position]);
  }
  return total;
}

function computeSingleProjected(fill: SlotFill): number {
  if (!fill.card) return 0;
  const playsUsed = Math.max(0, fill.card.contractMax - fill.card.contractPlays);
  const perCard = playsUsed > 0 ? fill.card.careerFp / playsUsed : TIER_BASELINE_FP[fill.card.tier];
  return perCard + (fill.appliedToken?.bonusFp ?? 0);
}
