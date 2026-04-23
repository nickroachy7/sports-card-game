"use client";

import { Check, X } from "lucide-react";

import type { TokenType } from "@/lib/contracts/cards";
import { TOKEN_SHORT_LABEL } from "@/lib/token/display";
import { cn } from "@/lib/utils";

/**
 * Pure-visual circular token pip. Wrapped by AppliedTokenBadge
 * (click-to-remove, sits on card corner) and TrayTokenPip (drag
 * source, sits in tokens row).
 *
 * Polish spec §129 update (Phase 40 follow-up). Resolved tokens
 * (hit / missed) now replace the short-label text with a centered
 * ✓ or ✗ icon + the border color switches to match (emerald / red).
 * The old corner-chip + opacity-dim combo was reading as a remove
 * affordance instead of a state indicator. Token type info still
 * lives in the tooltip.
 */

type Size = "tray" | "applied";
type State = "pending" | "hit" | "missed";

type Props = {
  tokenType: TokenType;
  bonusFp: number;
  size?: Size;
  /** Drives the center icon + border color. Default "pending" keeps
   *  the short-label + gold-border look. */
  state?: State;
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

const ICON_SIZE: Record<Size, number> = {
  tray: 22,
  applied: 18,
};

export function TokenBadge({
  tokenType,
  bonusFp: _bonusFp,
  size = "applied",
  state = "pending",
  dim,
  className,
  isDragging,
}: Props) {
  const dimension = DIMENSION[size];
  const borderColor =
    state === "hit"
      ? "#10B981" // emerald-500
      : state === "missed"
        ? "#C47262"
        : undefined; // pending → var(--tier-gold) via class

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full border-2 bg-[var(--surface-2)] transition-opacity",
        state === "pending"
          ? dim
            ? "border-[var(--border)] opacity-40"
            : "border-[var(--tier-gold,#D4A647)]"
          : "",
        isDragging && "opacity-40",
        className,
      )}
      style={{
        width: dimension,
        height: dimension,
        ...(borderColor ? { borderColor } : null),
      }}
    >
      {state === "hit" ? (
        <Check
          aria-hidden="true"
          style={{ width: ICON_SIZE[size], height: ICON_SIZE[size], color: "#10B981" }}
          strokeWidth={3}
        />
      ) : state === "missed" ? (
        <X
          aria-hidden="true"
          style={{ width: ICON_SIZE[size], height: ICON_SIZE[size], color: "#C47262" }}
          strokeWidth={3}
        />
      ) : (
        <span
          className="font-sans font-bold uppercase tracking-wide text-[var(--tier-gold,#D4A647)]"
          style={{ fontSize: LABEL_FONT_SIZE[size], lineHeight: 1 }}
        >
          {TOKEN_SHORT_LABEL[tokenType]}
        </span>
      )}
    </div>
  );
}
