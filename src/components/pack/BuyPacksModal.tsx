"use client";

import { Coins, Package } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { type OpenPacksBatchResult, openPacksBatch } from "@/app/actions/packs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PackType } from "@/lib/contracts/cards";
import { cn } from "@/lib/utils";

/**
 * Polish spec §109 (Phase 36). Buy-packs modal that replaced the
 * dedicated `/shop` page. Shows:
 *   - Daily pack (free, once-per-24h), enabled when `dailyReady`.
 *   - Standard pack bundles × 1 / × 5 / × 10 at flat per-pack cost.
 *
 * On confirm, fires `openPacksBatch` and hands the aggregated result
 * up to the caller. Caller drops straight into the redesigned pack
 * reveal (§111).
 */

type Quantity = 1 | 5 | 10;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function BuyPacksModal({
  open,
  onOpenChange,
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
      onOpenChange(false);
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
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-5 text-[var(--tier-gold)]" aria-hidden="true" />
            Buy packs
          </DialogTitle>
          <div className="flex items-center gap-1.5 pt-1 text-xs text-[var(--text-2)]">
            <Coins className="size-3.5 text-[var(--tier-gold)]" aria-hidden="true" />
            <span className="font-mono font-bold text-[var(--text)]">
              {coinBalance.toLocaleString()}
            </span>
            <span className="text-[var(--text-3)]">coins</span>
          </div>
        </DialogHeader>

        <section className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-sans text-sm font-bold text-[var(--text)]">Daily pack</h3>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--tier-gold)]">
              Free
            </span>
          </div>
          <p className="text-xs text-[var(--text-2)]">
            Claim once every 24 hours. Smaller pack weighted toward bench / role players.
          </p>
          <Button onClick={handleClaimDaily} disabled={!dailyReady || pending} className="w-full">
            {dailyReady ? (pending ? "Claiming…" : "Claim daily pack") : `Ready in ${countdown}`}
          </Button>
        </section>

        <section className="flex flex-col gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-sans text-sm font-bold text-[var(--text)]">Standard packs</h3>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
              {standardCost.toLocaleString()} coins each
            </span>
          </div>

          <fieldset className="flex gap-2 border-0 p-0">
            <legend className="sr-only">Pack quantity</legend>
            {QUANTITY_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                aria-pressed={qty === opt}
                onClick={() => setQty(opt)}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 rounded-md border px-2 py-2 transition-colors",
                  qty === opt
                    ? "border-[var(--tier-gold)] bg-[var(--bg)] text-[var(--text)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:border-[var(--text-2)]",
                )}
              >
                <span className="font-sans text-lg font-bold">× {opt}</span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--text-3)]">
                  {(opt * standardCost).toLocaleString()}
                </span>
              </button>
            ))}
          </fieldset>

          <Button
            onClick={handleBuyStandard}
            disabled={!canAffordStandard || pending}
            className="w-full"
          >
            {pending
              ? "Opening…"
              : `Buy ${qty} pack${qty === 1 ? "" : "s"} (${totalCost.toLocaleString()} coins)`}
          </Button>
          {!canAffordStandard && (
            <p className="text-center text-xs text-[var(--text-3)]">
              Need {shortBy.toLocaleString()} more coins.
            </p>
          )}
        </section>

        {/* Dialog primitive renders its own close (X) button in the
            top-right; no need for a custom one here. */}
      </DialogContent>
    </Dialog>
  );
}

function formatCountdown(secs: number): string {
  const total = Math.max(0, Math.floor(secs));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
