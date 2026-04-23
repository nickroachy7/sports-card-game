"use client";

import { useMemo, useState } from "react";

import type { AppliedTokenInfo } from "@/app/(app)/lineup/lineup-view";
import { Input } from "@/components/ui/input";
import { TIER_FRAME } from "@/lib/card/tiers";
import type { CardTier } from "@/lib/contracts/cards";
import type { LineupPosition } from "@/lib/contracts/lineup";
import { type GameStateFilter, matchesGameStateFilter } from "@/lib/lineup/game-state-filter";
import type { LineupCardVM, SlotGameInfo } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";
import { BenchCard } from "./BenchCard";

type PositionFilter = "all" | "hitters" | "pitchers";
type TierFilter = "all" | CardTier;

type Props = {
  cards: LineupCardVM[];
  assignedCardIds: Set<string>;
  /** Polish spec §94 (Phase 32). cardId → the lineup slot position
   *  that holds it. Needed so the drag source knows `fromPosition`
   *  for cards that are currently rostered — the drop handler on
   *  LineupSlot routes those drags through swap_lineup_slots. */
  cardToSlotPosition: Map<string, LineupPosition>;
  appliedTokenByCardId: Map<string, AppliedTokenInfo>;
  /** Keyed by card id; null entry or missing key = no contest
   *  game today for that player. */
  slotGameByCardId: Record<string, SlotGameInfo>;
  onRemoveToken: (applicationId: string) => void;
  onOpenDetail: (cardId: string) => void;
  /** Polish spec §104 (Phase 35). Multi-select mode state; owned by
   *  LineupView so the sidebar swap can read the same selection. */
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelectMode: () => void;
  onToggleSelect: (cardId: string) => void;
  locked: boolean;
};

/**
 * Polish spec §94 (Phase 32). Unified cards grid replacing the
 * horizontal bench carousel + the `/collection` page. Shows every
 * card the user owns in a responsive CSS grid — 2 columns on narrow
 * screens, up to 8 on 2K+ monitors. Cards currently in the lineup
 * render with a subtle "IN LINEUP" pill + reduced opacity so the
 * available pool still pops.
 *
 * Filters stack on top of the grid:
 *   - Hitters/Pitchers (position)
 *   - Tier (All / Bronze / Silver / Gold / Diamond)
 *   - Game-state (All / Pre / Live / Final / Off)
 *   - Search (player name substring)
 *
 * Drag-and-drop: `cardToSlotPosition` tells BenchCard whether the
 * card is rostered; if so, the drag item carries `fromPosition` so
 * the lineup slot's drop handler routes through swap_lineup_slots
 * instead of update_lineup_slot. Pair with `useAutoScrollOnDrag`
 * at the page level so cards below the fold can still reach lineup
 * slots at the top.
 */
export function CardsPanel({
  cards,
  assignedCardIds,
  cardToSlotPosition,
  appliedTokenByCardId,
  slotGameByCardId,
  onRemoveToken,
  onOpenDetail,
  selectMode,
  selectedIds,
  onToggleSelectMode,
  onToggleSelect,
  locked,
}: Props) {
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [gameState, setGameState] = useState<GameStateFilter>("all");
  const [search, setSearch] = useState("");

  // Counts per filter dimension, respecting the OTHER active
  // filters. Game-state and tier chips show counts that update as
  // users slice — matches P22 bench chip behavior.
  const counts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const gs = { all: 0, pre: 0, live: 0, final: 0, off: 0 };
    const tiers = { all: 0, bronze: 0, silver: 0, gold: 0, diamond: 0 };
    for (const c of cards) {
      if (positionFilter === "hitters" && c.isPitcher) continue;
      if (positionFilter === "pitchers" && !c.isPitcher) continue;
      if (q && !c.playerName.toLowerCase().includes(q)) continue;
      const gameInfo = slotGameByCardId[c.id] ?? null;
      // Game-state counts respect the tier filter but not the
      // game-state filter itself (else all counts would collapse
      // to whichever bucket is currently selected).
      if (tierFilter === "all" || c.tier === tierFilter) {
        gs.all += 1;
        if (matchesGameStateFilter(gameInfo, "pre")) gs.pre += 1;
        else if (matchesGameStateFilter(gameInfo, "live")) gs.live += 1;
        else if (matchesGameStateFilter(gameInfo, "final")) gs.final += 1;
        else gs.off += 1;
      }
      // Tier counts respect the game-state filter but not the tier
      // filter.
      if (matchesGameStateFilter(gameInfo, gameState)) {
        tiers.all += 1;
        tiers[c.tier] += 1;
      }
    }
    return { gameState: gs, tier: tiers };
  }, [cards, positionFilter, tierFilter, gameState, search, slotGameByCardId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards
      .filter((c) => {
        if (positionFilter === "hitters" && c.isPitcher) return false;
        if (positionFilter === "pitchers" && !c.isPitcher) return false;
        if (q && !c.playerName.toLowerCase().includes(q)) return false;
        if (tierFilter !== "all" && c.tier !== tierFilter) return false;
        if (!matchesGameStateFilter(slotGameByCardId[c.id] ?? null, gameState)) return false;
        return true;
      })
      .sort((a, b) => {
        // Unassigned cards bubble up before rostered ones (so the
        // pool of draftable options is visually prioritised).
        const aAssigned = assignedCardIds.has(a.id);
        const bAssigned = assignedCardIds.has(b.id);
        if (aAssigned !== bAssigned) return aAssigned ? 1 : -1;
        const rA = stateRank(slotGameByCardId[a.id] ?? null);
        const rB = stateRank(slotGameByCardId[b.id] ?? null);
        if (rA !== rB) return rA - rB;
        if (rA === 0) {
          const tA = slotGameByCardId[a.id]?.scheduledStart ?? null;
          const tB = slotGameByCardId[b.id]?.scheduledStart ?? null;
          if (tA && tB && tA !== tB) return tA < tB ? -1 : 1;
          if (tA && !tB) return -1;
          if (!tA && tB) return 1;
        }
        return a.playerName.localeCompare(b.playerName);
      });
  }, [cards, positionFilter, tierFilter, gameState, search, assignedCardIds, slotGameByCardId]);

  const availableCount = cards.length - assignedCardIds.size;

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs uppercase tracking-wider text-[var(--text-3)]">Cards</h2>
          {locked ? (
            <span className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--text-3)]">
              Locked
            </span>
          ) : (
            <span className="font-mono text-xs text-[var(--text-2)]">
              {availableCount} available
              {assignedCardIds.size > 0 && (
                <span className="ml-1 text-[var(--text-3)]">
                  · {assignedCardIds.size} in lineup
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterButton
            label="All"
            active={positionFilter === "all"}
            onClick={() => setPositionFilter("all")}
          />
          <FilterButton
            label="Hitters"
            active={positionFilter === "hitters"}
            onClick={() => setPositionFilter("hitters")}
          />
          <FilterButton
            label="Pitchers"
            active={positionFilter === "pitchers"}
            onClick={() => setPositionFilter("pitchers")}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-7 w-36 text-xs"
          />
          {/* Polish spec §104 (Phase 35). Select chip toggles multi-
              select mode; sidebar swaps to <SelectionPanel> while
              it's on. Hidden when locked (post-submit — no point
              selecting anything you can't act on). */}
          {!locked && (
            <button
              type="button"
              onClick={onToggleSelectMode}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium uppercase tracking-wider transition-colors",
                selectMode
                  ? "border-[var(--tier-gold)] bg-[var(--tier-gold)] text-[var(--bg)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:border-[var(--text-2)]",
              )}
              aria-pressed={selectMode}
            >
              {selectMode ? `Done (${selectedIds.size})` : "Select"}
            </button>
          )}
        </div>
      </header>

      {/* Filter chip rows — tier + game-state, both with live counts. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <TierChip
          label="All"
          tone="neutral"
          count={counts.tier.all}
          active={tierFilter === "all"}
          onClick={() => setTierFilter("all")}
        />
        <TierChip
          label="Bronze"
          tone="bronze"
          count={counts.tier.bronze}
          active={tierFilter === "bronze"}
          onClick={() => setTierFilter("bronze")}
        />
        <TierChip
          label="Silver"
          tone="silver"
          count={counts.tier.silver}
          active={tierFilter === "silver"}
          onClick={() => setTierFilter("silver")}
        />
        <TierChip
          label="Gold"
          tone="gold"
          count={counts.tier.gold}
          active={tierFilter === "gold"}
          onClick={() => setTierFilter("gold")}
        />
        <TierChip
          label="Diamond"
          tone="diamond"
          count={counts.tier.diamond}
          active={tierFilter === "diamond"}
          onClick={() => setTierFilter("diamond")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <GameStateChip
          label="All"
          tone="neutral"
          count={counts.gameState.all}
          active={gameState === "all"}
          onClick={() => setGameState("all")}
        />
        <GameStateChip
          label="Pre"
          tone="pre"
          count={counts.gameState.pre}
          active={gameState === "pre"}
          onClick={() => setGameState("pre")}
        />
        <GameStateChip
          label="Live"
          tone="live"
          count={counts.gameState.live}
          active={gameState === "live"}
          onClick={() => setGameState("live")}
        />
        <GameStateChip
          label="Final"
          tone="final"
          count={counts.gameState.final}
          active={gameState === "final"}
          onClick={() => setGameState("final")}
        />
        <GameStateChip
          label="Off"
          tone="off"
          count={counts.gameState.off}
          active={gameState === "off"}
          onClick={() => setGameState("off")}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex h-[140px] items-center justify-center rounded border border-dashed border-[var(--border)] px-4 text-center text-xs text-[var(--text-3)]">
          {cards.length === 0
            ? "No cards yet. Open a pack from the Shop to start your collection."
            : "No cards match the filter."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
          {filtered.map((card) => {
            const assigned = assignedCardIds.has(card.id);
            return (
              <div key={card.id} className="relative flex justify-center">
                {assigned && (
                  <span className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2 rounded-full border border-[var(--text)]/40 bg-[var(--bg)]/80 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--text)] backdrop-blur-sm">
                    In lineup
                  </span>
                )}
                <BenchCard
                  card={card}
                  assigned={assigned}
                  fromPosition={cardToSlotPosition.get(card.id) ?? null}
                  appliedToken={appliedTokenByCardId.get(card.id)}
                  gameInfo={slotGameByCardId[card.id] ?? null}
                  onRemoveToken={onRemoveToken}
                  onOpenDetail={onOpenDetail}
                  selectMode={selectMode}
                  isSelected={selectedIds.has(card.id)}
                  onToggleSelect={onToggleSelect}
                  disabled={locked || card.isExpired}
                  locked={locked}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Priority-sort rank by game state.
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

type GameStateChipTone = "neutral" | "pre" | "live" | "final" | "off";

function GameStateChip({
  label,
  tone,
  count,
  active,
  onClick,
}: {
  label: string;
  tone: GameStateChipTone;
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
        active ? "border-[var(--text)] text-[var(--text)]" : gameStateToneIdle(tone),
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

function gameStateToneIdle(tone: GameStateChipTone): string {
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

type TierChipTone = "neutral" | CardTier;

function TierChip({
  label,
  tone,
  count,
  active,
  onClick,
}: {
  label: string;
  tone: TierChipTone;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const frame = tone !== "neutral" ? TIER_FRAME[tone] : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase leading-tight tracking-wider transition-colors",
        "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]",
        !active && "hover:border-[var(--text-2)]",
        active && "border-[var(--text)] text-[var(--text)]",
      )}
      style={
        active && frame
          ? {
              borderColor: frame.fill,
              color: frame.fill,
            }
          : undefined
      }
    >
      <span>{label}</span>
      <span
        className={cn("tabular-nums", active ? "" : "text-[var(--text-3)]")}
        style={active && frame ? { color: frame.fill } : undefined}
      >
        {count}
      </span>
    </button>
  );
}
