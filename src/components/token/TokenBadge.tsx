"use client";

import type { TokenType } from "@/lib/contracts/cards";
import { TOKEN_SHORT_LABEL } from "@/lib/token/display";
import { cn } from "@/lib/utils";

/**
 * Pure-visual circular token pip. Wrapped by AppliedTokenBadge
 * (click-to-remove, sits on card corner) and TrayTokenPip (drag
 * source, sits in tokens row).
 *
 * Polish spec §114 (Phase 37). The old pure-CSS group-hover
 * tooltip that lived here was removed — both wrappers now render
 * a Radix `<Tooltip>` with shared `TokenTooltipContent`, which
 * handles portal + positioning + a11y and avoids the double
 * tooltip that appeared briefly after the P37 ship.
 *
 * Sizes:
 *   - "tray" 44px (the draggable pip shown in the tokens tray row)
 *   - "applied" 32px (the corner badge on a card)
 */

type Size = "tray" | "applied";

type Props = {
  tokenType: TokenType;
  bonusFp: number;
  size?: Size;
  dim?: boolean;
  className?: string;
  isDragging?: boolean;
};

const DIMENSION: Record<Size, number> = {
  tray: 44,
  applied: 32,
};

const LABEL_FONT_SIZE: Record<Size, number> = {
  tray: 11,
  applied: 9,
};

export function TokenBadge({
  tokenType,
  bonusFp: _bonusFp,
  size = "applied",
  dim,
  className,
  isDragging,
}: Props) {
  const dimension = DIMENSION[size];

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full border-2 bg-[var(--surface-2)] transition-opacity",
        dim ? "border-[var(--border)] opacity-40" : "border-[var(--tier-gold,#D4A647)]",
        isDragging && "opacity-40",
        className,
      )}
      style={{ width: dimension, height: dimension }}
    >
      <span
        className="font-sans font-bold uppercase tracking-wide text-[var(--tier-gold,#D4A647)]"
        style={{ fontSize: LABEL_FONT_SIZE[size], lineHeight: 1 }}
      >
        {TOKEN_SHORT_LABEL[tokenType]}
      </span>
    </div>
  );
}
