"use client";

import type { TokenType } from "@/lib/contracts/cards";
import { TOKEN_SHORT_LABEL, tokenRuleText } from "@/lib/token/display";
import { cn } from "@/lib/utils";

/**
 * Pure-visual circular token pip with a hover tooltip. Wrapped by
 * AppliedTokenBadge (click-to-remove, sits on card corner) and
 * TrayTokenPip (drag source, sits in tokens row).
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
  bonusFp,
  size = "applied",
  dim,
  className,
  isDragging,
}: Props) {
  const dimension = DIMENSION[size];

  return (
    <div className={cn("group/token relative inline-block", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-full border-2 bg-[var(--surface-2)] transition-opacity",
          dim ? "border-[var(--border)] opacity-40" : "border-[var(--tier-gold,#D4A647)]",
          isDragging && "opacity-40",
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
      {/* Hover tooltip — pure CSS via group-hover, no JS state. */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-48 -translate-x-1/2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-sans text-[11px] leading-snug text-[var(--text)] opacity-0 shadow-md transition-opacity duration-150 group-hover/token:opacity-100">
        <span className="font-semibold text-[var(--tier-gold,#D4A647)]">+{bonusFp} FP</span>
        <span className="ml-1 text-[var(--text-2)]">{tokenRuleText(tokenType, bonusFp)}</span>
      </div>
    </div>
  );
}
