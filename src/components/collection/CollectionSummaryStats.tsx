"use client";

import { useMemo } from "react";

import type { CollectionCard } from "@/app/(app)/collection/collection-grid";
import { SidebarRow, SidebarSection, SidebarStat } from "@/components/layout/sidebar-card";
import { type CardTier, TIER_LABEL } from "@/lib/contracts/cards";

type Props = {
  cards: CollectionCard[];
  collectionCap: number;
};

/**
 * Polish spec §25 (Phase 13) — default content for the collection
 * page sidebar. Three SidebarSections: overview, tier breakdown,
 * contracts narrative.
 *
 * Data is derived from the `cards` already loaded on the page — no
 * extra queries, no Realtime subscription. The sidebar re-computes
 * when the page refreshes (standard Next.js router.refresh path).
 */
export function CollectionSummaryStats({ cards, collectionCap }: Props) {
  const stats = useMemo(() => {
    const tierBreakdown: Record<CardTier, number> = {
      bronze: 0,
      silver: 0,
      gold: 0,
      diamond: 0,
    };
    let careerFpTotal = 0;
    let activeContracts = 0;
    let expiringSoon = 0;
    let oldest: CollectionCard | null = null;
    let newest: CollectionCard | null = null;
    for (const c of cards) {
      tierBreakdown[c.tier] += 1;
      careerFpTotal += c.careerFp;
      if (!c.isExpired) activeContracts += 1;
      if (!c.isExpired && c.contractPlays <= 3 && c.contractPlays > 0) expiringSoon += 1;
      if (!oldest || c.acquiredAt < oldest.acquiredAt) oldest = c;
      if (!newest || c.acquiredAt > newest.acquiredAt) newest = c;
    }
    return {
      tierBreakdown,
      careerFpTotal,
      activeContracts,
      expiringSoon,
      oldest,
      newest,
    };
  }, [cards]);

  const nearCap = cards.length / collectionCap >= 0.95;

  return (
    <>
      <SidebarSection title="Overview">
        <SidebarStat value={`${cards.length} / ${collectionCap}`} accent={nearCap} />
        <SidebarRow label="Career FP" value={formatFp(stats.careerFpTotal)} />
        <SidebarRow label="Active contracts" value={stats.activeContracts} />
      </SidebarSection>

      <SidebarSection title="Tiers">
        {(["diamond", "gold", "silver", "bronze"] as CardTier[]).map((t) => (
          <SidebarRow
            key={t}
            label={
              <span className="flex items-center gap-2">
                <TierSwatch tier={t} />
                <span>{TIER_LABEL[t]}</span>
              </span>
            }
            value={stats.tierBreakdown[t]}
          />
        ))}
      </SidebarSection>

      <SidebarSection title="Contracts">
        <SidebarRow
          label="Expiring (≤3)"
          value={
            <span className={stats.expiringSoon > 0 ? "text-[#C47262]" : undefined}>
              {stats.expiringSoon}
            </span>
          }
        />
        <SidebarRow
          label="Oldest"
          value={<span className="truncate text-xs">{stats.oldest?.playerName ?? "—"}</span>}
        />
        <SidebarRow
          label="Newest"
          value={<span className="truncate text-xs">{stats.newest?.playerName ?? "—"}</span>}
        />
      </SidebarSection>
    </>
  );
}

function TierSwatch({ tier }: { tier: CardTier }) {
  const color =
    tier === "diamond"
      ? "bg-[var(--tier-diamond,#B9F2FF)]"
      : tier === "gold"
        ? "bg-[var(--tier-gold,#D4A647)]"
        : tier === "silver"
          ? "bg-[var(--tier-silver,#C0C0C0)]"
          : "bg-[var(--tier-bronze,#CD7F32)]";
  return <span className={`inline-block size-2.5 rounded-full ${color}`} aria-hidden="true" />;
}

function formatFp(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}
