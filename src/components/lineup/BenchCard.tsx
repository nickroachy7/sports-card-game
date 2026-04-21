"use client";

import { useEffect } from "react";
import { useDrag } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";

import type { AppliedTokenInfo } from "@/app/(app)/lineup/lineup-view";
import { Card } from "@/components/card/Card";
import { dragResult } from "@/components/card/drag-layer-state";
import { AppliedTokenBadge } from "@/components/token/AppliedTokenBadge";
import type { LineupCardVM } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

import { type CardDragItem, DRAG_TYPES } from "./drag-types";

type Props = {
  card: LineupCardVM;
  assigned: boolean;
  appliedToken?: AppliedTokenInfo;
  onRemoveToken: (applicationId: string) => void;
  onOpenDetail: (cardId: string) => void;
  disabled: boolean;
  locked: boolean;
};

export function BenchCard({
  card,
  assigned,
  appliedToken,
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
        return { cardId: card.id, isPitcher: card.isPitcher };
      },
      canDrag: !disabled,
      end: (_item, monitor) => {
        dragResult.lastDropAccepted = monitor.didDrop();
      },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [card.id, card.isPitcher, disabled],
  );

  // Suppress the HTML5 drag ghost — the card itself plus our drop-indicators
  // communicate drag state more cleanly.
  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        ref={(el) => {
          dragRef(el);
        }}
        onClick={() => onOpenDetail(card.id)}
        className={cn(
          "appearance-none border-0 bg-transparent p-0 transition-opacity",
          isDragging && "opacity-40",
          assigned && "opacity-60",
          disabled && "cursor-not-allowed",
          !disabled && !isDragging && "cursor-grab active:cursor-grabbing",
        )}
        aria-label={`${card.playerName}${assigned ? " (in lineup)" : ""} — click for detail`}
      >
        <Card card={card} size="small" />
      </button>
      {appliedToken && (
        <div className="absolute -bottom-2 -right-2 z-10">
          <AppliedTokenBadge
            tokenType={appliedToken.tokenType}
            bonusFp={appliedToken.bonusFp}
            onRemove={() => onRemoveToken(appliedToken.applicationId)}
            disabled={locked}
          />
        </div>
      )}
    </div>
  );
}
