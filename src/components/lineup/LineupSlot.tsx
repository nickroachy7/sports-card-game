"use client";

import { Lock, Pin, PinOff, X } from "lucide-react";
import { motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";

import { Card } from "@/components/card/Card";
import { dragResult } from "@/components/card/drag-layer-state";
import { useCardDepleteEvent } from "@/components/lineup/CardContractEventsProvider";
import { SlotContractGlow } from "@/components/lineup/SlotContractGlow";
import { SlotFpGlow } from "@/components/lineup/SlotFpGlow";
import { SlotGameState } from "@/components/lineup/SlotGameState";
import { AppliedTokenBadge } from "@/components/token/AppliedTokenBadge";
import type { TokenType } from "@/lib/contracts/cards";
import type { LineupPosition } from "@/lib/contracts/lineup";
import { isPitcherSlot } from "@/lib/contracts/lineup";
import type { LineupCardVM, SlotGameInfo } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

import { type CardDragItem, DRAG_TYPES, type TokenDragItem } from "./drag-types";

type Props = {
  position: LineupPosition;
  card: LineupCardVM | null;
  appliedToken: {
    type: string;
    bonusFp: number;
    applicationId: string;
    /** P40 §128: null = pending, true = hit, false = missed. */
    triggered: boolean | null;
  } | null;
  /**
   * Per-slot lock (polish spec §44). True when the slot's player's
   * game has started and edits are rejected server-side. Also true
   * for any slot while the contest is in building → submitted edit-
   * gating paths that pre-date Phase 18. Falsy = fully editable.
   */
  locked: boolean;
  /** Today's game info for this slot, if any. Drives the game-state
   *  footer line (polish spec §45). */
  gameInfo: SlotGameInfo | null;
  /**
   * Called when a card is dropped on this slot. `fromPosition` is the
   * origin slot when the drag started from another lineup slot (used
   * to route to swap_lineup_slots); null for bench → slot drops and
   * for explicit "remove" clicks (pass cardId=null).
   */
  onCardDropped: (cardId: string | null, fromPosition: LineupPosition | null) => void;
  onTokenDropped: (tokenId: string) => void;
  onRemoveToken: (applicationId: string) => void;
  onOpenDetail: (cardId: string) => void;
  /**
   * Polish spec §113 (Phase 37). One-click remove. Fires when the
   * user clicks the × button in the top-left corner of a filled,
   * unlocked slot. Routes through the same path as a null-drop.
   */
  onRemoveStarter?: () => void;
  /**
   * Polish spec §175 (Phase 46). Per-slot sticky flag — when true,
   * this slot's content carries forward to the next slate's entry.
   * Toggle via `onToggleSticky`.
   */
  isSticky?: boolean;
  /** Fires when the user clicks the pin icon. Receives the next
   *  desired sticky state. */
  onToggleSticky?: (next: boolean) => void;
};

export function LineupSlot(props: Props) {
  // useCardDepleteEvent needs to run unconditionally (hook rules) —
  // call here, pass to <SlotContractGlow> below. Safe-null outside
  // the provider so building-state renders don't throw.
  const depleteEvent = useCardDepleteEvent(props.card?.id);
  return <LineupSlotInner {...props} depleteEvent={depleteEvent} />;
}

function LineupSlotInner({
  position,
  card,
  appliedToken,
  locked,
  gameInfo,
  onCardDropped,
  onTokenDropped,
  onRemoveToken,
  onOpenDetail,
  onRemoveStarter,
  isSticky = true,
  onToggleSticky,
  depleteEvent,
}: Props & { depleteEvent: ReturnType<typeof useCardDepleteEvent> }) {
  const isPitcher = isPitcherSlot(position);
  const reducedMotion = useReducedMotion();

  // Polish spec §119 (Phase 38). Drop-in settle bounce. Every
  // accepted drop (card or token) increments this counter; a
  // useEffect below kicks off the scale-pulse animation on the
  // slot's inner card element. Start at 0 so the initial mount
  // doesn't animate.
  const [dropSettleKey, setDropSettleKey] = useState(0);
  const [settleScope, animateSettle] = useAnimate();

  useEffect(() => {
    if (dropSettleKey === 0 || reducedMotion || !settleScope.current) return;
    animateSettle(
      settleScope.current,
      { scale: [0.92, 1.03, 1] },
      { duration: 0.18, times: [0, 0.5, 1], ease: "easeOut" },
    );
  }, [dropSettleKey, reducedMotion, animateSettle, settleScope]);

  // Card drop target — accepts any hitter card for hitter slots, any pitcher for SP slots.
  // Self-drop (dragging from this slot back to itself) is rejected so the
  // invalid-drop bounce-back fires rather than a no-op server call.
  const [{ isCardOver, canCardDrop }, cardDropRef] = useDrop<
    CardDragItem,
    void,
    { isCardOver: boolean; canCardDrop: boolean }
  >(
    () => ({
      accept: DRAG_TYPES.CARD,
      canDrop: (item) => !locked && item.isPitcher === isPitcher && item.fromPosition !== position,
      drop: (item) => {
        onCardDropped(item.cardId, item.fromPosition ?? null);
        setDropSettleKey((k) => k + 1);
      },
      collect: (monitor) => ({
        isCardOver: monitor.isOver(),
        canCardDrop: monitor.canDrop(),
      }),
    }),
    [locked, isPitcher, position, onCardDropped],
  );

  // Card drag source — active only when a filled slot. `fromPosition`
  // routes the drop handler to swap_lineup_slots instead of
  // update_lineup_slot.
  const [{ isDragging }, slotDragRef, slotDragPreview] = useDrag<
    CardDragItem,
    void,
    { isDragging: boolean }
  >(
    () => ({
      type: DRAG_TYPES.CARD,
      item: () => {
        dragResult.lastDropAccepted = false;
        return {
          cardId: card?.id ?? "",
          isPitcher: card?.isPitcher ?? isPitcher,
          fromPosition: position,
        };
      },
      canDrag: !locked && !!card,
      end: (_item, monitor) => {
        dragResult.lastDropAccepted = monitor.didDrop();
      },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [card?.id, card?.isPitcher, position, locked],
  );

  // Suppress the default HTML5 drag ghost — CardDragLayer renders the
  // motion-backed ghost instead (same pattern as BenchCard).
  useEffect(() => {
    slotDragPreview(getEmptyImage(), { captureDraggingState: true });
  }, [slotDragPreview]);

  // Token drop target — only accepts tokens whose type matches the slot's player type
  // AND only when a card is present in this slot.
  const [{ isTokenOver, canTokenDrop }, tokenDropRef] = useDrop<
    TokenDragItem,
    void,
    { isTokenOver: boolean; canTokenDrop: boolean }
  >(
    () => ({
      accept: DRAG_TYPES.TOKEN,
      canDrop: (item) => !locked && !!card && item.isPitcherToken === isPitcher,
      drop: (item) => {
        onTokenDropped(item.tokenId);
        setDropSettleKey((k) => k + 1);
      },
      collect: (monitor) => ({
        isTokenOver: monitor.isOver(),
        canTokenDrop: monitor.canDrop(),
      }),
    }),
    [locked, isPitcher, card, onTokenDropped],
  );

  // Polish spec §82 (Phase 28). Lineup cards render at size="small"
  // (96×134) — identical to bench. The P26 size="lineup" (120×168)
  // was reverted along with the fixed-height grid pane; flow-based
  // layout no longer needs bigger cards to anchor the pane, and
  // bench-size keeps the whole page consistent (drag-from-bench is
  // a zero-shift motion).
  const ringClass = cn(
    "relative flex h-[134px] w-[96px] flex-col items-center justify-center rounded-md border-2 border-dashed transition-colors",
    isCardOver && canCardDrop && "border-[var(--text)] bg-[var(--surface-2)]",
    isCardOver && !canCardDrop && "border-[#C47262] bg-[#C4726222]",
    isTokenOver && canTokenDrop && "border-[var(--tier-gold,#D4A647)]",
    !isCardOver && !isTokenOver && "border-[var(--border)] bg-[var(--surface)]",
  );

  if (!card) {
    return (
      <section
        ref={(el) => {
          cardDropRef(el);
        }}
        className={ringClass}
        aria-label={`${position} slot, empty`}
      >
        <span className="font-sans text-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">
          {position}
        </span>
        <span className="mt-1 text-[9px] uppercase tracking-wider text-[var(--text-3)]">
          Drag {isPitcher ? "a pitcher" : "a hitter"}
        </span>
      </section>
    );
  }

  return (
    <section
      ref={(el) => {
        // Filled slots stack both refs — card-drop to swap, token-drop to apply.
        cardDropRef(el);
        tokenDropRef(el);
      }}
      className={cn(
        "group/slot relative flex flex-col items-center gap-1 rounded-md transition-colors",
        isTokenOver && canTokenDrop && "ring-2 ring-[var(--tier-gold,#D4A647)]",
        isCardOver && canCardDrop && "ring-2 ring-[var(--text)]",
        isCardOver && !canCardDrop && "ring-2 ring-[#C47262]",
      )}
      aria-label={`${position} slot, ${card.playerName}`}
    >
      <div
        ref={(el) => {
          slotDragRef(el);
        }}
        // Polish spec §117 (Phase 38). Source fully hidden while
        // dragging — motion ghost in CardDragLayer is authoritative.
        // Keep only opacity-0; pointer-events-none would cancel the
        // HTML5 drag (browser treats an unreachable source as
        // aborted). The cursor is on the ghost, not the source.
        className={cn("relative", isDragging && "opacity-0")}
      >
        {/* Polish spec §119 (Phase 38). `settleScope` receives the
            drop-in scale pulse whenever a new card or token lands on
            this slot. Wrapper needs to stay mounted across drops so
            the ref is stable. */}
        <motion.div ref={settleScope} className="relative inline-block">
          <Card card={card} size="small" onClick={() => onOpenDetail(card.id)} />
        </motion.div>
        {/* Polish spec §113 (Phase 37). One-click remove. Sits in
            the card's top-left, fades in on slot hover. Hidden
            entirely while the slot is locked (the lock glyph owns
            the top-right). */}
        {!locked && onRemoveStarter && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemoveStarter();
            }}
            aria-label={`Remove ${card.playerName} from ${position}`}
            className={cn(
              "absolute -left-1.5 -top-1.5 z-20 flex size-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] opacity-0 shadow transition-opacity",
              "group-hover/slot:opacity-100 focus-visible:opacity-100",
              "hover:border-[#C47262] hover:text-[#C47262]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-2)]",
            )}
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        )}
        {/* Per-slot FP glow — post-submit only. Polish spec §21. */}
        <SlotFpGlow playerId={card.playerId} enabled={locked} />
        {/* Per-slot contract-depletion glow — post-submit only. Polish spec §30. */}
        <SlotContractGlow depleteEvent={depleteEvent} enabled={locked} />
        {appliedToken && (
          <div className="-right-2 -bottom-2 absolute z-10">
            <AppliedTokenBadge
              tokenType={appliedToken.type as TokenType}
              bonusFp={appliedToken.bonusFp}
              triggered={appliedToken.triggered}
              onRemove={() => onRemoveToken(appliedToken.applicationId)}
              disabled={locked}
            />
          </div>
        )}
        {/* Per-slot lock glyph — polish spec §44. Shows when the
            slot is gated because its player's game has started. */}
        {locked && (
          <div className="absolute top-1 right-1 z-10 rounded-full bg-black/60 p-0.5 text-[var(--text-2)]">
            <Lock className="size-2.5" aria-hidden="true" />
          </div>
        )}
        {/* Polish spec §175 (Phase 46). Sticky pin toggle. Only renders
            when slot is filled, unlocked, and a callback is provided.
            Filled gold = carries to tomorrow; outlined muted = one-shot.
            Click toggles. Hidden when locked (lock glyph owns the
            top-right corner above). */}
        {!locked && card && onToggleSticky && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleSticky(!isSticky);
            }}
            aria-pressed={isSticky}
            aria-label={
              isSticky
                ? `Sticky: ${card.playerName} carries to tomorrow's lineup. Click to make one-shot.`
                : `One-shot: ${card.playerName} drops after today's game. Click to make sticky.`
            }
            title={isSticky ? "Sticky — carries to tomorrow" : "One-shot — drops after today"}
            className={cn(
              "absolute top-1 right-1 z-10 flex size-5 items-center justify-center rounded-full border transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-2)]",
              isSticky
                ? "border-[var(--tier-gold)] bg-[var(--tier-gold)] text-[var(--bg)] hover:opacity-90"
                : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)] hover:border-[var(--text-2)] hover:text-[var(--text-2)]",
            )}
          >
            {isSticky ? (
              <Pin className="size-3" aria-hidden="true" />
            ) : (
              <PinOff className="size-3" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {/* Polish spec §45 game-state footer, restored in Phase 27 after
          being temporarily dropped in P26. Tone-washed pill under the
          card — muted for scheduled / off, emerald for live, neutral
          surface for final. The at-a-glance game signal belongs here,
          below the card, not buried in the box score. */}
      <SlotGameState info={gameInfo} />
    </section>
  );
}
