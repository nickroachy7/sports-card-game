"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { extendCardContract } from "@/app/actions/cards";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { type CardTier, TIER_LABEL } from "@/lib/contracts/cards";
import { cn } from "@/lib/utils";

type Props = {
  cardId: string;
  playerName: string;
  tier: CardTier;
  extensionCount: number;
  contractPlays: number;
  coinBalance: number;
  /** Per-play cost schedule from economy_config.extensionCostPerPlay. */
  extensionCostPerPlay: Record<CardTier, number>;
  /** Compounding escalator (1.5 = +50% each extension). */
  extensionEscalator: number;
  disabled?: boolean;
  onExtended?: (r: { newPlaysRemaining: number; coinCost: number; balanceAfter: number }) => void;
};

const OPTIONS = [5, 10, 15] as const;
type PlaysOption = (typeof OPTIONS)[number];

/** gameplay spec §5.4 — cost = base * escalator^extensionCount * plays, ceil. */
function computeCost(
  tier: CardTier,
  extensionCount: number,
  plays: number,
  base: Record<CardTier, number>,
  escalator: number,
): number {
  const perPlay = base[tier] * escalator ** extensionCount;
  return Math.ceil(perPlay * plays);
}

export function ExtendContractModal({
  cardId,
  playerName,
  tier,
  extensionCount,
  contractPlays,
  coinBalance,
  extensionCostPerPlay,
  extensionEscalator,
  disabled,
  onExtended,
}: Props) {
  const [open, setOpen] = useState(false);
  const [plays, setPlays] = useState<PlaysOption>(5);
  const [pending, startTransition] = useTransition();

  const costs = useMemo(
    () =>
      OPTIONS.map((p) => ({
        plays: p,
        cost: computeCost(tier, extensionCount, p, extensionCostPerPlay, extensionEscalator),
      })),
    [tier, extensionCount, extensionCostPerPlay, extensionEscalator],
  );

  const selectedCost = costs.find((c) => c.plays === plays)?.cost ?? 0;
  const canAfford = coinBalance >= selectedCost;
  const escalatorBadge =
    extensionCount > 0
      ? `+${Math.round((extensionEscalator - 1) * 100)}% · ext. #${extensionCount + 1}`
      : null;

  function handleExtend() {
    startTransition(async () => {
      const result = await extendCardContract({ cardId, plays });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Added ${plays} plays · ${result.data.coinCost.toLocaleString()} coins.`);
      onExtended?.(result.data);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" disabled={disabled} className="w-full">
          Extend contract
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend {playerName}</DialogTitle>
          <DialogDescription>
            {TIER_LABEL[tier]} tier · currently {contractPlays} plays remaining
            {escalatorBadge && (
              <>
                {" "}
                <span className="ml-1 rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-mono uppercase text-[var(--text-2)]">
                  {escalatorBadge}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {costs.map(({ plays: p, cost }) => {
            const affordable = coinBalance >= cost;
            const selected = plays === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPlays(p)}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-3 text-left transition-colors",
                  selected
                    ? "border-[var(--text)] bg-[var(--surface-2)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--text-2)]",
                  !affordable && "opacity-50",
                )}
                disabled={!affordable}
              >
                <span className="flex flex-col">
                  <span className="font-sans text-sm font-semibold text-[var(--text)]">
                    +{p} plays
                  </span>
                  <span className="text-xs text-[var(--text-3)]">
                    → {contractPlays + p} plays remaining
                  </span>
                </span>
                <span
                  className={cn(
                    "font-mono text-sm font-bold",
                    affordable ? "text-[var(--text)]" : "text-[var(--text-3)]",
                  )}
                >
                  {cost.toLocaleString()} coins
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleExtend} disabled={pending || !canAfford}>
            {pending
              ? "Extending…"
              : canAfford
                ? `Confirm · ${selectedCost.toLocaleString()} coins`
                : "Not enough coins"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
