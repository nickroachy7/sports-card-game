"use client";

import { useEffect, useMemo, useState } from "react";
import type { OpenPackResult } from "@/app/actions/packs";
import { Card, type CardViewModel } from "@/components/card/Card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: OpenPackResult | null;
  /** Fully-loaded card view models for the cards granted. Same order as result.cardIds. */
  cards: CardViewModel[];
  onClosed?: () => void;
};

/**
 * UI/UX spec §6.2 — sequential reveal.
 * M5 ships: fade-in reveal per card, tier flash color, dupe quick-sell
 * tally, token drop count. Star celebration + full-screen Diamond
 * shimmer land in Phase 6 polish.
 */
export function PackOpenerModal({ open, onOpenChange, result, cards, onClosed }: Props) {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!open) return;
    setRevealed(0);
    if (cards.length === 0) {
      setRevealed(0);
      return;
    }
    const interval = setInterval(() => {
      setRevealed((n) => {
        if (n >= cards.length) {
          clearInterval(interval);
          return n;
        }
        return n + 1;
      });
    }, 550);
    return () => clearInterval(interval);
  }, [open, cards.length]);

  const allRevealed = cards.length === 0 || revealed >= cards.length;
  const skipDisabled = allRevealed;

  const summary = useMemo(() => {
    if (!result) return null;
    const parts: string[] = [];
    if (cards.length > 0) parts.push(`${cards.length} card${cards.length === 1 ? "" : "s"}`);
    if (result.duplicateCount > 0) {
      parts.push(
        `${result.duplicateCount} dupe${result.duplicateCount === 1 ? "" : "s"} → ${result.coinsFromDupes.toLocaleString()} coins`,
      );
    }
    if (result.tokenIds.length > 0) {
      parts.push(`${result.tokenIds.length} token${result.tokenIds.length === 1 ? "" : "s"}`);
    }
    return parts.join(" · ");
  }, [result, cards.length]);

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) onClosed?.();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wider">Pack opened</DialogTitle>
          {summary && <DialogDescription>{summary}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-wrap justify-center gap-4 py-4">
          {cards.length === 0 ? (
            <p className="py-8 text-sm text-[var(--text-3)]">
              No new cards — all {result?.duplicateCount ?? 0} pulls were duplicates and were
              auto-quick-sold for {result?.coinsFromDupes?.toLocaleString() ?? 0} coins.
            </p>
          ) : (
            cards.map((card, i) => (
              <div
                key={card.id}
                className={cn(
                  "transition-all duration-500",
                  i < revealed
                    ? "translate-y-0 scale-100 opacity-100"
                    : "translate-y-4 scale-95 opacity-0",
                )}
                aria-hidden={i >= revealed}
              >
                <Card card={card} size="medium" />
              </div>
            ))
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button
            variant="outline"
            onClick={() => setRevealed(cards.length)}
            disabled={skipDisabled}
          >
            {skipDisabled ? "All revealed" : "Reveal all"}
          </Button>
          <Button onClick={() => handleOpenChange(false)} disabled={!allRevealed}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
