"use client";

import { Lock } from "lucide-react";
import { useEffect } from "react";
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
  depleteEvent,
}: Props & { depleteEvent: ReturnType<typeof useCardDepleteEvent> }) {
  const isPitcher = isPitcherSlot(position);

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
      },
      collect: (monitor) => ({
        isTokenOver: monitor.isOver(),
        canTokenDrop: monitor.canDrop(),
      }),
    }),
    [locked, isPitcher, card, onTokenDropped],
  );

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
        "relative flex flex-col items-center gap-1 rounded-md transition-colors",
        isTokenOver && canTokenDrop && "ring-2 ring-[var(--tier-gold,#D4A647)]",
        isCardOver && canCardDrop && "ring-2 ring-[var(--text)]",
        isCardOver && !canCardDrop && "ring-2 ring-[#C47262]",
      )}
      aria-label={`${position} slot, ${card.playerName}`}
    >
      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-3)]">
        {position}
      </span>
      <div
        ref={(el) => {
          slotDragRef(el);
        }}
        className={cn("relative", isDragging && "opacity-40")}
      >
        <Card card={card} size="small" onClick={() => onOpenDetail(card.id)} />
        {/* Per-slot FP glow — post-submit only. Polish spec §21. */}
        <SlotFpGlow playerId={card.playerId} enabled={locked} />
        {/* Per-slot contract-depletion glow — post-submit only. Polish spec §30. */}
        <SlotContractGlow depleteEvent={depleteEvent} enabled={locked} />
        {appliedToken && (
          <div className="absolute -right-2 -bottom-2 z-10">
            <AppliedTokenBadge
              tokenType={appliedToken.type as TokenType}
              bonusFp={appliedToken.bonusFp}
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
      </div>
      {/* Game-state footer — polish spec §45. */}
      <SlotGameState info={gameInfo} />
      {!locked && (
        <button
          type="button"
          onClick={() => onCardDropped(null, null)}
          className="text-[10px] text-[var(--text-3)] underline-offset-2 hover:text-[var(--text-2)] hover:underline"
          aria-label={`Remove ${card.playerName}`}
        >
          remove
        </button>
      )}
    </section>
  );
}
