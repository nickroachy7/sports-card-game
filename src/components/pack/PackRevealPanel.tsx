"use client";

import { ArrowRight, Check } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { quickSellCard } from "@/app/actions/cards";
import type { OpenPackResult } from "@/app/actions/packs";
import type { RevealedCard } from "@/app/actions/packs-reveal";
import type { RevealedToken } from "@/app/actions/tokens";
import { Button } from "@/components/ui/button";
import type { PackType, TokenType } from "@/lib/contracts/cards";
import { cn } from "@/lib/utils";

import { PackCardFlip } from "./PackCardFlip";
import { PackDupePanel } from "./PackDupePanel";
import { PackTokenFlip } from "./PackTokenFlip";
import { StarPullBurst } from "./StarPullBurst";

/**
 * Polish spec §147–§151 (Phase 43) → §154–§158 (Phase 44) — in-place
 * pack reveal.
 *
 * Phase 43 shape: peel stack at top, revealed row below. Phase 44
 * merges both into a single horizontal flex-wrap row of lineup-size
 * cards (§154, §155). Any card can be flipped in any order (§156);
 * dupe resolution happens inline — the dupe slot expands to show a
 * side-by-side new/existing comparison right where the card sits,
 * no overlay (§157). Per-card Sell / Vault gate unchanged — all
 * cards flipped + all dupes resolved is the unlock (§158).
 *
 * Sequential multi-pack flow preserved from Phase 43: each pack gets
 * its own peel/flip arc; Next Pack / Done button at the bottom.
 */

export type PerPackPayload = {
  /** Per-pack result payload. cardIds scoped to this pack only. */
  result: OpenPackResult;
  /** Cards pulled this pack, in cardResults order. */
  cards: RevealedCard[];
  /** Dupe lookup map: existingCardId → RevealedCard. Only entries for
   *  dupes in this pack. */
  existingByCardId: Map<string, RevealedCard>;
  /**
   * Polish spec §198 (Phase 49 Wave 2). Tokens granted by this pack.
   * Includes both active rolls (`isPending=false`) and overflow rolls
   * (`isPending=true`). Each renders a flip slot at the end of the
   * reveal row; pending ones get a "Will Resolve" tag and feed into
   * the post-reveal TokenOverflowResolveModal.
   */
  tokens: RevealedToken[];
};

type DupeResolution = "pending" | "kept_new" | "kept_existing";
type PerCardAction = "quickSold" | null;

type Props = {
  packs: PerPackPayload[];
  currentPackIndex: number;
  packType: PackType;
  onAdvancePack: () => void;
  onDone: () => void;
};

export function PackRevealPanel({
  packs,
  currentPackIndex,
  packType,
  onAdvancePack,
  onDone,
}: Props) {
  const pack = packs[currentPackIndex] ?? null;
  const cards = pack?.cards ?? [];
  const result = pack?.result ?? null;
  const existingByCardId = pack?.existingByCardId ?? new Map<string, RevealedCard>();
  // Polish spec §198 — tokens render a flip slot at the end of the
  // reveal row (after card slots). Empty array if pack rolled none.
  const tokens = pack?.tokens ?? [];

  const totalPacks = packs.length;
  const isFinalPack = currentPackIndex >= totalPacks - 1;

  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [tokenFlipped, setTokenFlipped] = useState<boolean[]>([]);
  const [resolution, setResolution] = useState<DupeResolution[]>([]);
  const [perCardAction, setPerCardAction] = useState<PerCardAction[]>([]);
  const [celebratingIdx, setCelebratingIdx] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // Reset per-pack state whenever the pack pointer changes (§149).
  // `cards` + `result` are derived from `packs[currentPackIndex]`, so
  // their pointer identity flips exactly when the active pack changes.
  useEffect(() => {
    setFlipped(Array(cards.length).fill(false));
    setTokenFlipped(Array(tokens.length).fill(false));
    setResolution(
      cards.map((_, i) => {
        const dupe = result?.cardResults?.[i]?.isDupe;
        return dupe ? "pending" : "kept_new";
      }),
    );
    setPerCardAction(Array(cards.length).fill(null));
    setCelebratingIdx(null);
  }, [cards, result, tokens.length]);

  const flippedCount = flipped.filter(Boolean).length;
  const cardsRemaining = cards.length - flippedCount;
  const allCardsFlipped = flippedCount === cards.length && cards.length > 0;
  const allTokensFlipped = tokenFlipped.every(Boolean) || tokens.length === 0;
  const allFlipped = allCardsFlipped && allTokensFlipped;
  const allResolved = resolution.every((r) => r !== "pending");
  const packComplete = allFlipped && allResolved;
  const hasFaceDown = (cards.length > 0 && !allCardsFlipped) || !allTokensFlipped;

  function handleFlip(idx: number) {
    // Any face-down card is a valid click target (§156).
    if (flipped[idx]) return;
    setFlipped((f) => f.map((v, i) => (i === idx ? true : v)));
  }

  // §198 — token slots are independent of cards but use the same
  // bulk-flip path on Reveal All.
  function handleTokenFlip(idx: number) {
    if (tokenFlipped[idx]) return;
    setTokenFlipped((f) => f.map((v, i) => (i === idx ? true : v)));
  }

  function handleRevealAll() {
    // Bulk-flip every remaining face-down card AND token slot. Each
    // child sees faceUp=true on its next render and runs its own
    // animation independently.
    setFlipped(Array(cards.length).fill(true));
    setTokenFlipped(Array(tokens.length).fill(true));
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
    // Dupes don't need an active-idx pointer anymore — the card's
    // own resolution state ("pending") is the render signal. This
    // lets multiple dupes resolve in parallel after Reveal All.
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
    });
  }

  function handlePerCardQuickSell(idx: number) {
    const card = cards[idx];
    if (!card) return;
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

  function handleFooterAction() {
    // Three modes depending on pack state:
    //   1. Cards still face-down → Reveal all (§160 was "out of
    //      scope"; user feedback flipped it — testers read the copy
    //      as a functional button and clicked it).
    //   2. All flipped but dupes pending → disabled, waits for dupes.
    //   3. Pack complete → advance to next pack or done.
    if (hasFaceDown) {
      handleRevealAll();
      return;
    }
    if (!packComplete) return;
    if (isFinalPack) onDone();
    else onAdvancePack();
  }

  const footerDisabled = allFlipped && !allResolved; // waiting on dupes

  const subtitle = useMemo(() => {
    if (!pack) return "";
    if (!allCardsFlipped) {
      return `Tap any card to reveal · ${cardsRemaining} of ${cards.length} left`;
    }
    if (!allTokensFlipped) {
      const remaining = tokens.length - tokenFlipped.filter(Boolean).length;
      return `Tap to reveal bonus token${remaining === 1 ? "" : "s"}`;
    }
    if (!allResolved) return "Resolve the dupe to continue";
    if (isFinalPack) return "All packs opened — back to lineup?";
    return "Pack complete · next up?";
  }, [
    pack,
    allCardsFlipped,
    allTokensFlipped,
    allResolved,
    isFinalPack,
    cards.length,
    cardsRemaining,
    tokens.length,
    tokenFlipped,
  ]);

  if (!pack) {
    return (
      <div className="flex h-full items-center justify-center py-12 text-sm text-[var(--text-3)]">
        No packs to reveal.
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 px-6 py-5">
      <RevealHeader
        currentPackIndex={currentPackIndex}
        totalPacks={totalPacks}
        packType={packType}
        packComplete={packComplete}
        subtitle={subtitle}
      />

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-6">
        {cards.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">No cards in this pack.</p>
        ) : (
          <div className="flex flex-wrap items-start justify-center gap-x-3 gap-y-5">
            {cards.map((card, i) => {
              const isFlipped = flipped[i] ?? false;
              const res = resolution[i] ?? "kept_new";
              const action = perCardAction[i];
              const isDupe = result?.cardResults?.[i]?.isDupe ?? false;
              // Dupe card flipped + still pending → render the compact
              // comparison panel in place of the card slot. Per-card
              // resolution state (no global activeDupeIdx) means
              // multiple dupes can resolve in parallel after Reveal
              // All bulk-flips the row.
              const showingDupePanel = isFlipped && isDupe && res === "pending";
              if (showingDupePanel) {
                const pulled = result?.cardResults?.[i];
                const existingId = pulled?.existingCardId ?? null;
                const existing = existingId ? (existingByCardId.get(existingId) ?? null) : null;
                if (existing) {
                  return (
                    <PackDupePanel
                      key={card.id}
                      compact
                      newCard={card}
                      existingCard={existing}
                      pending={pending}
                      onKeepNew={() => handleKeepNew(i)}
                      onKeepExisting={() => handleKeepExisting(i)}
                    />
                  );
                }
              }

              // After kept_existing, the "new" card was sold — dim its
              // slot to signal absence (§157 exit state).
              const dimmedForKeptExisting = isDupe && res === "kept_existing";

              return (
                <RevealCardSlot
                  key={card.id}
                  card={card}
                  isFlipped={isFlipped}
                  celebrating={celebratingIdx === i}
                  action={action}
                  dimmed={dimmedForKeptExisting || action === "quickSold"}
                  actionsEnabled={packComplete}
                  pending={pending}
                  onFlip={() => handleFlip(i)}
                  onFlipComplete={() => handleFlipComplete(i)}
                  onQuickSell={() => handlePerCardQuickSell(i)}
                />
              );
            })}
          </div>
        )}

        {/* Polish spec §198 (Phase 49 Wave 2). Token slots row.
            Renders only when this pack rolled at least one token
            (active or pending). Same flip pattern as cards, but
            chip-sized. Pending tokens show a "Will Resolve" tag
            and feed into TokenOverflowResolveModal post-reveal. */}
        {tokens.length > 0 && (
          <div className="flex flex-col items-center gap-2 border-[var(--border)] border-t pt-4">
            <span className="font-mono text-[10px] text-[var(--text-3)] uppercase tracking-wider">
              Bonus tokens · {tokens.length}
            </span>
            <div className="flex flex-wrap items-start justify-center gap-x-4 gap-y-3">
              {tokens.map((tk, i) => (
                <PackTokenFlip
                  key={tk.id}
                  tokenType={tk.tokenType as TokenType}
                  bonusFp={tk.bonusFp}
                  isPending={tk.isPending}
                  faceUp={tokenFlipped[i] ?? false}
                  onFlip={() => handleTokenFlip(i)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="flex justify-end">
        <Button
          size="lg"
          disabled={footerDisabled}
          onClick={handleFooterAction}
          className="min-w-[180px]"
        >
          {hasFaceDown ? (
            "Reveal all cards"
          ) : footerDisabled ? (
            "Resolve dupe to continue"
          ) : isFinalPack ? (
            <>
              <Check className="mr-1 size-4" aria-hidden="true" />
              Done · back to lineup
            </>
          ) : (
            <>
              Next pack ({currentPackIndex + 2} of {totalPacks})
              <ArrowRight className="ml-1 size-4" aria-hidden="true" />
            </>
          )}
        </Button>
      </footer>
    </div>
  );
}

/**
 * Polish spec §150 (Phase 43). Progress header at the top of the
 * panel. Segmented bar on the right: one segment per pack. Active
 * segment pulses; completed segments light; pending segments are
 * muted. Single-pack reveals degrade to a simpler "PACK · TYPE"
 * label (no counter, empty progress column).
 */
function RevealHeader({
  currentPackIndex,
  totalPacks,
  packType,
  packComplete,
  subtitle,
}: {
  currentPackIndex: number;
  totalPacks: number;
  packType: PackType;
  packComplete: boolean;
  subtitle: string;
}) {
  const isMultiPack = totalPacks > 1;
  return (
    <header className="flex items-center justify-between gap-4 border-[var(--border)] border-b pb-3">
      <div className="flex flex-col">
        <h1 className="font-bold font-mono text-[var(--text)] text-xs uppercase tracking-wider">
          {isMultiPack ? (
            <>
              Pack {currentPackIndex + 1} of {totalPacks}
              <span className="ml-2 text-[var(--text-3)]">· {packType}</span>
            </>
          ) : (
            <>{packType} pack</>
          )}
        </h1>
        <p className="mt-0.5 text-[var(--text-3)] text-xs">{subtitle}</p>
      </div>
      {isMultiPack && (
        <ol aria-hidden="true" className="flex items-center gap-1">
          {Array.from({ length: totalPacks }, (_, i) => i).map((i) => {
            const state =
              i < currentPackIndex
                ? "done"
                : i === currentPackIndex
                  ? packComplete
                    ? "done"
                    : "active"
                  : "pending";
            return (
              <li
                key={`progress-${i}`}
                className={cn(
                  "h-1.5 w-6 rounded-full transition-colors",
                  state === "done" && "bg-[var(--tier-gold)]",
                  state === "active" && "animate-pulse bg-[var(--tier-gold)]/60",
                  state === "pending" && "bg-[var(--border)]",
                )}
              />
            );
          })}
        </ol>
      )}
    </header>
  );
}

/**
 * Polish spec §154 (Phase 44). Single reveal card slot — face-down
 * click target, flip-to-reveal, action buttons below once the
 * pack-complete gate unlocks. Self-contained so the row can flex-wrap
 * cleanly.
 */
function RevealCardSlot({
  card,
  isFlipped,
  celebrating,
  action,
  dimmed,
  actionsEnabled,
  pending,
  onFlip,
  onFlipComplete,
  onQuickSell,
}: {
  card: RevealedCard;
  isFlipped: boolean;
  celebrating: boolean;
  action: PerCardAction;
  dimmed: boolean;
  actionsEnabled: boolean;
  pending: boolean;
  onFlip: () => void;
  onFlipComplete: () => void;
  onQuickSell: () => void;
}) {
  return (
    <div
      className={cn(
        "flex w-[120px] flex-col items-center gap-2 transition-opacity",
        dimmed && "opacity-40",
      )}
    >
      <div className="relative">
        <StarPullBurst active={celebrating} tier={card.playerValueTier} sizeScale={0.75}>
          <PackCardFlip
            card={card}
            faceUp={isFlipped}
            onFlip={onFlip}
            onComplete={onFlipComplete}
            size="lineup"
          />
        </StarPullBurst>
        {action === "quickSold" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[8px] bg-[var(--bg)]/75">
            <span className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-2)] uppercase tracking-wider">
              <Check className="size-2.5" aria-hidden="true" />
              Sold
            </span>
          </div>
        )}
      </div>
      {/* User feedback on P44 live: dropped the Vault button from the
          reveal. Vaulting a fresh pull gives plays_used=0 → vault
          multiplier=0 → score=0 per the §133 curve, so it was a trap
          action. Only Sell remains.
          §158: button only renders once the pack-complete gate unlocks
          (all cards flipped + dupes resolved). */}
      {isFlipped && actionsEnabled && (
        <div className="flex w-full flex-col items-stretch gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onQuickSell}
            disabled={pending || action !== null || dimmed}
            className="h-6 px-1 text-[10px]"
          >
            Sell ({card.quickSellValue.toLocaleString()})
          </Button>
        </div>
      )}
    </div>
  );
}
