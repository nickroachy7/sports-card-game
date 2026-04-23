"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { removeToken } from "@/app/actions/tokens";
import { Card, type CardViewModel } from "@/components/card/Card";
import { CardDetailModal } from "@/components/card/CardDetailModal";
import { CollectionShell } from "@/components/collection/CollectionShell";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppliedTokenBadge } from "@/components/token/AppliedTokenBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CardTier, PlayerStatus, TokenType } from "@/lib/contracts/cards";
import { type GameStateFilter, matchesGameStateFilter } from "@/lib/lineup/game-state-filter";
import type { SlotGameInfo } from "@/lib/lineup/types";
import type { TeamSummary } from "@/lib/profile/team-summary";
import { cn } from "@/lib/utils";

type ContestSnapshot = {
  contestName: string;
  entryStatus: "building" | "submitted" | "live" | "final";
  lockCountdown: string;
  liveScore: number;
  finalScore: number;
} | null;

export type CollectionCard = CardViewModel & {
  positions: string[];
  playerStatus: PlayerStatus;
  /** Polish spec §63 (Phase 22). Needed so the Collection page can look
   *  up today's game by team for the game-state filter chips. */
  teamId: string | null;
  acquiredAt: string;
  appliedToken?: {
    tokenType: TokenType;
    bonusFp: number;
    applicationId: string;
  };
};

type TierFilter = "all" | CardTier;
type PositionFilter = "all" | "C" | "1B" | "2B" | "3B" | "SS" | "OF" | "DH" | "SP" | "RP" | "P";
type StatusFilter = "all" | "active" | "il" | "dfa" | "retired" | "expired";
type ContractFilter = "all" | "low" | "critical" | "expired";
type SortKey = "tier" | "fp" | "acquired" | "contract" | "name";

const TIER_ORDER: Record<CardTier, number> = { bronze: 0, silver: 1, gold: 2, diamond: 3 };

function matchPosition(cardPositions: string[], filter: PositionFilter): boolean {
  if (filter === "all") return true;
  return cardPositions.some((p) => positionMatches(p, filter));
}

function positionMatches(raw: string, filter: PositionFilter): boolean {
  const s = raw.toLowerCase();
  switch (filter) {
    case "C":
      return s.includes("catcher");
    case "1B":
      return s.includes("first");
    case "2B":
      return s.includes("second");
    case "3B":
      return s.includes("third");
    case "SS":
      return s.includes("short");
    case "OF":
      return s.includes("outfield") || s.includes("fielder");
    case "DH":
      return s.includes("designated");
    case "SP":
      return s.includes("starting pitcher");
    case "RP":
      return s.includes("relief pitcher");
    case "P":
      return s.includes("pitcher");
    default:
      return false;
  }
}

export function CollectionGrid({
  cards,
  collectionCap,
  slotGameByCardId,
  teamSummary,
  contestSnapshot,
}: {
  cards: CollectionCard[];
  collectionCap: number;
  /** Polish spec §63 (Phase 22). Keyed by card.id; missing key = no
   *  contest game today for that player. */
  slotGameByCardId: Record<string, SlotGameInfo>;
  /** Polish spec §88 (Phase 30). Unified sidebar top block. */
  teamSummary: TeamSummary;
  /** Null if no active contest entry today. */
  contestSnapshot: ContestSnapshot;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<TierFilter>("all");
  const [position, setPosition] = useState<PositionFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [contract, setContract] = useState<ContractFilter>("all");
  const [gameState, setGameState] = useState<GameStateFilter>("all");
  const [sort, setSort] = useState<SortKey>("tier");

  // Detail state is derived from the ?card query param so that
  // back/forward navigation naturally opens / closes the detail
  // and shareable links survive. The CardDetailModal reads this
  // directly; we keep detailCardId here for the "card deleted"
  // housekeeping below.
  const detailCardId = searchParams.get("card");

  const openDetail = useCallback(
    (cardId: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("card", cardId);
      router.push(`/collection?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const closeDetail = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("card");
    const q = next.toString();
    router.push(q ? `/collection?${q}` : "/collection", { scroll: false });
  }, [router, searchParams]);

  function handleRemoveToken(applicationId: string) {
    startTransition(async () => {
      const res = await removeToken({ tokenApplicationId: applicationId });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      router.refresh();
    });
  }

  // Keep the ?card param aligned with the current list: if it points
  // at a card we no longer have (quick-sold, destroyed, vaulted),
  // drop it so the sidebar falls back to summary stats.
  useEffect(() => {
    if (detailCardId && !cards.some((c) => c.id === detailCardId)) {
      closeDetail();
    }
  }, [detailCardId, cards, closeDetail]);

  // Polish spec §63 (Phase 22). Per-game-state counts for the chip row.
  // Counted against all cards — independent of the current chip
  // selection so the label on each chip is stable as the user toggles.
  // (The other filters still influence counts; mirrors the bench.)
  const gameStateCounts = useMemo(() => {
    const counts = { all: 0, pre: 0, live: 0, final: 0, off: 0 };
    const q = search.trim().toLowerCase();
    for (const c of cards) {
      if (q && !c.playerName.toLowerCase().includes(q)) continue;
      if (tier !== "all" && c.tier !== tier) continue;
      if (!matchPosition(c.positions, position)) continue;
      if (status === "expired" && !c.isExpired) continue;
      if (status !== "all" && status !== "expired" && c.playerStatus !== status) continue;
      if (contract === "expired" && !c.isExpired) continue;
      if (contract === "critical" && !(c.contractPlays > 0 && c.contractPlays <= 2)) continue;
      if (contract === "low" && !(c.contractPlays >= 3 && c.contractPlays <= 4)) continue;
      counts.all += 1;
      const info = slotGameByCardId[c.id] ?? null;
      if (matchesGameStateFilter(info, "pre")) counts.pre += 1;
      else if (matchesGameStateFilter(info, "live")) counts.live += 1;
      else if (matchesGameStateFilter(info, "final")) counts.final += 1;
      else counts.off += 1;
    }
    return counts;
  }, [cards, search, tier, position, status, contract, slotGameByCardId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards
      .filter((c) => {
        if (q && !c.playerName.toLowerCase().includes(q)) return false;
        if (tier !== "all" && c.tier !== tier) return false;
        if (!matchPosition(c.positions, position)) return false;
        if (status === "expired" && !c.isExpired) return false;
        if (status !== "all" && status !== "expired" && c.playerStatus !== status) return false;
        if (contract === "expired" && !c.isExpired) return false;
        if (contract === "critical" && !(c.contractPlays > 0 && c.contractPlays <= 2)) return false;
        if (contract === "low" && !(c.contractPlays >= 3 && c.contractPlays <= 4)) return false;
        if (!matchesGameStateFilter(slotGameByCardId[c.id] ?? null, gameState)) return false;
        return true;
      })
      .sort((a, b) => {
        switch (sort) {
          case "tier":
            return TIER_ORDER[b.tier] - TIER_ORDER[a.tier] || b.careerFp - a.careerFp;
          case "fp":
            return b.careerFp - a.careerFp;
          case "acquired":
            return new Date(b.acquiredAt).getTime() - new Date(a.acquiredAt).getTime();
          case "contract":
            return a.contractPlays - b.contractPlays;
          case "name":
            return a.playerName.localeCompare(b.playerName);
          default:
            return 0;
        }
      });
  }, [cards, search, tier, position, status, contract, gameState, sort, slotGameByCardId]);

  const nearCap = cards.length / collectionCap >= 0.95;

  function reset() {
    setSearch("");
    setTier("all");
    setPosition("all");
    setStatus("all");
    setContract("all");
    setGameState("all");
    setSort("tier");
  }

  const main = (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-6">
      {nearCap && (
        <div className="rounded-md border border-[#D4A647] bg-[#D4A64722] px-3 py-2 text-sm text-[var(--text)]">
          Collection nearly full — quick-sell low-value cards or visit the Shop.
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="font-sans font-bold text-2xl text-[var(--text)] tracking-tight">
            Collection
          </h1>
          <span className="text-[var(--text-3)] text-xs tabular-nums">
            {filtered.length === cards.length
              ? `${cards.length} / ${collectionCap} cards`
              : `${filtered.length} of ${cards.length} · ${cards.length} / ${collectionCap} total`}
          </span>
        </div>
        <Input
          placeholder="Search player…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-64"
        />
      </div>

      {/* Polish spec §63 (Phase 22) — game-state filter chips. Primary
          axis, so it sits above the secondary select filters. Tone-
          matched to SlotGameState pill tones so the chip tint
          previews what the user will see. */}
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

      {/* Filter bar — spec §25 relocates filters from sidebar to
          above the grid. */}
      <div className="flex flex-wrap items-end gap-3 border-[var(--border)] border-b pb-3">
        <FilterSelect
          label="Tier"
          value={tier}
          onChange={(v) => setTier(v as TierFilter)}
          options={[
            ["all", "Any"],
            ["bronze", "Bronze"],
            ["silver", "Silver"],
            ["gold", "Gold"],
            ["diamond", "Diamond"],
          ]}
        />
        <FilterSelect
          label="Position"
          value={position}
          onChange={(v) => setPosition(v as PositionFilter)}
          options={[
            ["all", "Any"],
            ["C", "C"],
            ["1B", "1B"],
            ["2B", "2B"],
            ["3B", "3B"],
            ["SS", "SS"],
            ["OF", "OF"],
            ["DH", "DH"],
            ["SP", "SP"],
            ["RP", "RP"],
          ]}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={[
            ["all", "Any"],
            ["active", "Active"],
            ["il", "IL"],
            ["dfa", "FA / DFA"],
            ["retired", "Legacy"],
            ["expired", "Expired"],
          ]}
        />
        <FilterSelect
          label="Contract"
          value={contract}
          onChange={(v) => setContract(v as ContractFilter)}
          options={[
            ["all", "Any"],
            ["low", "Low (3–4)"],
            ["critical", "Critical (≤2)"],
            ["expired", "Expired"],
          ]}
        />
        <FilterSelect
          label="Sort"
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={[
            ["tier", "Tier + FP"],
            ["fp", "Career FP"],
            ["contract", "Contract remaining"],
            ["acquired", "Acquired"],
            ["name", "Player name"],
          ]}
        />
        <Button variant="outline" size="sm" onClick={reset}>
          Reset
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] border-dashed bg-[var(--surface)] p-10 text-center text-[var(--text-3)] text-sm">
          {cards.length === 0
            ? "No cards yet. Open a pack from the Shop to start collecting."
            : "No cards match your filters."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((c) => (
            <div key={c.id} className="relative">
              <Card card={c} size="medium" onClick={() => openDetail(c.id)} />
              {c.appliedToken && (
                <div className="-right-2 -bottom-2 absolute z-10">
                  <AppliedTokenBadge
                    tokenType={c.appliedToken.tokenType}
                    bonusFp={c.appliedToken.bonusFp}
                    onRemove={() => handleRemoveToken(c.appliedToken?.applicationId ?? "")}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Polish spec §88 + §89 (Phase 30). Unified AppSidebar (summary
  // variant) always renders. Card detail is now a modal overlay
  // driven by the ?card URL param — same pattern as the lineup page.
  const sidebar = (
    <AppSidebar variant="summary" teamSummary={teamSummary} contest={contestSnapshot} />
  );

  return (
    <>
      <CardDetailModal />
      <CollectionShell main={main} sidebar={sidebar} />
    </>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[var(--text-3)] text-xs uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[var(--text)] text-sm"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

type ChipTone = "neutral" | "pre" | "live" | "final" | "off";

/**
 * Polish spec §63 (Phase 22). Mirror of the bench chip (see
 * src/components/lineup/BenchDrawer.tsx `GameStateChip`). Kept in two
 * places for now because the bench version lives in a client component
 * in the lineup page tree; pulling them into a shared module would
 * mean a client-only barrel that both pages import. Parallel definition
 * is simpler at this scale.
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
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase leading-tight tracking-wider transition-colors",
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
