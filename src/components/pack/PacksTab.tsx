"use client";

import { HelpCircle } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { type OpenPacksBatchResult, openPacksBatch } from "@/app/actions/packs";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PackType } from "@/lib/contracts/cards";
import { cn } from "@/lib/utils";

/**
 * Polish spec §143 (Phase 42) → §227 (Phase 58).
 *
 * Sidebar Packs tab — daily-pack claim + standard-pack buy UI.
 *
 * §227 changes:
 *   - Coin balance row removed (already in the page header).
 *   - x1 / x5 / x10 split into three full-width stacked buttons.
 *     Each is its own buy CTA with explicit price + "save"
 *     callout vs the per-pack rate.
 *   - Pack-odds info moved from a footer text-link to a "?"
 *     tooltip on the Packs section header.
 *
 * Rest of the contract is unchanged from §143:
 *   - openPacksBatch fires per-button.
 *   - onOpened hands the batch up so the caller drives the reveal.
 */

type Quantity = 1 | 5 | 10;

type Props = {
  /** Coin balance — used internally for affordance check; not displayed. */
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
  // §227. Track which quantity button is mid-flight so we can
  // disable just that one (others stay clickable if affordable).
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
    <div className="flex flex-col gap-3">
      {/* §227: coin balance row removed (already in page header). */}

      <section className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
        <div className="flex items-baseline justify-between">
          <h3 className="font-bold font-sans text-[var(--text)] text-xs">Daily pack</h3>
          <span className="font-mono text-[10px] text-[var(--tier-gold)] uppercase tracking-wider">
            Free
          </span>
        </div>
        <p className="text-[11px] text-[var(--text-3)] leading-snug">
          Claim once every 24 hours. Weighted toward bench / role players.
        </p>
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
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <h3 className="font-bold font-sans text-[var(--text)] text-xs">Packs</h3>
            <PackOddsTooltip />
          </div>
          <span className="font-mono text-[10px] text-[var(--text-3)] uppercase tracking-wider">
            {standardCost.toLocaleString()}c each
          </span>
        </div>

        {/* §227. Three stacked full-width buttons — each is its own
            buy CTA. Removes the prior x1/x5/x10 toggle + separate
            buy button combo. Per-pack price + bulk savings shown
            inline so users can compare value at a glance. */}
        <div className="flex flex-col gap-1.5">
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
      </section>
    </div>
  );
}

/**
 * §227. Per-quantity buy button. Layout:
 *
 *   ┌─────────────────────────────────┐
 *   │  × 5    Buy 5 packs    1,250c   │
 *   │         (save 50c vs x1)         │
 *   └─────────────────────────────────┘
 */
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
  const shortBy = canAfford ? 0 : totalCost - coinBalance;
  // Bulk savings copy. Pricing is currently linear (no discount), so
  // this only renders if a future config introduces non-linear
  // pricing — silent today. Wired now so adding the discount later
  // doesn't require a UI change.
  const baseRate = standardCost;
  const effectiveRate = totalCost / qty;
  const savings = (baseRate - effectiveRate) * qty;
  const savingsCopy = savings > 0 ? `save ${Math.round(savings).toLocaleString()}c vs ×1` : null;

  return (
    <button
      type="button"
      onClick={onBuy}
      disabled={!canAfford || disabled}
      className={cn(
        "group flex w-full items-center gap-3 rounded-md border bg-[var(--surface)] px-3 py-2 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--text-2)]",
        canAfford && !disabled && "border-[var(--border)] hover:border-[var(--tier-gold)]",
        (!canAfford || disabled) && "border-[var(--border)] opacity-60",
      )}
      aria-label={`Buy ${qty} pack${qty === 1 ? "" : "s"} for ${totalCost} coins`}
    >
      <span className="flex w-10 shrink-0 items-baseline justify-center font-bold font-sans text-base text-[var(--text)]">
        ×{qty}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-[12px] text-[var(--text)]">
          {isPending ? "Opening…" : `Buy ${qty} pack${qty === 1 ? "" : "s"}`}
        </span>
        {savingsCopy && (
          <span className="font-mono text-[9px] text-[var(--tier-gold)] uppercase tracking-wider">
            {savingsCopy}
          </span>
        )}
        {!canAfford && (
          <span className="font-mono text-[9px] text-[#C47262] uppercase tracking-wider">
            need {shortBy.toLocaleString()}c
          </span>
        )}
      </span>
      <span className="font-bold font-mono text-[12px] text-[var(--text)] tabular-nums">
        {totalCost.toLocaleString()}c
      </span>
    </button>
  );
}

/**
 * §227. Pack-odds tooltip. Shown as a small "?" next to the Packs
 * section header. Tooltip body explains the tier-rarity ordering;
 * exact percentages are intentionally omitted (they live in
 * economy_config and adjust season-to-season — exposing fixed
 * numbers in the UI sets the wrong expectation).
 */
function PackOddsTooltip() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-3.5 items-center justify-center rounded-full text-[var(--text-3)] hover:text-[var(--text-2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--text-2)]"
          aria-label="Pack odds"
        >
          <HelpCircle className="size-3" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-[240px] px-3 py-2">
        <div className="flex flex-col gap-1.5 text-left">
          <span className="font-bold text-xs">Pack odds</span>
          <p className="text-[11px] text-[var(--text-3)] leading-snug">
            Each pack rolls per-card by tier. Rarity (most → least common):
          </p>
          <ul className="flex flex-col gap-0.5 text-[11px]">
            <li className="flex items-center gap-2">
              <span
                className="size-1.5 rounded-full"
                style={{ background: "var(--tier-bronze)" }}
              />
              <span className="text-[var(--text-2)]">Bronze — most common</span>
            </li>
            <li className="flex items-center gap-2">
              <span
                className="size-1.5 rounded-full"
                style={{ background: "var(--tier-silver)" }}
              />
              <span className="text-[var(--text-2)]">Silver</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full" style={{ background: "var(--tier-gold)" }} />
              <span className="text-[var(--text-2)]">Gold — rare</span>
            </li>
            <li className="flex items-center gap-2">
              <span
                className="size-1.5 rounded-full"
                style={{ background: "var(--tier-diamond)" }}
              />
              <span className="text-[var(--text-2)]">Diamond — very rare</span>
            </li>
          </ul>
          <p className="pt-0.5 text-[10px] text-[var(--text-3)] italic leading-snug">
            Daily pack skews toward bench / role players.
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function formatCountdown(secs: number): string {
  const total = Math.max(0, Math.floor(secs));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
