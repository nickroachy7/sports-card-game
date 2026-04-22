"use client";

import { FastForward, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { quickSellCard } from "@/app/actions/cards";
import type { OpenPackResult, PackCardResult } from "@/app/actions/packs";
import type { RevealedCard } from "@/app/actions/packs-reveal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { PackCardFlip } from "./PackCardFlip";
import { PackDupePanel } from "./PackDupePanel";
import { StarPullBurst } from "./StarPullBurst";

/**
 * Polish spec §10 — pack reveal orchestrator.
 *
 * Carousel of N face-down cards. Tap the active one → flip. If the
 * player's value tier is `'star'` / `'starter'`, the StarPullBurst
 * celebrates after the flip settles. If the pulled card is a
 * duplicate (existing instance known), the dupe panel takes over
 * until the user picks which instance to sell; then the reveal
 * advances to the next card.
 *
 * "Skip all" fast-forwards: all remaining cards flip without
 * celebrations; any unresolved dupes are auto-resolved by selling
 * the new card (matches the legacy auto-quick-sell-at-bronze
 * behavior for users who want to tear through packs).
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: OpenPackResult | null;
  /** New cards pulled this pack, in the same order as result.cardResults. */
  cards: RevealedCard[];
  /** Map of existing-instance cardId → RevealedCard, for dupes. */
  existingByCardId: Map<string, RevealedCard>;
  onClosed?: () => void;
};

type DupeResolution = "pending" | "kept_new" | "kept_existing";

export function PackOpenerModal({
  open,
  onOpenChange,
  result,
  cards,
  existingByCardId,
  onClosed,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [resolution, setResolution] = useState<DupeResolution[]>([]);
  const [celebratingIdx, setCelebratingIdx] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [skipping, setSkipping] = useState(false);

  // Reset on open.
  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    setFlipped(Array(cards.length).fill(false));
    setResolution(
      cards.map((_, i) => {
        const dupe = result?.cardResults?.[i]?.isDupe;
        return dupe ? "pending" : "kept_new";
      }),
    );
    setCelebratingIdx(null);
    setSkipping(false);
  }, [open, cards, result]);

  const active = cards[activeIndex] ?? null;
  const activeResult = result?.cardResults?.[activeIndex] ?? null;
  const activeDupeExisting =
    activeResult?.isDupe && activeResult.existingCardId
      ? (existingByCardId.get(activeResult.existingCardId) ?? null)
      : null;
  const activeDupePending = activeResult?.isDupe && resolution[activeIndex] === "pending";

  const allFlipped = cards.length === 0 || flipped.every(Boolean);
  const allResolved = resolution.every((r) => r !== "pending");
  const canDone = allFlipped && allResolved;

  function handleFlip(idx: number) {
    setFlipped((f) => f.map((v, i) => (i === idx ? true : v)));
  }

  function handleFlipComplete(idx: number) {
    const card = cards[idx];
    if (!card) return;
    const tier = card.playerValueTier;
    if (tier === "star" || tier === "starter") {
      setCelebratingIdx(idx);
      // Celebration auto-clears after its own animation window; we
      // let the user advance manually even during the burst.
      const hold = tier === "star" ? 900 : 450;
      window.setTimeout(() => {
        setCelebratingIdx((cur) => (cur === idx ? null : cur));
      }, hold);
    }
  }

  function advance() {
    setActiveIndex((i) => Math.min(i + 1, cards.length));
  }

  function handleKeepNew() {
    const pulled = result?.cardResults?.[activeIndex];
    if (!pulled?.existingCardId) return;
    startTransition(async () => {
      const res = await quickSellCard({ cardId: pulled.existingCardId as string });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setResolution((r) => r.map((v, i) => (i === activeIndex ? "kept_new" : v)));
      advance();
    });
  }

  function handleKeepExisting() {
    const pulled = result?.cardResults?.[activeIndex];
    if (!pulled) return;
    startTransition(async () => {
      const res = await quickSellCard({ cardId: pulled.cardId });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setResolution((r) => r.map((v, i) => (i === activeIndex ? "kept_existing" : v)));
      advance();
    });
  }

  async function handleSkipAll() {
    setSkipping(true);
    // Flip every remaining card.
    setFlipped((f) => f.map(() => true));
    setCelebratingIdx(null);
    // Auto-resolve any pending dupes by selling the new card (matches
    // legacy auto-quick-sell behavior — user can still sell an
    // existing card later from their collection).
    const pendingIdxs = resolution.map((r, i) => (r === "pending" ? i : -1)).filter((i) => i >= 0);
    for (const i of pendingIdxs) {
      const pulled = result?.cardResults?.[i];
      if (!pulled) continue;
      try {
        await quickSellCard({ cardId: pulled.cardId });
        setResolution((r) => r.map((v, k) => (k === i ? "kept_existing" : v)));
      } catch {
        /* swallow — user can resolve manually via collection */
      }
    }
    setActiveIndex(cards.length);
    setSkipping(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) onClosed?.();
  }

  const summary = useMemo(() => {
    if (!result) return null;
    const parts: string[] = [];
    if (cards.length > 0) parts.push(`${cards.length} card${cards.length === 1 ? "" : "s"}`);
    if (result.duplicateCount > 0) {
      parts.push(
        `${result.duplicateCount} dupe${result.duplicateCount === 1 ? "" : "s"} — choose which to keep`,
      );
    }
    if (result.tokenIds.length > 0) {
      parts.push(`${result.tokenIds.length} token${result.tokenIds.length === 1 ? "" : "s"}`);
    }
    return parts.join(" · ");
  }, [result, cards.length]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wider">Pack opened</DialogTitle>
          {summary && (
            <p className="text-sm text-[var(--text-2)]" id="pack-reveal-summary">
              {summary}
            </p>
          )}
        </DialogHeader>

        {cards.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-3)]">No cards to reveal.</div>
        ) : (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-6 py-4">
            {/* Dupe panel takes over when the active card is a dupe
                and the user hasn't picked yet. */}
            {activeDupePending && active && activeDupeExisting ? (
              <PackDupePanel
                newCard={active}
                existingCard={activeDupeExisting}
                pending={pending}
                onKeepNew={handleKeepNew}
                onKeepExisting={handleKeepExisting}
              />
            ) : active ? (
              <StarPullBurst active={celebratingIdx === activeIndex} tier={active.playerValueTier}>
                <PackCardFlip
                  card={active}
                  faceUp={flipped[activeIndex] ?? false}
                  onFlip={() => handleFlip(activeIndex)}
                  onComplete={() => handleFlipComplete(activeIndex)}
                />
              </StarPullBurst>
            ) : (
              <AllRevealedSummary
                cards={cards}
                cardResults={result?.cardResults ?? []}
                resolution={resolution}
              />
            )}

            {/* Carousel progress dots. */}
            <div className="flex items-center gap-2">
              {cards.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  disabled={!flipped[i] && i !== activeIndex}
                  aria-label={`Card ${i + 1}`}
                  className={cn(
                    "size-2 rounded-full transition-colors",
                    i === activeIndex
                      ? "bg-[var(--text)]"
                      : flipped[i]
                        ? "bg-[var(--text-2)]"
                        : "bg-[var(--border)]",
                    !flipped[i] && i !== activeIndex && "cursor-not-allowed",
                  )}
                />
              ))}
            </div>

            {/* Advance button — visible when the active card is
                flipped + not dupe-pending and there's a next card. */}
            {active &&
              flipped[activeIndex] &&
              !activeDupePending &&
              activeIndex < cards.length - 1 && (
                <Button variant="outline" onClick={advance}>
                  Next card ({activeIndex + 2} of {cards.length})
                </Button>
              )}
            {active &&
              flipped[activeIndex] &&
              !activeDupePending &&
              activeIndex === cards.length - 1 && (
                <Button variant="outline" onClick={() => setActiveIndex(cards.length)}>
                  Summary
                </Button>
              )}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="outline" onClick={handleSkipAll} disabled={canDone || skipping}>
            <FastForward className="mr-1 size-3.5" aria-hidden="true" />
            {skipping ? "Skipping…" : "Skip all"}
          </Button>
          <Button onClick={() => handleOpenChange(false)} disabled={!canDone}>
            <X className="mr-1 size-3.5" aria-hidden="true" />
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AllRevealedSummary({
  cards,
  cardResults,
  resolution,
}: {
  cards: RevealedCard[];
  cardResults: PackCardResult[];
  resolution: DupeResolution[];
}) {
  const keptNew = cards.filter((_, i) => !cardResults[i]?.isDupe || resolution[i] === "kept_new");
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="text-xs uppercase tracking-[0.25em] text-[var(--text-3)]">All revealed</span>
      <p className="text-center text-sm text-[var(--text-2)]">
        {keptNew.length} card{keptNew.length === 1 ? "" : "s"} added to your collection.
      </p>
    </div>
  );
}
