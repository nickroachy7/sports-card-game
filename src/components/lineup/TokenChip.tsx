"use client";

import { useEffect } from "react";
import { useDrag } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";

import type { LineupTokenVM } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

import { DRAG_TYPES, type TokenDragItem } from "./drag-types";
import { formatTokenLabel } from "./LineupSlot";

type Props = {
  token: LineupTokenVM;
  disabled: boolean;
};

export function TokenChip({ token, disabled }: Props) {
  const [{ isDragging }, dragRef, preview] = useDrag<TokenDragItem, void, { isDragging: boolean }>(
    () => ({
      type: DRAG_TYPES.TOKEN,
      item: { tokenId: token.id, isPitcherToken: token.isPitcherToken },
      canDrag: !disabled && token.appliedToCardId === null,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [token.id, token.isPitcherToken, disabled, token.appliedToCardId],
  );

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  const applied = token.appliedToCardId !== null;
  const unusable = disabled || applied;

  return (
    <button
      type="button"
      ref={(el) => {
        dragRef(el);
      }}
      disabled={unusable}
      className={cn(
        "flex h-8 shrink-0 appearance-none items-center gap-2 rounded-full border px-3 transition-opacity",
        applied
          ? "border-[var(--border)] bg-[var(--surface)] opacity-50"
          : "border-[var(--tier-gold,#D4A647)] bg-[var(--surface-2)]",
        isDragging && "opacity-40",
        !unusable && "cursor-grab active:cursor-grabbing",
        unusable && "cursor-not-allowed",
      )}
      aria-label={`${formatTokenLabel(token.tokenType)} token, ${applied ? "applied" : "available"}`}
    >
      <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--tier-gold,#D4A647)]">
        {formatTokenLabel(token.tokenType)}
      </span>
      <span className="font-mono text-[10px] font-bold text-[var(--text)]">+{token.bonusFp}</span>
    </button>
  );
}
