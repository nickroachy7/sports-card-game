"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { type OpenPackResult, openPack } from "@/app/actions/packs";
import { fetchRevealedCards, type RevealedCard } from "@/app/actions/packs-reveal";
import { PackOpenerModal } from "@/components/pack/PackOpenerModal";
import { Button } from "@/components/ui/button";
import type { PackType } from "@/lib/contracts/cards";
import { cn } from "@/lib/utils";

export type PackConfig = {
  type: PackType;
  label: string;
  description: string;
  cost: number;
  size: number;
};

type Props = {
  coinBalance: number;
  dailyReadyAtMs: number | null;
  packs: PackConfig[];
};

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function ShopClient({ coinBalance, dailyReadyAtMs, packs }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingType, setPendingType] = useState<PackType | null>(null);
  const [result, setResult] = useState<OpenPackResult | null>(null);
  const [revealedCards, setRevealedCards] = useState<RevealedCard[]>([]);
  const [existingByCardId, setExistingByCardId] = useState<Map<string, RevealedCard>>(new Map());
  const [open, setOpen] = useState(false);

  const dailyReady = dailyReadyAtMs === null || dailyReadyAtMs <= Date.now();
  const dailyDelta =
    dailyReadyAtMs && dailyReadyAtMs > Date.now() ? dailyReadyAtMs - Date.now() : 0;

  function handleBuy(packType: PackType, cost: number) {
    if (packType !== "daily" && coinBalance < cost) {
      toast.error("Not enough coins.");
      return;
    }
    setPendingType(packType);
    startTransition(async () => {
      const r = await openPack({ packType });
      if (!r.ok) {
        toast.error(r.error.message);
        setPendingType(null);
        return;
      }
      // Fetch new cards + existing-instance dupe counterparts in one
      // call. Union of IDs is deduped server-side. Existing cards are
      // mapped by their own cardId so the modal can look them up per
      // dupe resolution.
      const existingIds = r.data.cardResults
        .map((c) => c.existingCardId)
        .filter((id): id is string => !!id);
      const allIds = Array.from(new Set([...r.data.cardIds, ...existingIds]));
      const all = await fetchRevealedCards(allIds);
      const newCardIds = new Set(r.data.cardIds);
      const newCards = r.data.cardIds
        .map((id) => all.find((c) => c.id === id))
        .filter((c): c is RevealedCard => !!c);
      const existingMap = new Map<string, RevealedCard>();
      for (const c of all) {
        if (!newCardIds.has(c.id)) existingMap.set(c.id, c);
      }
      setResult(r.data);
      setRevealedCards(newCards);
      setExistingByCardId(existingMap);
      setOpen(true);
      setPendingType(null);
    });
  }

  function handleClose() {
    setOpen(false);
    setResult(null);
    setRevealedCards([]);
    setExistingByCardId(new Map());
    router.refresh();
  }

  return (
    <>
      <section className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="flex items-baseline justify-between">
          <h1 className="font-sans text-2xl font-bold tracking-tight text-[var(--text)]">Shop</h1>
          <span className="font-mono text-sm text-[var(--text-2)]">
            {coinBalance.toLocaleString()} coins
          </span>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {packs.map((pack) => {
            const isDaily = pack.type === "daily";
            const affordable = isDaily ? dailyReady : coinBalance >= pack.cost;
            const disabled = pending || !affordable;
            const label = isDaily
              ? dailyReady
                ? "Claim"
                : `Ready in ${formatCountdown(dailyDelta)}`
              : `Buy · ${pack.cost.toLocaleString()} coins`;
            return (
              <article
                key={pack.type}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors",
                  !affordable && "opacity-60",
                )}
              >
                <div className="flex items-baseline justify-between">
                  <h2 className="font-sans text-lg font-bold uppercase tracking-wider text-[var(--text)]">
                    {pack.label}
                  </h2>
                  <span className="font-mono text-xs text-[var(--text-3)]">~{pack.size} cards</span>
                </div>
                <p className="text-sm text-[var(--text-2)]">{pack.description}</p>
                <Button
                  onClick={() => handleBuy(pack.type, pack.cost)}
                  disabled={disabled}
                  variant={isDaily ? "default" : "default"}
                  className="mt-auto"
                >
                  {pendingType === pack.type ? "Opening…" : label}
                </Button>
              </article>
            );
          })}
        </div>

        <p className="text-xs text-[var(--text-3)]">
          Pack weighting, pack sizes, and coin costs come from the active economy config. Duplicate
          pulls let you keep either instance at reveal — sell the new or the existing one. Tokens
          drop at per-pack rates.
        </p>
      </section>

      <PackOpenerModal
        open={open}
        onOpenChange={setOpen}
        result={result}
        cards={revealedCards}
        existingByCardId={existingByCardId}
        onClosed={handleClose}
      />
    </>
  );
}
