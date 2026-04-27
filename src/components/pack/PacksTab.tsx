"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { type OpenPacksBatchResult, openPacksBatch } from "@/app/actions/packs";
import { Button } from "@/components/ui/button";
import type { PackType } from "@/lib/contracts/cards";
import { cn } from "@/lib/utils";

/**
 * Polish spec §143 (Phase 42) → §227 (Phase 58) → §228 (Phase 58 v2).
 *
 * Sidebar Packs tab — daily-pack claim + standard-pack buy UI.
 *
 * §228 simplification (after first-look user feedback):
 *   - Drop the bordered/filled `<section>` boxes. They created
 *     visual nesting that didn't carry meaning — the tab body is
 *     already the container.
 *   - Drop the pack-odds tooltip. Was inaccurate: packs only
 *     contain Bronze cards (higher tiers come from career-FP
 *     progression, not pulls). Replaced with a single quiet
 *     footer line stating that fact.
 *   - Drop the redundant "250c each" subtitle. The per-button
 *     totals make it obvious.
 *   - Drop the "Pack odds in economy config" footer link.
 *
 * Three-line buy buttons ("×N · Buy N packs · total c") are kept
 * from §227 — user explicitly wanted them split into stacked
 * full-width rows.
 */

type Quantity = 1 | 5 | 10;

type Props = {
  /** Coin balance — used internally for affordance check; not displayed
   *  here (the page header owns the visible balance). */
  coinBalance: number;
  dailyReady: boolean;
  /** Seconds until the daily pack is ready again; only used when
   *  `dailyReady` is false. */
  dailySecondsUntilReady: number;
  /** Cost of one standard pack, in coins. Pulled from economy_config. */
  standardCost: number;
  /** Called after a successful buy. Payload mirrors the batch action
   *  so the caller can drive the reveal. */
  onOpened: (result: OpenPacksBatchResult, packType: PackType) => void;
};

const QUANTITY_OPTIONS: Quantity[] = [1, 5, 10];

export function PacksTab({
  coinBalance,
  dailyReady,
  dailySecondsUntilReady,
  standardCost,
  onOpened,
}: Props) {
  const [pendingQty, setPendingQty] = useState<Quantity | "daily" | null>(null);
  const [isPending, startTransition] = useTransition();

  const countdown = useMemo(
    () => formatCountdown(dailySecondsUntilReady),
    [dailySecondsUntilReady],
  );

  function handleClaimDaily() {
    setPendingQty("daily");
    startTransition(async () => {
      try {
        const res = await openPacksBatch({ packType: "daily", quantity: 1 });
        if (!res.ok) {
          toast.error(res.error.message);
          return;
        }
        const { failures } = res.data;
        if (failures.length > 0) {
          toast.error(failures[0]?.message ?? "Couldn't open daily pack.");
          return;
        }
        onOpened(res.data, "daily");
      } finally {
        setPendingQty(null);
      }
    });
  }

  function handleBuyStandard(qty: Quantity) {
    const totalCost = qty * standardCost;
    if (coinBalance < totalCost) return;
    setPendingQty(qty);
    startTransition(async () => {
      try {
        const res = await openPacksBatch({ packType: "standard", quantity: qty });
        if (!res.ok) {
          toast.error(res.error.message);
          return;
        }
        const { openings, failures } = res.data;
        if (openings.length === 0) {
          toast.error(failures[0]?.message ?? "Couldn't open packs.");
          return;
        }
        if (failures.length > 0) {
          toast.warning(
            `Opened ${openings.length} of ${qty} packs — ${failures[0]?.message ?? "some failed"}`,
          );
        }
        onOpened(res.data, "standard");
      } finally {
        setPendingQty(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Daily pack — single labeled block, no card chrome. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
            Daily pack
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--tier-gold)]">
            Free
          </span>
        </div>
        <Button
          size="sm"
          onClick={handleClaimDaily}
          disabled={!dailyReady || isPending}
          className="w-full text-xs"
        >
          {dailyReady
            ? pendingQty === "daily"
              ? "Claiming…"
              : "Claim daily pack"
            : `Ready in ${countdown}`}
        </Button>
      </div>

      {/* Buy packs — three stacked full-width rows. */}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
          Buy packs
        </span>
        {QUANTITY_OPTIONS.map((qty) => (
          <PackBuyButton
            key={qty}
            qty={qty}
            standardCost={standardCost}
            coinBalance={coinBalance}
            isPending={pendingQty === qty}
            disabled={isPending}
            onBuy={() => handleBuyStandard(qty)}
          />
        ))}
      </div>

      {/* §228. Quiet footer note replacing the inaccurate tier-rarity
          tooltip. Packs are Bronze-only; tiers come from gameplay. */}
      <p className="text-center text-[10px] text-[var(--text-3)] leading-snug">
        All packs contain Bronze cards. Higher tiers are earned through play.
      </p>
    </div>
  );
}

function PackBuyButton({
  qty,
  standardCost,
  coinBalance,
  isPending,
  disabled,
  onBuy,
}: {
  qty: Quantity;
  standardCost: number;
  coinBalance: number;
  isPending: boolean;
  disabled: boolean;
  onBuy: () => void;
}) {
  const totalCost = qty * standardCost;
  const canAfford = coinBalance >= totalCost;

  // §228 v3 (Phase 58). Match the cream-on-dark visual of the
  // shadcn <Button variant="default"> used by the Claim daily
  // pack button — `bg-[var(--text)] text-[var(--bg)]` with a
  // `hover:bg-[var(--text-2)]` rollover. Disabled state inherits
  // the standard `disabled:opacity-50` from the same affordance.
  // Layout (×N · action · total) is preserved.
  return (
    <button
      type="button"
      onClick={onBuy}
      disabled={!canAfford || disabled}
      className={cn(
        "flex h-8 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors",
        "bg-[var(--text)] text-[var(--bg)] hover:bg-[var(--text-2)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-2)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
      aria-label={`Buy ${qty} pack${qty === 1 ? "" : "s"} for ${totalCost} coins`}
    >
      <span className="flex w-8 shrink-0 items-baseline justify-center font-bold font-sans text-base">
        ×{qty}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">
        {isPending ? "Opening…" : `Buy ${qty} pack${qty === 1 ? "" : "s"}`}
      </span>
      <span className="font-bold font-mono text-xs tabular-nums">
        {totalCost.toLocaleString()}c
      </span>
    </button>
  );
}

function formatCountdown(secs: number): string {
  const total = Math.max(0, Math.floor(secs));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
