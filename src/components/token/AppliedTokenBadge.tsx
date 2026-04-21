"use client";

import { X } from "lucide-react";
import { useState } from "react";

import type { TokenType } from "@/lib/contracts/cards";
import { TOKEN_LONG_LABEL } from "@/lib/token/display";
import { cn } from "@/lib/utils";

import { TokenBadge } from "./TokenBadge";

/**
 * Applied-state corner badge. Click → inline "Remove?" confirm (same
 * pip dims + red X overlay). Click confirm fires onRemove; click
 * anywhere else cancels.
 *
 * Placement is the caller's responsibility — wrap this in a relative
 * container and position it absolutely in the card's bottom-right,
 * overlaid outside the tier frame (polish spec §5).
 */
type Props = {
  tokenType: TokenType;
  bonusFp: number;
  onRemove: () => void;
  disabled?: boolean;
  className?: string;
};

export function AppliedTokenBadge({ tokenType, bonusFp, onRemove, disabled, className }: Props) {
  const [confirming, setConfirming] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (confirming) {
      onRemove();
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  }

  function handleBlur() {
    // Give time for the confirm click to land before collapsing.
    window.setTimeout(() => setConfirming(false), 150);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onBlur={handleBlur}
      disabled={disabled}
      aria-label={
        confirming
          ? `Confirm remove ${TOKEN_LONG_LABEL[tokenType]} token`
          : `Remove ${TOKEN_LONG_LABEL[tokenType]} token`
      }
      className={cn(
        "relative block appearance-none border-0 bg-transparent p-0",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className,
      )}
    >
      <TokenBadge tokenType={tokenType} bonusFp={bonusFp} size="applied" />
      {confirming && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-[#C47262]/90 text-[var(--text)] shadow-md ring-2 ring-[#C47262]"
        >
          <X className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}
