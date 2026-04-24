"use client";

import { Flame } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { destroyVaultedCard } from "@/app/actions/vault";
import { Card, type CardViewModel } from "@/components/card/Card";
import { DissolveCard } from "@/components/card/DissolveCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cardVaultMultiplier, TIER_FRAME } from "@/lib/card/tiers";

type Entry = {
  card: CardViewModel;
  /** Phase 41 vault multiplier input — games this card was played in.
   *  Pre-vaulted cards are frozen so this value doesn't drift after
   *  freeze; the vault score is deterministic from here on. */
  playsUsed: number;
  refundCoins: number;
};

type Props = {
  entries: Entry[];
};

export function PreVaultedList({ entries }: Props) {
  const router = useRouter();
  const [dissolvingId, setDissolvingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDestroy(cardId: string) {
    startTransition(async () => {
      const res = await destroyVaultedCard({ cardId });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(`+${res.data.refundCoins} coins · card destroyed`);
      setDissolvingId(cardId);
    });
  }

  if (entries.length === 0) return null;

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-[var(--tier-gold)] bg-[var(--surface)] p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-[var(--tier-gold)]">
            In progress · this season
          </span>
          <h2 className="font-sans text-lg font-bold tracking-tight">Pre-vaulted cards</h2>
        </div>
        <span className="font-mono text-xs text-[var(--text-3)]">{entries.length}/10 cap</span>
      </header>

      <div className="flex flex-wrap gap-4">
        {entries.map(({ card, playsUsed, refundCoins }) => {
          const multiplier = cardVaultMultiplier(playsUsed);
          const vaultScore = Math.round(card.careerFp * multiplier);
          const accent = TIER_FRAME[card.tier].accent;
          return (
            <div key={card.id} className="flex flex-col items-center gap-2">
              {/* Polish spec §135 (Phase 41). Score-forward header: the
                  vault score is the card's lasting identity. Tall number
                  is the score; subscript explains the formula. */}
              <div
                className="flex w-full max-w-[140px] flex-col items-center gap-0 rounded border px-2 py-1"
                style={{ borderColor: accent }}
                title={`Played in ${playsUsed} ${playsUsed === 1 ? "game" : "games"} · ${Math.round(card.careerFp)} FP × ${multiplier.toFixed(1)}×`}
              >
                <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-3)]">
                  Vault score
                </span>
                <span
                  className="font-bold font-mono text-xl leading-none"
                  style={{ color: accent }}
                >
                  {vaultScore.toLocaleString()}
                </span>
                <span className="font-mono text-[9px] text-[var(--text-3)]">
                  {Math.round(card.careerFp)} FP × {multiplier.toFixed(1)}×
                </span>
              </div>
              <DissolveCard
                active={dissolvingId === card.id}
                onComplete={() => {
                  setDissolvingId(null);
                  router.refresh();
                }}
              >
                <Card card={card} size="small" />
              </DissolveCard>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    disabled={pending || dissolvingId !== null}
                  >
                    <Flame className="mr-1 size-3" aria-hidden="true" />
                    Destroy · {refundCoins}c
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Destroy {card.playerName}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Returns <strong>{refundCoins}</strong> coins. This can't be undone — the card
                      leaves your vault permanently.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDestroy(card.id)}>
                      Destroy
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          );
        })}
      </div>
    </article>
  );
}
