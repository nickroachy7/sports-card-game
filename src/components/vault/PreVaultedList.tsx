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

type Entry = {
  card: CardViewModel;
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
        {entries.map(({ card, refundCoins }) => (
          <div key={card.id} className="flex flex-col items-center gap-2">
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
        ))}
      </div>
    </article>
  );
}
