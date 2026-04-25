"use client";

import { useEffect } from "react";
import { useDrag } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";

import { dragResult } from "@/components/card/drag-layer-state";
import { DRAG_TYPES, type TokenDragItem } from "@/components/lineup/drag-types";
import { TokenTooltipContent } from "@/components/token/TokenTooltipContent";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LineupTokenVM } from "@/lib/lineup/types";
import { TOKEN_LONG_LABEL } from "@/lib/token/display";
import { cn } from "@/lib/utils";

import { TokenBadge } from "./TokenBadge";

type Props = {
  token: LineupTokenVM;
  disabled: boolean;
  /**
   * Polish spec §195 (Phase 49). Click → open the token detail
   * sidebar. Drag-to-apply still works; this fires only on a
   * non-drag click (the underlying button is the same element).
   */
  onClick?: () => void;
  /** When true, the pip renders an outline ring to indicate the
   *  detail panel is currently open for this token. */
  isActive?: boolean;
  /**
   * Polish spec §201 (Phase 49 Wave 1.1). Multi-select mode flag.
   * When true, drag is disabled (so click toggles selection
   * cleanly), and the pip renders a checkbox-style ring + check
   * mark on selected tokens. Mirrors the cards-grid pattern.
   */
  selectMode?: boolean;
  isSelected?: boolean;
};

/**
 * Tray-variant token pip: draggable circular badge. HTML5 ghost
 * suppressed — TokenDragLayer renders the motion-spring ghost. On
 * drop (accepted or not), dragResult is mirrored for the layer's
 * bounce-back logic.
 *
 * Already-applied tokens render dim and are non-draggable.
 */
export function TrayTokenPip({
  token,
  disabled,
  onClick,
  isActive,
  selectMode,
  isSelected,
}: Props) {
  const applied = token.appliedToCardId !== null;
  const unusable = disabled || applied;
  // §201 — drag is suppressed in select mode so a single click
  // toggles selection cleanly, mirroring how BenchCard behaves on
  // the cards grid.
  const dragSuppressed = unusable || selectMode === true;

  const [{ isDragging }, dragRef, preview] = useDrag<TokenDragItem, void, { isDragging: boolean }>(
    () => ({
      type: DRAG_TYPES.TOKEN,
      item: () => {
        dragResult.lastDropAccepted = false;
        return { tokenId: token.id, isPitcherToken: token.isPitcherToken };
      },
      canDrag: !dragSuppressed,
      end: (_item, monitor) => {
        dragResult.lastDropAccepted = monitor.didDrop();
      },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [token.id, token.isPitcherToken, dragSuppressed],
  );

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          ref={(el) => {
            dragRef(el);
          }}
          // §195 (Phase 49). Click handler opens the sidebar detail
          // panel. Even disabled (locked / applied) tokens are
          // clickable so the user can read details + quick-sell.
          // §201 — in select mode, click toggles selection.
          onClick={onClick}
          aria-label={`${TOKEN_LONG_LABEL[token.tokenType]} token, ${applied ? "applied" : "available"}`}
          aria-pressed={selectMode ? isSelected : isActive}
          className={cn(
            "relative appearance-none rounded-full border-0 bg-transparent p-0 transition-opacity",
            !dragSuppressed && "cursor-grab active:cursor-grabbing",
            dragSuppressed && "cursor-pointer",
            // §195 — outline ring when this token's detail panel is
            // currently open in the sidebar.
            isActive &&
              !selectMode &&
              "outline outline-2 outline-offset-2 outline-[var(--tier-gold)]",
            // §201 — checkbox-style ring on selected tokens in
            // select mode. Tier-gold matches the SELECT button +
            // BenchCard's selected ring.
            selectMode &&
              isSelected &&
              "outline outline-2 outline-offset-2 outline-[var(--tier-gold)]",
            // Polish spec §117 (Phase 38). Source token pip hides
            // fully while dragging; the TokenDragLayer renders the
            // in-flight ghost. Only opacity-0 (no
            // pointer-events-none) — the HTML5 drag cancels if the
            // source becomes unreachable mid-drag.
            isDragging && "opacity-0",
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
      </TooltipTrigger>
      <TooltipContent side="top">
        <TokenTooltipContent tokenType={token.tokenType} bonusFp={token.bonusFp} />
      </TooltipContent>
    </Tooltip>
  );
}
