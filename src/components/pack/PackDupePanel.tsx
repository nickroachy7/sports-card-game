"use client";

import { Check } from "lucide-react";

import type { RevealedCard } from "@/app/actions/packs-reveal";
import { Card, type CardSize } from "@/components/card/Card";
import { Button } from "@/components/ui/button";
import { formatContract } from "@/lib/card/tiers";

/**
 * Polish spec §10 → §157 (Phase 44) — duplicate resolution panel.
 *
 * Shown after a dupe card flips face-up. Side-by-side split: the new
 * card (fresh Bronze, 5 plays) vs the user's existing instance of
 * that player (current tier / career FP / remaining plays). User
 * picks which to sell; the other stays in the collection.
 *
 * "Keep new" → sell the existing instance (user gets its tier's
 * quick-sell value; keeps the fresh contract).
 * "Keep existing" → sell the new instance (user gets Bronze quick-
 * sell; keeps the career FP progress on their existing card).
 *
 * Phase 44 added the `compact` variant so the panel can render
 * inline inside a single reveal-row slot (lineup-size cards, tight
 * spacing, buttons under each card instead of a header + split).
 */

type Props = {
  newCard: RevealedCard;
  existingCard: RevealedCard;
  pending: boolean;
  onKeepNew: () => void;
  onKeepExisting: () => void;
  /** When true, renders the lineup-size compact layout for inline
   *  dupe resolution (§157). Default is the larger modal layout. */
  compact?: boolean;
};

export function PackDupePanel({
  newCard,
  existingCard,
  pending,
  onKeepNew,
  onKeepExisting,
  compact = false,
}: Props) {
  if (compact) {
    return (
      <CompactDupePanel
        newCard={newCard}
        existingCard={existingCard}
        pending={pending}
        onKeepNew={onKeepNew}
        onKeepExisting={onKeepExisting}
      />
    );
  }
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
              {formatContract(existingCard.contractPlays, existingCard.tier)} ·{" "}
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

/**
 * Polish spec §157 (Phase 44). Compact in-row dupe panel — two
 * lineup-size cards side-by-side with small Keep New / Keep
 * Existing buttons underneath. Sized to sit in the reveal row
 * without displacing neighbors by more than ~2 card widths.
 */
function CompactDupePanel({
  newCard,
  existingCard,
  pending,
  onKeepNew,
  onKeepExisting,
}: Required<Omit<Props, "compact">>) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-[var(--tier-gold,#D4A647)] bg-[var(--surface-2)] p-2">
      <span className="font-mono text-[9px] text-[var(--tier-gold,#D4A647)] uppercase tracking-wider">
        Duplicate · keep one
      </span>
      <div className="flex items-start gap-2">
        <CompactDupeChoice
          size="lineup"
          label="Keep new"
          sublabel={`+${existingCard.quickSellValue}c`}
          card={newCard}
          onPick={onKeepNew}
          pending={pending}
        />
        <span className="self-center pt-16 font-mono text-[9px] text-[var(--text-3)] uppercase">
          vs
        </span>
        <CompactDupeChoice
          size="lineup"
          label="Keep existing"
          sublabel={`+${newCard.quickSellValue}c · ${Math.round(existingCard.careerFp)} FP`}
          card={existingCard}
          onPick={onKeepExisting}
          pending={pending}
        />
      </div>
    </div>
  );
}

function CompactDupeChoice({
  size,
  label,
  sublabel,
  card,
  onPick,
  pending,
}: {
  size: CardSize;
  label: string;
  sublabel: string;
  card: RevealedCard;
  onPick: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <Card card={card} size={size} />
      <Button
        size="sm"
        onClick={onPick}
        disabled={pending}
        className="h-6 w-[120px] px-1 font-sans text-[10px]"
      >
        <Check className="mr-0.5 size-3" aria-hidden="true" />
        {pending ? "Settling…" : label}
      </Button>
      <span className="max-w-[120px] text-center text-[9px] text-[var(--text-3)] leading-tight">
        {sublabel}
      </span>
    </div>
  );
}
