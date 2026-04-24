"use client";

import type { OpenPacksBatchResult } from "@/app/actions/packs";
import { EventFeed } from "@/components/lineup/EventFeed";
import { useLatestInning } from "@/components/lineup/LiveEventsProvider";
import { SlotGameState } from "@/components/lineup/SlotGameState";
import { useGamesActive } from "@/components/lineup/useGamesActive";
import { PacksTab } from "@/components/pack/PacksTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CardTier, PackType } from "@/lib/contracts/cards";
import type { AutoSubMode, LineupPosition } from "@/lib/contracts/lineup";
import { LINEUP_POSITIONS } from "@/lib/contracts/lineup";
import { liveLabel } from "@/lib/lineup/status-chip-label";
import type { LineupCardVM, SlotGameInfo } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

type EntryStatus = "building" | "submitted" | "live" | "final";

type SlotFill = {
  card: LineupCardVM | null;
  appliedToken: {
    bonusFp: number;
    /** Phase 40 §130: drives the ✓ / ✗ glyph next to FP. */
    triggered?: boolean | null;
  } | null;
  liveFp: number;
  finalFp: number;
  locked?: boolean;
  gameInfo?: SlotGameInfo | null;
};

/**
 * Polish spec §122 (Phase 39) → §140–§143 (Phase 42) — unified lineup
 * sidebar.
 *
 * Structure (top → bottom):
 *   SlateLine         — date + games-today count (§140)
 *   RosterSection     — 10 rows with tightened padding (§142)
 *   SidebarHeadline   — compact two-line Drafting/Live/Final (§141)
 *   <Tabs>
 *     Lineup Actions  — auto-sub mode + readiness warnings
 *     Live Events     — existing EventFeed
 *     Packs           — inline buy UI (§143, replaces FAB + modal)
 *
 * Roster-above-score order: the roster is the primary object on
 * the page (it IS the lineup); the score is a status indicator for
 * it. Placing the score below reads as a summary line under the
 * thing it summarizes, matches the sports-app box-score convention
 * (totals under the roster, not over it).
 *
 * Prior phases: §100 (Phase 34) cut team-summary + introduced the
 * post-submit three-block layout; §103 (Phase 35) gave building-
 * state structural parity; §122 merged both into one; §140–§143
 * compressed the top zone + promoted Packs to a tab.
 */
type Props = {
  /** Pre-formatted slate date like "Fri, Apr 24". Server formats
   *  in ET so timezone drift doesn't surface in the sidebar. */
  slateDate: string;
  entryStatus: EntryStatus;
  liveScore: number;
  finalScore: number;
  contestGameIds: string[];
  slotFills: Record<LineupPosition, SlotFill>;
  autoSubMode: AutoSubMode;
  onAutoSubModeChange: (mode: AutoSubMode) => void;
  // Packs tab inputs (§143). Moved up from the deleted FAB + modal.
  coinBalance: number;
  dailyPackReady: boolean;
  dailyPackSecondsUntilReady: number;
  standardPackCost: number;
  onPacksOpened: (result: OpenPacksBatchResult, packType: PackType) => void;
};

export function AppSidebar(props: Props) {
  const gamesInSlate = props.contestGameIds.length;
  return (
    <div className="flex h-full flex-col gap-3">
      <SlateLine slateDate={props.slateDate} gamesInSlate={gamesInSlate} />
      <RosterSection slotFills={props.slotFills} />
      <SidebarHeadline
        slotFills={props.slotFills}
        entryStatus={props.entryStatus}
        liveScore={props.liveScore}
        finalScore={props.finalScore}
        contestGameIds={props.contestGameIds}
      />
      <SidebarTabs
        slotFills={props.slotFills}
        autoSubMode={props.autoSubMode}
        onAutoSubModeChange={props.onAutoSubModeChange}
        allSlotsLocked={LINEUP_POSITIONS.every((pos) => props.slotFills[pos].locked)}
        coinBalance={props.coinBalance}
        dailyPackReady={props.dailyPackReady}
        dailyPackSecondsUntilReady={props.dailyPackSecondsUntilReady}
        standardPackCost={props.standardPackCost}
        onPacksOpened={props.onPacksOpened}
      />
    </div>
  );
}

// ── Slate line (§140) ────────────────────────────────────────────────

/**
 * Compressed top-of-sidebar anchor. One-line, one-value-per-chunk,
 * no secondary subtitle. Replaces the old ContestHeader (contest
 * name + "Slots lock at game time" subtitle) — the contest name is
 * redundant (spec §50 guarantees one per user per slate), and the
 * lock-at subtitle is already implied by the per-row game status.
 */
function SlateLine({ slateDate, gamesInSlate }: { slateDate: string; gamesInSlate: number }) {
  return (
    <div className="flex items-baseline justify-between border-[var(--border)] border-b pb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--text-3)]">
      <span className="text-[var(--text-2)]">{slateDate}</span>
      <span>
        {gamesInSlate} {gamesInSlate === 1 ? "game" : "games"}
      </span>
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
        primary={{ value: projectedFp, label: "Projected", tone: "default" }}
      />
    );
  }

  if (anySlotLocked && !allFinal) {
    const liveTotal = liveScore > 0 ? liveScore : slotSum(slotFills, "liveFp");
    return (
      <Headline
        label="Live"
        statusLine={liveLabel(latestInning, gamesActive, gamesReady)}
        statusTone="live"
        primary={{ value: liveTotal, label: "Live", tone: "live" }}
        secondary={{ value: projectedFp, label: "Projected" }}
      />
    );
  }

  // All final (or the contest is fully wrapped).
  const finalTotal = finalScore > 0 ? finalScore : slotSum(slotFills, "finalFp");
  return (
    <Headline
      label="Final"
      statusLine="Contest final"
      statusTone="muted"
      primary={{ value: finalTotal, label: "Final", tone: "default" }}
      secondary={{ value: projectedFp, label: "Projected" }}
    />
  );
}

type HeadlineNumber = {
  value: number;
  label: string;
  tone?: "default" | "live";
};

/**
 * Polish spec §141 (Phase 42). Compact two-line headline replacing
 * the previous ~96px three-part block. Keeps the outlined-card
 * affordance so the section reads as a distinct element, but halves
 * vertical footprint:
 *
 *   Line 1: LABEL · status text (mono, 10px, uppercase)
 *   Line 2: primary.value unit  (proj secondary.value)
 *
 * Prior phases used a 3xl-font primary with a separate secondary
 * column; the Phase 42 redesign inlines both values into line 2 with
 * a parenthetical for the projected benchmark.
 */
function Headline({
  label,
  statusLine,
  statusTone,
  primary,
  secondary,
}: {
  label: string;
  statusLine: string;
  statusTone: "muted" | "accent" | "live";
  primary: HeadlineNumber;
  secondary?: HeadlineNumber;
}) {
  const primaryMuted = primary.value === 0;
  return (
    <section
      className="flex flex-col gap-0.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5"
      aria-label={label}
    >
      <div className="flex items-baseline justify-between gap-2 font-mono text-[10px] uppercase tracking-wider">
        <span className="text-[var(--text-3)]">{label}</span>
        <span
          className={cn(
            "truncate",
            statusTone === "accent" && "text-emerald-400",
            statusTone === "live" && "text-emerald-400",
            statusTone === "muted" && "text-[var(--text-3)]",
          )}
        >
          {statusLine}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "font-bold font-mono text-lg leading-none tabular-nums",
            primary.tone === "live" && !primaryMuted && "text-emerald-400",
            primary.tone !== "live" && !primaryMuted && "text-[var(--text)]",
            primaryMuted && "text-[var(--text-3)]",
          )}
        >
          {primary.value.toFixed(1)}
          <span className="ml-1 font-mono font-normal text-[10px] text-[var(--text-3)] uppercase tracking-wider">
            {primary.label}
          </span>
        </span>
        {secondary && (
          <span
            className={cn(
              "font-mono text-[10px] tabular-nums",
              secondary.value === 0 ? "text-[var(--text-3)]" : "text-[var(--text-2)]",
            )}
          >
            ({secondary.label.toLowerCase()} {secondary.value.toFixed(1)})
          </span>
        )}
      </div>
    </section>
  );
}

// ── RosterSection — single persistent block (§142) ─────────────────

/**
 * Polish spec §142 (Phase 42). Tightened roster. Dropped the "ROSTER"
 * header (redundant — the row format is self-describing); zero-gap
 * list with per-row `py-0.5` gives consistent rhythm at reduced
 * height. Structurally unchanged: 10 rows, per-row FP cell, warning
 * pill, token glyph, slot-game chip.
 */
function RosterSection({ slotFills }: { slotFills: Record<LineupPosition, SlotFill> }) {
  return (
    <section className="flex flex-col">
      <ol
        data-scroll="lineup-roster"
        className="flex min-h-0 flex-col divide-y divide-[var(--border)]/50 overflow-y-auto"
      >
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
      <li className="grid grid-cols-[2rem_1fr] items-baseline gap-1 py-0.5 text-[11px]">
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
    <li className="grid grid-cols-[2rem_1fr_auto_3rem] items-baseline gap-1 py-0.5 text-[11px]">
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
          "flex items-baseline justify-end gap-1 text-right font-mono tabular-nums",
          fpCell.tone === "white" && "font-semibold text-[var(--text)]",
          fpCell.tone === "emerald" && "font-semibold text-emerald-400",
          fpCell.tone === "muted" && "text-[var(--text-3)]",
        )}
      >
        {fpCell.text}
        <TriggeredGlyph triggered={fill.appliedToken?.triggered} />
      </span>
    </li>
  );
}

/**
 * Polish spec §130 (Phase 40). Tiny ✓ / ✗ after the FP cell when
 * the slot has an applied token. Nothing renders when there's no
 * token or when the token is still pending.
 */
function TriggeredGlyph({ triggered }: { triggered?: boolean | null }) {
  if (triggered === true) {
    return (
      <span title="Token hit" className="font-mono text-[9px] font-bold text-emerald-400">
        <span className="sr-only">Token hit: </span>✓
      </span>
    );
  }
  if (triggered === false) {
    return (
      <span title="Token missed" className="font-mono text-[9px] font-bold text-[#C47262]">
        <span className="sr-only">Token missed: </span>✗
      </span>
    );
  }
  return null;
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

// ── Tabs — Actions / Events / Packs (§143) ──────────────────────────

/**
 * Polish spec §143 (Phase 42). Third tab joins the sidebar: Packs,
 * with an inline buy UI that retired the FAB + modal combo. The
 * tab trigger gets a small gold pulse in the top-right corner when
 * the daily pack is claimable; dismisses once claimed.
 */
function SidebarTabs({
  slotFills,
  autoSubMode,
  onAutoSubModeChange,
  allSlotsLocked,
  coinBalance,
  dailyPackReady,
  dailyPackSecondsUntilReady,
  standardPackCost,
  onPacksOpened,
}: {
  slotFills: Record<LineupPosition, SlotFill>;
  autoSubMode: AutoSubMode;
  onAutoSubModeChange: (mode: AutoSubMode) => void;
  allSlotsLocked: boolean;
  coinBalance: number;
  dailyPackReady: boolean;
  dailyPackSecondsUntilReady: number;
  standardPackCost: number;
  onPacksOpened: (result: OpenPacksBatchResult, packType: PackType) => void;
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
        <TabsTrigger value="packs" className="relative flex-1 text-xs">
          Packs
          {dailyPackReady && (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 size-1.5 animate-pulse rounded-full bg-[var(--tier-gold)]"
            />
          )}
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
      <TabsContent value="packs" className="min-h-0 flex-1 overflow-y-auto">
        <PacksTab
          coinBalance={coinBalance}
          dailyReady={dailyPackReady}
          dailySecondsUntilReady={dailyPackSecondsUntilReady}
          standardCost={standardPackCost}
          onOpened={onPacksOpened}
        />
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
