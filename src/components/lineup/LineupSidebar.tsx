"use client";

import { SidebarSection, SidebarStat } from "@/components/layout/sidebar-card";
import { Button } from "@/components/ui/button";
import type { AutoSubMode, LineupPosition } from "@/lib/contracts/lineup";
import { LINEUP_POSITIONS } from "@/lib/contracts/lineup";
import type { LineupCardVM } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

type SlotFill = {
  card: LineupCardVM | null;
  appliedToken: { bonusFp: number } | null;
};

type Props = {
  slotFills: Record<LineupPosition, SlotFill>;
  autoSubMode: AutoSubMode;
  onAutoSubModeChange: (mode: AutoSubMode) => void;
  canSubmit: boolean;
  submitting: boolean;
  locked: boolean;
  lockCountdown: string;
  onSubmit: () => void;
};

export function LineupSidebar({
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
