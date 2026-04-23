"use client";

import { Archive, Check } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { quickSellCard } from "@/app/actions/cards";
import type { OpenPackResult } from "@/app/actions/packs";
import type { RevealedCard } from "@/app/actions/packs-reveal";
import { vaultCardMidseason } from "@/app/actions/vault";
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
 * Polish spec §111 (Phase 36) — pack reveal redesign.
 *
 * The old carousel showed one card at a time with progress dots and
 * a Next button. The new layout stacks every face-down card in the
 * center, tap the top to peel, each peeled card flips + settles in
 * a revealed row below. Once the stack is empty and all dupes are
 * resolved, per-card Quick-sell / Add-to-vault buttons unlock + the
 * Done button becomes enabled.
 *
 * Accepts the SAME input shape as the prior version; LineupView
 * flattens batch openings (§109) into a single synthetic
 * `OpenPackResult` so the component stays oblivious to whether this
 * was one pack or ten.
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: OpenPackResult | null;
  /** New cards pulled this reveal, in the same order as result.cardResults. */
  cards: RevealedCard[];
  /** Map of existing-instance cardId → RevealedCard, for dupe resolution. */
  existingByCardId: Map<string, RevealedCard>;
  onClosed?: () => void;
};

type DupeResolution = "pending" | "kept_new" | "kept_existing";
type PerCardAction = "quickSold" | "vaulted" | null;

export function PackOpenerModal({
  open,
  onOpenChange,
  result,
  cards,
  existingByCardId,
  onClosed,
}: Props) {
  // Peel order: cards[0] is on top of the stack, last index is at the
  // bottom. Peeling advances `peelIndex`. Flipped cards persist in
  // the revealed row.
  const [peelIndex, setPeelIndex] = useState(0);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [resolution, setResolution] = useState<DupeResolution[]>([]);
  const [perCardAction, setPerCardAction] = useState<PerCardAction[]>([]);
  const [celebratingIdx, setCelebratingIdx] = useState<number | null>(null);
  const [activeDupeIdx, setActiveDupeIdx] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // Reset on open.
  useEffect(() => {
    if (!open) return;
    setPeelIndex(0);
    setFlipped(Array(cards.length).fill(false));
    setResolution(
      cards.map((_, i) => {
        const dupe = result?.cardResults?.[i]?.isDupe;
        return dupe ? "pending" : "kept_new";
      }),
    );
    setPerCardAction(Array(cards.length).fill(null));
    setCelebratingIdx(null);
    setActiveDupeIdx(null);
  }, [open, cards, result]);

  // When the ACTIVELY peeling card is a dupe, its flip handler queues
  // `activeDupeIdx` so the dupe panel modal shows up centered over
  // the deck. Resolving advances peelIndex.
  const stackRemaining = Math.max(0, cards.length - peelIndex);
  const allPeeled = peelIndex >= cards.length;
  const allResolved = resolution.every((r) => r !== "pending");
  const canDone = allPeeled && allResolved;

  function handlePeel() {
    if (peelIndex >= cards.length) return;
    const idx = peelIndex;
    setFlipped((f) => f.map((v, i) => (i === idx ? true : v)));
  }

  function handleFlipComplete(idx: number) {
    const card = cards[idx];
    if (!card) return;
    const tier = card.playerValueTier;
    if (tier === "star" || tier === "starter") {
      setCelebratingIdx(idx);
      const hold = tier === "star" ? 900 : 450;
      window.setTimeout(() => {
        setCelebratingIdx((cur) => (cur === idx ? null : cur));
      }, hold);
    }
    // Advance peel index. If this card was a dupe, park the dupe panel
    // as a modal-within-modal and wait for resolution before
    // advancing to the next peel.
    const isDupe = result?.cardResults?.[idx]?.isDupe ?? false;
    if (isDupe) {
      setActiveDupeIdx(idx);
    }
    setPeelIndex((p) => Math.max(p, idx + 1));
  }

  function handleKeepNew(idx: number) {
    const pulled = result?.cardResults?.[idx];
    if (!pulled?.existingCardId) return;
    startTransition(async () => {
      const res = await quickSellCard({ cardId: pulled.existingCardId as string });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setResolution((r) => r.map((v, i) => (i === idx ? "kept_new" : v)));
      setActiveDupeIdx(null);
    });
  }

  function handleKeepExisting(idx: number) {
    const pulled = result?.cardResults?.[idx];
    if (!pulled) return;
    startTransition(async () => {
      const res = await quickSellCard({ cardId: pulled.cardId });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setResolution((r) => r.map((v, i) => (i === idx ? "kept_existing" : v)));
      setActiveDupeIdx(null);
    });
  }

  function handlePerCardQuickSell(idx: number) {
    const card = cards[idx];
    if (!card) return;
    // Only the new-instance side of a dupe can be quick-sold here —
    // if the user kept-existing, the new instance was already sold,
    // so hide the button.
    const pulled = result?.cardResults?.[idx];
    if (pulled?.isDupe && resolution[idx] === "kept_existing") return;
    startTransition(async () => {
      const res = await quickSellCard({ cardId: card.id });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(`Sold ${card.playerName} for ${res.data.coinsEarned} coins`);
      setPerCardAction((a) => a.map((v, i) => (i === idx ? "quickSold" : v)));
    });
  }

  function handlePerCardVault(idx: number) {
    const card = cards[idx];
    if (!card) return;
    if (card.isExpired || card.hasAppliedToken) {
      toast.error(
        card.isExpired
          ? "Expired cards can't be vaulted."
          : "Remove the applied token before vaulting.",
      );
      return;
    }
    startTransition(async () => {
      const res = await vaultCardMidseason({ cardId: card.id });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(`Vaulted ${card.playerName}`);
      setPerCardAction((a) => a.map((v, i) => (i === idx ? "vaulted" : v)));
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !canDone) return; // force Done button
    onOpenChange(nextOpen);
    if (!nextOpen) onClosed?.();
  }

  const summary = useMemo(() => {
    if (!result) return null;
    const parts: string[] = [];
    parts.push(`${cards.length} card${cards.length === 1 ? "" : "s"}`);
    if (result.duplicateCount > 0) {
      parts.push(`${result.duplicateCount} dupe${result.duplicateCount === 1 ? "" : "s"}`);
    }
    if (result.tokenIds.length > 0) {
      parts.push(`${result.tokenIds.length} token${result.tokenIds.length === 1 ? "" : "s"}`);
    }
    return parts.join(" · ");
  }, [result, cards.length]);

  // Dupe panel payload (only when the orchestrator has parked us).
  const dupePayload = useMemo(() => {
    if (activeDupeIdx === null) return null;
    const newCard = cards[activeDupeIdx] ?? null;
    const pulled = result?.cardResults?.[activeDupeIdx];
    const existingId = pulled?.existingCardId ?? null;
    const existing = existingId ? (existingByCardId.get(existingId) ?? null) : null;
    if (!newCard || !existing) return null;
    return { idx: activeDupeIdx, newCard, existing };
  }, [activeDupeIdx, cards, result, existingByCardId]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* sm:max-w-5xl force-overrides the Dialog primitive's
          sm:max-w-lg default so the reveal has room for a row of
          revealed cards. Close button hidden until canDone so the
          user can't bail mid-reveal. */}
      <DialogContent className="sm:max-w-5xl" showCloseButton={canDone}>
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wider">Pack opened</DialogTitle>
          {summary && <p className="text-sm text-[var(--text-2)]">{summary}</p>}
        </DialogHeader>

        {cards.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-3)]">No cards to reveal.</div>
        ) : (
          <div className="relative flex flex-col items-center gap-5 py-2">
            {/* Stack — disappears once the last card is peeled. */}
            {!allPeeled && (
              <div className="flex flex-col items-center gap-2">
                <StackZone
                  activeIdx={peelIndex}
                  remaining={stackRemaining}
                  activeCard={cards[peelIndex] ?? null}
                  activeFlipped={flipped[peelIndex] ?? false}
                  onPeel={handlePeel}
                  onFlipComplete={handleFlipComplete}
                  celebrating={celebratingIdx === peelIndex}
                />
                <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
                  {stackRemaining} remaining · Tap the top card
                </p>
              </div>
            )}

            {/* Revealed row — fills in as cards are peeled. Only
                renders revealed cards (no ghost placeholders) so the
                row visually grows as you peel. */}
            <RevealedRow
              cards={cards}
              cardResults={result?.cardResults ?? []}
              flipped={flipped}
              resolution={resolution}
              perCardAction={perCardAction}
              actionsEnabled={canDone}
              pending={pending}
              onQuickSell={handlePerCardQuickSell}
              onVault={handlePerCardVault}
            />

            {/* Dupe resolution modal-within-modal. Parks the peel flow
                until the user decides; then advances. */}
            {dupePayload && (
              <DupeResolutionOverlay
                newCard={dupePayload.newCard}
                existingCard={dupePayload.existing}
                pending={pending}
                onKeepNew={() => handleKeepNew(dupePayload.idx)}
                onKeepExisting={() => handleKeepExisting(dupePayload.idx)}
              />
            )}
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} disabled={!canDone} className="w-full">
            {canDone
              ? "Done"
              : allPeeled
                ? "Resolve dupes to continue"
                : "Reveal all cards to continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * StackZone — z-stacked face-down cards with a small 2px offset per
 * card for depth. Only the top card receives a flip click; after
 * flipping, its onComplete fires the advance in the parent.
 *
 * The revealed card briefly stays visible here during its flip
 * animation before the parent's `peelIndex` advance hides the stack
 * card (letting the RevealedRow take over).
 */
function StackZone({
  activeIdx,
  remaining,
  activeCard,
  activeFlipped,
  onPeel,
  onFlipComplete,
  celebrating,
}: {
  activeIdx: number;
  remaining: number;
  activeCard: RevealedCard | null;
  activeFlipped: boolean;
  onPeel: () => void;
  onFlipComplete: (idx: number) => void;
  celebrating: boolean;
}) {
  // Cap the visible depth at 6 layers for readability; beyond that the
  // offsets compound into nonsense.
  const visibleLayers = Math.min(remaining - 1, 6);
  return (
    <div className="relative flex h-[260px] w-[200px] items-center justify-center">
      {/* Depth layers under the top card. Keyed by layer offset —
          decorative, never reorders, so index-as-key is fine here. */}
      {Array.from({ length: visibleLayers }, (_, i) => i).map((i) => (
        <div
          key={`depth-layer-${i}`}
          aria-hidden="true"
          className="absolute rounded-[10px] border border-[var(--border)]"
          style={{
            width: 160,
            height: 224,
            transform: `translate(${(i + 1) * 2}px, ${(i + 1) * 2}px)`,
            background: "linear-gradient(135deg, #8A6422 0%, #5A4315 50%, #8A6422 100%)",
          }}
        />
      ))}
      {/* Top card — the active peel target. */}
      {activeCard && (
        <div className="relative">
          <StarPullBurst active={celebrating} tier={activeCard.playerValueTier}>
            <PackCardFlip
              card={activeCard}
              faceUp={activeFlipped}
              onFlip={onPeel}
              onComplete={() => onFlipComplete(activeIdx)}
            />
          </StarPullBurst>
        </div>
      )}
    </div>
  );
}

/**
 * RevealedRow — flex-wrap grid that fills in as cards are peeled.
 * Only renders revealed cards (no ghost placeholders) so the row
 * visually grows outward from the center as each card settles.
 *
 * Per-card Quick-sell / Vault buttons stay disabled until the whole
 * stack is peeled AND all dupes are resolved (`actionsEnabled`).
 * Before then the buttons show as placeholders so the layout
 * doesn't shift once they become available.
 */
function RevealedRow({
  cards,
  cardResults,
  flipped,
  resolution,
  perCardAction,
  actionsEnabled,
  pending,
  onQuickSell,
  onVault,
}: {
  cards: RevealedCard[];
  cardResults: OpenPackResult["cardResults"];
  flipped: boolean[];
  resolution: DupeResolution[];
  perCardAction: PerCardAction[];
  actionsEnabled: boolean;
  pending: boolean;
  onQuickSell: (idx: number) => void;
  onVault: (idx: number) => void;
}) {
  const anyRevealed = flipped.some(Boolean);
  if (!anyRevealed) return null;
  return (
    <div className="flex w-full flex-wrap items-start justify-center gap-x-3 gap-y-4">
      {cards.map((card, i) => {
        const isRevealed = flipped[i] ?? false;
        if (!isRevealed) return null;
        const action = perCardAction[i];
        const dupeRes = cardResults[i]?.isDupe ? resolution[i] : null;
        const hidden = dupeRes === "kept_existing" || action === "quickSold";
        return (
          <div
            key={card.id}
            className={cn(
              "flex w-[160px] flex-col items-center gap-2 transition-opacity",
              hidden && "opacity-40",
            )}
          >
            <div className="relative">
              <PackCardFlip card={card} faceUp={true} onFlip={() => {}} />
              {action === "vaulted" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[10px] bg-[var(--bg)]/75">
                  <span className="flex items-center gap-1 rounded-full border border-[var(--tier-gold)] bg-[var(--surface-2)] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--tier-gold)]">
                    <Archive className="size-3" aria-hidden="true" />
                    Vaulted
                  </span>
                </div>
              )}
              {action === "quickSold" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[10px] bg-[var(--bg)]/75">
                  <span className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-2)]">
                    <Check className="size-3" aria-hidden="true" />
                    Sold
                  </span>
                </div>
              )}
            </div>
            <div className="flex w-full flex-col items-stretch gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onQuickSell(i)}
                disabled={!actionsEnabled || pending || action !== null || hidden}
                className="h-7 px-2 text-[11px]"
              >
                Sell ({card.quickSellValue.toLocaleString()})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onVault(i)}
                disabled={
                  !actionsEnabled ||
                  pending ||
                  action !== null ||
                  hidden ||
                  card.isExpired ||
                  card.hasAppliedToken
                }
                className="h-7 px-2 text-[11px]"
              >
                <Archive className="mr-1 size-3" aria-hidden="true" />
                Vault
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * DupeResolutionOverlay — centered panel that pauses the reveal flow
 * whenever a freshly-peeled card is a duplicate. Uses the existing
 * PackDupePanel side-by-side comparison; wraps it in a scrim so the
 * row underneath stays visible but non-interactive.
 */
function DupeResolutionOverlay({
  newCard,
  existingCard,
  pending,
  onKeepNew,
  onKeepExisting,
}: {
  newCard: RevealedCard;
  existingCard: RevealedCard;
  pending: boolean;
  onKeepNew: () => void;
  onKeepExisting: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-md bg-[var(--bg)]/80 p-4 backdrop-blur-sm">
      <PackDupePanel
        newCard={newCard}
        existingCard={existingCard}
        pending={pending}
        onKeepNew={onKeepNew}
        onKeepExisting={onKeepExisting}
      />
    </div>
  );
}
