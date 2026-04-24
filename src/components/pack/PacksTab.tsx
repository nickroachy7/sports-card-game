"use client";

import { Coins, Package } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { type OpenPacksBatchResult, openPacksBatch } from "@/app/actions/packs";
import { Button } from "@/components/ui/button";
import type { PackType } from "@/lib/contracts/cards";
import { cn } from "@/lib/utils";

/**
 * Polish spec §143 (Phase 42). Third sidebar tab — inline pack buy UI.
 *
 * Ported verbatim from the now-deleted BuyPacksModal (§144). Same
 * decision surface: daily-pack card + × 1 / × 5 / × 10 standard pack
 * quantity toggle + single buy button. Fits in a ~304px-wide sidebar
 * column without scrolling on the default lineup layout.
 *
 * On confirm, fires openPacksBatch and hands the aggregated result up
 * via onOpened. Caller drives the pack reveal (Phase 42 still uses
 * PackOpenerModal; Phase 43 swaps it for the in-place panel).
 */

type Quantity = 1 | 5 | 10;

type Props = {
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
  const [qty, setQty] = useState<Quantity>(1);
  const [pending, startTransition] = useTransition();

  const totalCost = qty * standardCost;
  const canAffordStandard = coinBalance >= totalCost;
  const shortBy = canAffordStandard ? 0 : totalCost - coinBalance;

  const countdown = useMemo(
    () => formatCountdown(dailySecondsUntilReady),
    [dailySecondsUntilReady],
  );

  function handleClaimDaily() {
    startTransition(async () => {
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
    });
  }

  function handleBuyStandard() {
    if (!canAffordStandard) return;
    startTransition(async () => {
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
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Coin balance chip — top anchor so user knows what they can afford. */}
      <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs">
        <Coins className="size-3.5 text-[var(--tier-gold)]" aria-hidden="true" />
        <span className="font-bold font-mono text-[var(--text)]">
          {coinBalance.toLocaleString()}
        </span>
        <span className="text-[var(--text-3)]">coins</span>
      </div>

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
          disabled={!dailyReady || pending}
          className="w-full text-xs"
        >
          {dailyReady ? (pending ? "Claiming…" : "Claim daily pack") : `Ready in ${countdown}`}
        </Button>
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
        <div className="flex items-baseline justify-between">
          <h3 className="font-bold font-sans text-[var(--text)] text-xs">Packs</h3>
          <span className="font-mono text-[10px] text-[var(--text-3)] uppercase tracking-wider">
            {standardCost.toLocaleString()}c each
          </span>
        </div>

        <fieldset className="flex gap-1.5 border-0 p-0">
          <legend className="sr-only">Pack quantity</legend>
          {QUANTITY_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              aria-pressed={qty === opt}
              onClick={() => setQty(opt)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0 rounded border px-1 py-1.5 transition-colors",
                qty === opt
                  ? "border-[var(--tier-gold)] bg-[var(--bg)] text-[var(--text)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:border-[var(--text-2)]",
              )}
            >
              <span className="font-bold font-sans text-sm leading-tight">× {opt}</span>
              <span className="font-mono text-[9px] text-[var(--text-3)] tabular-nums">
                {(opt * standardCost).toLocaleString()}
              </span>
            </button>
          ))}
        </fieldset>

        <Button
          size="sm"
          onClick={handleBuyStandard}
          disabled={!canAffordStandard || pending}
          className="w-full text-xs"
        >
          {pending
            ? "Opening…"
            : `Buy ${qty} pack${qty === 1 ? "" : "s"} (${totalCost.toLocaleString()}c)`}
        </Button>
        {!canAffordStandard && (
          <p className="text-center text-[10px] text-[var(--text-3)]">
            Need {shortBy.toLocaleString()} more coins.
          </p>
        )}
      </section>

      {/* Small footer icon hint so the tab has some visual anchor
          when the daily pack section is in cooldown. */}
      <div className="flex items-center justify-center gap-1 pt-1 text-[10px] text-[var(--text-3)]">
        <Package className="size-3" aria-hidden="true" />
        <span>Pack odds in economy config</span>
      </div>
    </div>
  );
}

function formatCountdown(secs: number): string {
  const total = Math.max(0, Math.floor(secs));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
