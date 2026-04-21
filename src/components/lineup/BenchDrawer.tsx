"use client";

import { useMemo, useState } from "react";

import type { AppliedTokenInfo } from "@/app/(app)/lineup/lineup-view";
import { Input } from "@/components/ui/input";
import type { LineupCardVM } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";
import { BenchCard } from "./BenchCard";

type PositionFilter = "all" | "hitters" | "pitchers";

type Props = {
  cards: LineupCardVM[];
  assignedCardIds: Set<string>;
  appliedTokenByCardId: Map<string, AppliedTokenInfo>;
  onRemoveToken: (applicationId: string) => void;
  onOpenDetail: (cardId: string) => void;
  locked: boolean;
};

export function BenchDrawer({
  cards,
  assignedCardIds,
  appliedTokenByCardId,
  onRemoveToken,
  onOpenDetail,
  locked,
}: Props) {
  const [filter, setFilter] = useState<PositionFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards
      .filter((c) => {
        if (filter === "hitters" && c.isPitcher) return false;
        if (filter === "pitchers" && !c.isPitcher) return false;
        if (q && !c.playerName.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        // Unassigned first, then by name.
        const aAssigned = assignedCardIds.has(a.id);
        const bAssigned = assignedCardIds.has(b.id);
        if (aAssigned !== bAssigned) return aAssigned ? 1 : -1;
        return a.playerName.localeCompare(b.playerName);
      });
  }, [cards, filter, search, assignedCardIds]);

  return (
    <section className="flex flex-col gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-2">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs uppercase tracking-wider text-[var(--text-3)]">Bench</h2>
          <span className="font-mono text-xs text-[var(--text-2)]">
            {cards.length - assignedCardIds.size} available
          </span>
        </div>
        <div className="flex items-center gap-2">
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
