"use client";

import { useEffect } from "react";
import { useDrag } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";

import type { AppliedTokenInfo } from "@/app/(app)/lineup/lineup-view";
import { Card } from "@/components/card/Card";
import { dragResult } from "@/components/card/drag-layer-state";
import { SlotGameState } from "@/components/lineup/SlotGameState";
import { AppliedTokenBadge } from "@/components/token/AppliedTokenBadge";
import type { LineupPosition } from "@/lib/contracts/lineup";
import type { LineupCardVM, SlotGameInfo } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

import { type CardDragItem, DRAG_TYPES } from "./drag-types";

type Props = {
  card: LineupCardVM;
  assigned: boolean;
  /** Polish spec §94 (Phase 32). When non-null, the card is rostered
   *  in a lineup slot and this is that slot's position. Included in
   *  the drag item so the drop handler on LineupSlot routes through
   *  `swap_lineup_slots` instead of `update_lineup_slot`. */
  fromPosition?: LineupPosition | null;
  appliedToken?: AppliedTokenInfo;
  /** Polish spec §58 — today's game for this card's player, or null
   *  when they have no game in the contest. Drives the footer line
   *  below the card (same info as on a lineup slot). */
  gameInfo: SlotGameInfo | null;
  onRemoveToken: (applicationId: string) => void;
  onOpenDetail: (cardId: string) => void;
  disabled: boolean;
  locked: boolean;
};

export function BenchCard({
  card,
  assigned,
  fromPosition = null,
  appliedToken,
  gameInfo,
  onRemoveToken,
  onOpenDetail,
  disabled,
  locked,
}: Props) {
  const [{ isDragging }, dragRef, preview] = useDrag<CardDragItem, void, { isDragging: boolean }>(
    () => ({
      type: DRAG_TYPES.CARD,
      item: () => {
        dragResult.lastDropAccepted = false;
        const item: CardDragItem = { cardId: card.id, isPitcher: card.isPitcher };
        if (fromPosition) item.fromPosition = fromPosition;
        return item;
      },
      canDrag: !disabled,
      end: (_item, monitor) => {
        dragResult.lastDropAccepted = monitor.didDrop();
      },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [card.id, card.isPitcher, disabled, fromPosition],
  );

  // Suppress the HTML5 drag ghost — the card itself plus our drop-indicators
  // communicate drag state more cleanly.
  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="relative">
        <button
          type="button"
          ref={(el) => {
            dragRef(el);
          }}
          // Post-submit: spec §16 keeps bench cards visible but non-
          // interactive — no drag + no click-to-detail.
          onClick={locked ? undefined : () => onOpenDetail(card.id)}
          className={cn(
            "appearance-none border-0 bg-transparent p-0 transition-opacity",
            isDragging && "opacity-40",
            !locked && assigned && "opacity-60",
            locked && "cursor-not-allowed opacity-50",
            !locked && disabled && "cursor-not-allowed",
            !locked && !disabled && !isDragging && "cursor-grab active:cursor-grabbing",
          )}
          aria-label={
            locked
              ? `${card.playerName}${assigned ? " (in lineup)" : ""} — lineup locked`
              : `${card.playerName}${assigned ? " (in lineup)" : ""} — click for detail`
          }
        >
          <Card card={card} size="small" />
        </button>
        {appliedToken && (
          <div className="-right-2 -bottom-2 absolute z-10">
            <AppliedTokenBadge
              tokenType={appliedToken.tokenType}
              bonusFp={appliedToken.bonusFp}
              onRemove={() => onRemoveToken(appliedToken.applicationId)}
              disabled={locked}
            />
          </div>
        )}
      </div>
      {/* Polish spec §58 — today's game state, same info as lineup
          slot footer. Off-day (no game) gets a muted "OFF". */}
      <SlotGameState info={gameInfo} variant="bench" />
    </div>
  );
}
