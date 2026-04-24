"use client";

import { Archive, ArrowRight, Check } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { quickSellCard } from "@/app/actions/cards";
import type { OpenPackResult } from "@/app/actions/packs";
import type { RevealedCard } from "@/app/actions/packs-reveal";
import { vaultCardMidseason } from "@/app/actions/vault";
import { Button } from "@/components/ui/button";
import type { PackType } from "@/lib/contracts/cards";
import { cn } from "@/lib/utils";

import { PackCardFlip } from "./PackCardFlip";
import { PackDupePanel } from "./PackDupePanel";
import { StarPullBurst } from "./StarPullBurst";

/**
 * Polish spec §147–§151 (Phase 43) — in-place pack reveal.
 *
 * Replaces the PackOpenerModal (§111 from Phase 36) with a non-modal
 * panel that takes over the lineup page's main content area. Lineup
 * diamond + cards grid hide during reveal; sidebar stays visible.
 *
 * Sequential multi-pack flow: each pack gets its own peel/flip
 * moment. Between packs the user clicks `Next pack (N of M)`;
 * on the last pack that button becomes `Done · back to lineup`.
 * No mid-reveal escape — the footer button is the only exit path.
 *
 * Per-pack state (peel index, flip array, dupe resolutions, per-card
 * actions) resets when `currentPackIndex` advances.
 */

export type PerPackPayload = {
  /** Per-pack result payload. cardIds scoped to this pack only. */
  result: OpenPackResult;
  /** Cards pulled this pack, in cardResults order. */
  cards: RevealedCard[];
  /** Dupe lookup map: existingCardId → RevealedCard. Only entries for
   *  dupes in this pack. */
  existingByCardId: Map<string, RevealedCard>;
};

type DupeResolution = "pending" | "kept_new" | "kept_existing";
type PerCardAction = "quickSold" | "vaulted" | null;

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

  const totalPacks = packs.length;
  const isFinalPack = currentPackIndex >= totalPacks - 1;

  const [peelIndex, setPeelIndex] = useState(0);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [resolution, setResolution] = useState<DupeResolution[]>([]);
  const [perCardAction, setPerCardAction] = useState<PerCardAction[]>([]);
  const [celebratingIdx, setCelebratingIdx] = useState<number | null>(null);
  const [activeDupeIdx, setActiveDupeIdx] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // Reset per-pack state whenever the pack pointer changes — each
  // pack is its own fresh moment (§149). `cards` + `result` are
  // derived from `packs[currentPackIndex]`, so their pointer identity
  // flips exactly when `currentPackIndex` advances. No need to list
  // the index explicitly (Biome flags it as an unused dep).
  useEffect(() => {
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
  }, [cards, result]);

  const stackRemaining = Math.max(0, cards.length - peelIndex);
  const allPeeled = peelIndex >= cards.length;
  const allResolved = resolution.every((r) => r !== "pending");
  const packComplete = allPeeled && allResolved;

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

  function handleFooterAction() {
    if (!packComplete) return;
    if (isFinalPack) onDone();
    else onAdvancePack();
  }

  const subtitle = useMemo(() => {
    if (!pack) return "";
    if (!allPeeled) return `Tap the top card to peel · ${stackRemaining} left`;
    if (!allResolved) return "Resolve the dupe to continue";
    if (isFinalPack) return "All packs opened — back to lineup?";
    return "Pack complete · next up?";
  }, [pack, allPeeled, allResolved, isFinalPack, stackRemaining]);

  const dupePayload = useMemo(() => {
    if (activeDupeIdx === null) return null;
    const newCard = cards[activeDupeIdx] ?? null;
    const pulled = result?.cardResults?.[activeDupeIdx];
    const existingId = pulled?.existingCardId ?? null;
    const existing = existingId ? (existingByCardId.get(existingId) ?? null) : null;
    if (!newCard || !existing) return null;
    return { idx: activeDupeIdx, newCard, existing };
  }, [activeDupeIdx, cards, result, existingByCardId]);

  if (!pack) {
    return (
      <div className="flex h-full items-center justify-center py-12 text-sm text-[var(--text-3)]">
        No packs to reveal.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 px-6 py-5">
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
          <>
            {!allPeeled && (
              <StackZone
                activeIdx={peelIndex}
                remaining={stackRemaining}
                activeCard={cards[peelIndex] ?? null}
                activeFlipped={flipped[peelIndex] ?? false}
                onPeel={handlePeel}
                onFlipComplete={handleFlipComplete}
                celebrating={celebratingIdx === peelIndex}
              />
            )}

            <RevealedRow
              cards={cards}
              cardResults={result?.cardResults ?? []}
              flipped={flipped}
              resolution={resolution}
              perCardAction={perCardAction}
              actionsEnabled={packComplete}
              pending={pending}
              onQuickSell={handlePerCardQuickSell}
              onVault={handlePerCardVault}
            />

            {dupePayload && (
              <DupeResolutionOverlay
                newCard={dupePayload.newCard}
                existingCard={dupePayload.existing}
                pending={pending}
                onKeepNew={() => handleKeepNew(dupePayload.idx)}
                onKeepExisting={() => handleKeepExisting(dupePayload.idx)}
              />
            )}
          </>
        )}
      </div>

      <footer className="flex justify-end">
        <Button
          size="lg"
          disabled={!packComplete}
          onClick={handleFooterAction}
          className="min-w-[180px]"
        >
          {!packComplete ? (
            allPeeled ? (
              "Resolve dupe to continue"
            ) : (
              "Reveal all cards"
            )
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
 * Polish spec §150. Progress header at the top of the panel. Segmented
 * progress bar on the right: one segment per pack. Active segment
 * pulses; completed segments light; pending segments are muted.
 * Single-pack reveals degrade to a simpler "PACK · TYPE" label
 * (no counter, empty progress column).
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
  const visibleLayers = Math.min(remaining - 1, 6);
  return (
    <div className="relative flex h-[260px] w-[200px] items-center justify-center">
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
                  <span className="flex items-center gap-1 rounded-full border border-[var(--tier-gold)] bg-[var(--surface-2)] px-2 py-1 font-mono text-[10px] text-[var(--tier-gold)] uppercase tracking-wider">
                    <Archive className="size-3" aria-hidden="true" />
                    Vaulted
                  </span>
                </div>
              )}
              {action === "quickSold" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[10px] bg-[var(--bg)]/75">
                  <span className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 font-mono text-[10px] text-[var(--text-2)] uppercase tracking-wider">
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
