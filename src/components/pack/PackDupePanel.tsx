"use client";

import { Check } from "lucide-react";

import type { RevealedCard } from "@/app/actions/packs-reveal";
import { Card } from "@/components/card/Card";
import { Button } from "@/components/ui/button";

/**
 * Polish spec §10 — duplicate resolution panel.
 *
 * Shown after a dupe card flips face-up. Side-by-side split: the new
 * card (fresh Bronze, 15 plays) vs the user's existing instance of
 * that player (current tier / career FP / remaining plays). User
 * picks which to sell; the other stays in the collection. Both
 * options' CTAs show the coin value that would be credited.
 *
 * "Keep new" → sell the existing instance (user gets its tier's
 * quick-sell value; keeps the fresh contract).
 * "Keep existing" → sell the new instance (user gets Bronze quick-
 * sell; keeps the career FP progress on their existing card).
 */

type Props = {
  newCard: RevealedCard;
  existingCard: RevealedCard;
  pending: boolean;
  onKeepNew: () => void;
  onKeepExisting: () => void;
};

export function PackDupePanel({
  newCard,
  existingCard,
  pending,
  onKeepNew,
  onKeepExisting,
}: Props) {
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--tier-gold,#D4A647)]">
          Duplicate
        </span>
        <h3 className="text-center font-sans text-lg font-bold text-[var(--text)]">
          You already own {newCard.playerName}
        </h3>
        <p className="max-w-md text-center text-sm text-[var(--text-2)]">
          Keep one instance — the other sells at its tier's quick-sell value.
        </p>
      </div>

      <div className="flex items-start gap-6">
        <DupeChoice
          label="Keep new"
          sublabel={`Sells existing for +${existingCard.quickSellValue}c`}
          card={newCard}
          footer={<span>Fresh · 15 plays</span>}
          onPick={onKeepNew}
          pending={pending}
        />
        <div className="flex flex-col items-center justify-center pt-24 text-xs uppercase tracking-wider text-[var(--text-3)]">
          vs
        </div>
        <DupeChoice
          label="Keep existing"
          sublabel={`Sells new for +${newCard.quickSellValue}c`}
          card={existingCard}
          footer={
            <span>
              {existingCard.tier.charAt(0).toUpperCase() + existingCard.tier.slice(1)} ·{" "}
              {existingCard.contractPlays}/{existingCard.contractMax} plays ·{" "}
              {Math.round(existingCard.careerFp).toLocaleString()} FP
            </span>
          }
          onPick={onKeepExisting}
          pending={pending}
        />
      </div>
    </div>
  );
}

type DupeChoiceProps = {
  label: string;
  sublabel: string;
  card: RevealedCard;
  footer: React.ReactNode;
  onPick: () => void;
  pending: boolean;
};

function DupeChoice({ label, sublabel, card, footer, onPick, pending }: DupeChoiceProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Card card={card} size="medium" />
      <div className="flex w-[160px] flex-col items-center gap-0.5 text-center">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">{footer}</span>
      </div>
      <Button onClick={onPick} disabled={pending} className="w-[160px]">
        <Check className="mr-1 size-3.5" aria-hidden="true" />
        {pending ? "Settling…" : label}
      </Button>
      <span className="text-[11px] text-[var(--text-3)]">{sublabel}</span>
    </div>
  );
}
