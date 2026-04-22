"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { removeToken } from "@/app/actions/tokens";
import { Card, type CardViewModel } from "@/components/card/Card";
import { CardDetailDrawer } from "@/components/card/CardDetailDrawer";
import { SidebarRow, SidebarSection, SidebarStat } from "@/components/layout/sidebar-card";
import { AppliedTokenBadge } from "@/components/token/AppliedTokenBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type CardTier,
  type PlayerStatus,
  TIER_LABEL,
  type TokenType,
} from "@/lib/contracts/cards";

export type CollectionCard = CardViewModel & {
  positions: string[];
  playerStatus: PlayerStatus;
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
}: {
  cards: CollectionCard[];
  collectionCap: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<TierFilter>("all");
  const [position, setPosition] = useState<PositionFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [contract, setContract] = useState<ContractFilter>("all");
  const [sort, setSort] = useState<SortKey>("tier");

  // Drawer state is derived from the ?card query param so that
  // back/forward navigation naturally opens / closes the drawer and
  // shareable links survive.
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

  // Keep drawer-open-state aligned with URL: if the `?card=<id>` points
  // at a card we no longer have (quick-sold, destroyed, vaulted), close
  // the drawer and clear the param so we don't re-open on refresh.
  useEffect(() => {
    if (detailCardId && !cards.some((c) => c.id === detailCardId)) {
      closeDetail();
    }
  }, [detailCardId, cards, closeDetail]);

  const tierBreakdown = useMemo(() => {
    const b: Record<CardTier, number> = { bronze: 0, silver: 0, gold: 0, diamond: 0 };
    for (const c of cards) b[c.tier] += 1;
    return b;
  }, [cards]);

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
  }, [cards, search, tier, position, status, contract, sort]);

  const nearCap = cards.length / collectionCap >= 0.95;

  function reset() {
    setSearch("");
    setTier("all");
    setPosition("all");
    setStatus("all");
    setContract("all");
    setSort("tier");
  }

  return (
    <section className="mx-auto flex w-full max-w-7xl gap-6 px-6 py-6">
      {/* Grid */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {nearCap && (
          <div className="rounded-md border border-[#D4A647] bg-[#D4A64722] px-3 py-2 text-sm text-[var(--text)]">
            Collection nearly full — quick-sell low-value cards or visit the Shop.
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <h1 className="font-sans text-2xl font-bold tracking-tight text-[var(--text)]">
            Collection
          </h1>
          <Input
            placeholder="Search player…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-64"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--text-3)]">
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
                  <div className="absolute -right-2 -bottom-2 z-10">
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

      {/* Right rail */}
      <aside className="hidden w-60 shrink-0 flex-col gap-6 md:flex">
        <SidebarSection title="Collection">
          <SidebarStat value={`${cards.length} / ${collectionCap}`} accent={nearCap} />
        </SidebarSection>

        <SidebarSection title="Tiers">
          {(["diamond", "gold", "silver", "bronze"] as CardTier[]).map((t) => (
            <SidebarRow key={t} label={TIER_LABEL[t]} value={tierBreakdown[t]} />
          ))}
        </SidebarSection>

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

        <Button variant="outline" onClick={reset}>
          Reset
        </Button>
      </aside>
      <CardDetailDrawer
        cardId={detailCardId}
        open={detailCardId !== null}
        onOpenChange={(next) => {
          if (!next) closeDetail();
        }}
      />
    </section>
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
      <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)]"
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
