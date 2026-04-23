"use client";

import { useMemo, useState } from "react";

import type { AppliedTokenInfo } from "@/app/(app)/lineup/lineup-view";
import { Input } from "@/components/ui/input";
import { type GameStateFilter, matchesGameStateFilter } from "@/lib/lineup/game-state-filter";
import type { LineupCardVM, SlotGameInfo } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";
import { BenchCard } from "./BenchCard";

type PositionFilter = "all" | "hitters" | "pitchers";

type Props = {
  cards: LineupCardVM[];
  assignedCardIds: Set<string>;
  appliedTokenByCardId: Map<string, AppliedTokenInfo>;
  /** Polish spec §58 — keyed by card id; null entry or missing key =
   *  no game in today's contest for that player. */
  slotGameByCardId: Record<string, SlotGameInfo>;
  onRemoveToken: (applicationId: string) => void;
  onOpenDetail: (cardId: string) => void;
  locked: boolean;
};

export function BenchDrawer({
  cards,
  assignedCardIds,
  appliedTokenByCardId,
  slotGameByCardId,
  onRemoveToken,
  onOpenDetail,
  locked,
}: Props) {
  const [filter, setFilter] = useState<PositionFilter>("all");
  const [gameState, setGameState] = useState<GameStateFilter>("all");
  const [search, setSearch] = useState("");

  // Polish spec §63 (Phase 22) — game-state counts for the chip row.
  // Reveals how many cards sit in each bucket pre-filtered by the
  // assigned-card hide rule + position filter, so the chip labels
  // carry actionable signal ("3 Pre · 1 Live").
  const gameStateCounts = useMemo(() => {
    const counts = { all: 0, pre: 0, live: 0, final: 0, off: 0 };
    for (const c of cards) {
      if (assignedCardIds.has(c.id)) continue;
      if (filter === "hitters" && c.isPitcher) continue;
      if (filter === "pitchers" && !c.isPitcher) continue;
      counts.all += 1;
      const info = slotGameByCardId[c.id] ?? null;
      if (matchesGameStateFilter(info, "pre")) counts.pre += 1;
      else if (matchesGameStateFilter(info, "live")) counts.live += 1;
      else if (matchesGameStateFilter(info, "final")) counts.final += 1;
      else counts.off += 1;
    }
    return counts;
  }, [cards, assignedCardIds, filter, slotGameByCardId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Polish spec §35 (Phase 15): cards in a slot disappear from
    // the bench entirely. The bench tray is for "unused" — in-use
    // cards read as clutter. Header counter below acknowledges the
    // hidden set so users know nothing was lost.
    //
    // Polish spec §59 (Phase 21): priority-sort by game state so
    // actionable cards (pre-game) cluster at the front. Pre-game
    // ordered by earliest start. Live → Final → OFF trail.
    // Alphabetical within each bucket.
    return cards
      .filter((c) => {
        if (assignedCardIds.has(c.id)) return false;
        if (filter === "hitters" && c.isPitcher) return false;
        if (filter === "pitchers" && !c.isPitcher) return false;
        if (q && !c.playerName.toLowerCase().includes(q)) return false;
        if (!matchesGameStateFilter(slotGameByCardId[c.id] ?? null, gameState)) return false;
        return true;
      })
      .sort((a, b) => {
        const rA = stateRank(slotGameByCardId[a.id] ?? null);
        const rB = stateRank(slotGameByCardId[b.id] ?? null);
        if (rA !== rB) return rA - rB;
        // Pre-game bucket: earliest start first.
        if (rA === 0) {
          const tA = slotGameByCardId[a.id]?.scheduledStart ?? null;
          const tB = slotGameByCardId[b.id]?.scheduledStart ?? null;
          if (tA && tB && tA !== tB) return tA < tB ? -1 : 1;
          if (tA && !tB) return -1;
          if (!tA && tB) return 1;
        }
        return a.playerName.localeCompare(b.playerName);
      });
  }, [cards, filter, gameState, search, assignedCardIds, slotGameByCardId]);

  return (
    <section className="flex flex-col gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-2">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs uppercase tracking-wider text-[var(--text-3)]">Bench</h2>
          {locked ? (
            <span className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--text-3)]">
              Locked
            </span>
          ) : (
            <span className="font-mono text-xs text-[var(--text-2)]">
              {cards.length - assignedCardIds.size} available
              {assignedCardIds.size > 0 && (
                <span className="ml-1 text-[var(--text-3)]">
                  · {assignedCardIds.size} in lineup
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterButton label="All" active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterButton
            label="Hitters"
            active={filter === "hitters"}
            onClick={() => setFilter("hitters")}
          />
          <FilterButton
            label="Pitchers"
            active={filter === "pitchers"}
            onClick={() => setFilter("pitchers")}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-7 w-36 text-xs"
          />
        </div>
      </header>

      {/* Polish spec §63 (Phase 22) — per-game-state filter chip row.
          Sits under the position chips so the two filter axes compose.
          Tone-matched to SlotGameState pill tones so the chip tint
          reads as a preview of what the filter will show. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <GameStateChip
          label="All"
          tone="neutral"
          count={gameStateCounts.all}
          active={gameState === "all"}
          onClick={() => setGameState("all")}
        />
        <GameStateChip
          label="Pre"
          tone="pre"
          count={gameStateCounts.pre}
          active={gameState === "pre"}
          onClick={() => setGameState("pre")}
        />
        <GameStateChip
          label="Live"
          tone="live"
          count={gameStateCounts.live}
          active={gameState === "live"}
          onClick={() => setGameState("live")}
        />
        <GameStateChip
          label="Final"
          tone="final"
          count={gameStateCounts.final}
          active={gameState === "final"}
          onClick={() => setGameState("final")}
        />
        <GameStateChip
          label="Off"
          tone="off"
          count={gameStateCounts.off}
          active={gameState === "off"}
          onClick={() => setGameState("off")}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex h-[140px] items-center justify-center rounded border border-dashed border-[var(--border)] px-4 text-center text-xs text-[var(--text-3)]">
          {cards.length === 0
            ? "No cards yet. Open a pack from the Shop to fill your bench."
            : "No bench cards match the filter."}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {filtered.map((card) => (
            <BenchCard
              key={card.id}
              card={card}
              assigned={assignedCardIds.has(card.id)}
              appliedToken={appliedTokenByCardId.get(card.id)}
              gameInfo={slotGameByCardId[card.id] ?? null}
              onRemoveToken={onRemoveToken}
              onOpenDetail={onOpenDetail}
              disabled={locked || assignedCardIds.has(card.id) || card.isExpired}
              locked={locked}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Polish spec §59 — priority-sort rank by game state.
 *   0 = scheduled (pre-game, actionable)
 *   1 = live (game in progress)
 *   2 = final (done)
 *   3 = off-day / postponed / suspended / canceled
 */
function stateRank(info: SlotGameInfo | null): number {
  if (!info) return 3;
  if (info.status === "scheduled") return 0;
  if (info.status === "live") return 1;
  if (info.status === "final") return 2;
  return 3;
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs font-medium uppercase tracking-wider transition-colors",
        active
          ? "border-[var(--text)] bg-[var(--surface-2)] text-[var(--text)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:border-[var(--text-2)]",
      )}
    >
      {label}
    </button>
  );
}

type ChipTone = "neutral" | "pre" | "live" | "final" | "off";

/**
 * Polish spec §63 (Phase 22). Game-state chip matching SlotGameState's
 * pill tones (see src/components/lineup/SlotGameState.tsx `pillTone`).
 * Emerald wash for live; muted-2 for scheduled/final; muted for off.
 * When `active`, the chip swaps to a bold neutral outline so it reads
 * as selected regardless of tone.
 */
function GameStateChip({
  label,
  tone,
  count,
  active,
  onClick,
}: {
  label: string;
  tone: ChipTone;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase leading-tight tracking-wider transition-colors",
        active ? "border-[var(--text)] text-[var(--text)]" : toneIdle(tone),
      )}
    >
      <span>{label}</span>
      <span
        className={cn("tabular-nums", active ? "text-[var(--text-2)]" : "text-[var(--text-3)]")}
      >
        {count}
      </span>
    </button>
  );
}

function toneIdle(tone: ChipTone): string {
  switch (tone) {
    case "live":
      return "border-emerald-800/60 bg-emerald-950/40 text-emerald-400 hover:border-emerald-700";
    case "final":
      return "border-[var(--border)] bg-[var(--surface-2)]/60 text-[var(--text-2)] hover:border-[var(--text-2)]";
    case "pre":
      return "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:border-[var(--text-2)]";
    case "off":
      return "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)] hover:border-[var(--text-2)]";
    default:
      return "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:border-[var(--text-2)]";
  }
}
