"use client";

import { useEffect } from "react";
import { useDrag } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";

import { dragResult } from "@/components/card/drag-layer-state";
import { DRAG_TYPES, type TokenDragItem } from "@/components/lineup/drag-types";
import type { LineupTokenVM } from "@/lib/lineup/types";
import { TOKEN_LONG_LABEL } from "@/lib/token/display";
import { cn } from "@/lib/utils";

import { TokenBadge } from "./TokenBadge";

type Props = {
  token: LineupTokenVM;
  disabled: boolean;
};

/**
 * Tray-variant token pip: draggable circular badge. HTML5 ghost
 * suppressed — TokenDragLayer renders the motion-spring ghost. On
 * drop (accepted or not), dragResult is mirrored for the layer's
 * bounce-back logic.
 *
 * Already-applied tokens render dim and are non-draggable.
 */
export function TrayTokenPip({ token, disabled }: Props) {
  const applied = token.appliedToCardId !== null;
  const unusable = disabled || applied;

  const [{ isDragging }, dragRef, preview] = useDrag<TokenDragItem, void, { isDragging: boolean }>(
    () => ({
      type: DRAG_TYPES.TOKEN,
      item: () => {
        dragResult.lastDropAccepted = false;
        return { tokenId: token.id, isPitcherToken: token.isPitcherToken };
      },
      canDrag: !unusable,
      end: (_item, monitor) => {
        dragResult.lastDropAccepted = monitor.didDrop();
      },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [token.id, token.isPitcherToken, unusable],
  );

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  return (
    <button
      type="button"
      ref={(el) => {
        dragRef(el);
      }}
      disabled={unusable}
      aria-label={`${TOKEN_LONG_LABEL[token.tokenType]} token, ${applied ? "applied" : "available"}`}
      className={cn(
        "appearance-none border-0 bg-transparent p-0",
        !unusable && "cursor-grab active:cursor-grabbing",
        unusable && "cursor-not-allowed",
      )}
    >
      <TokenBadge
        tokenType={token.tokenType}
        bonusFp={token.bonusFp}
        size="tray"
        dim={applied}
        isDragging={isDragging}
      />
    </button>
  );
}
