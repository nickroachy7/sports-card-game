"use client";

import { X } from "lucide-react";

import { TokenTooltipContent } from "@/components/token/TokenTooltipContent";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TokenType } from "@/lib/contracts/cards";
import { TOKEN_LONG_LABEL } from "@/lib/token/display";
import { cn } from "@/lib/utils";

import { TokenBadge } from "./TokenBadge";

/**
 * Applied-state corner badge.
 *
 * Click = remove. A small X glyph sits in the top-right of the pip
 * so the "click to remove" affordance is visible on hover; the
 * tooltip (via wrapped <Tooltip>) explains what the token does.
 * Tokens aren't destroyed when removed — they snap back to the tray
 * — so no confirm step is needed. The old two-click "confirming"
 * pattern was harder to use than it saved accidents for, per user
 * feedback.
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
  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    onRemove();
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          aria-label={`Remove ${TOKEN_LONG_LABEL[tokenType]} token`}
          className={cn(
            "group/applied-token relative block appearance-none border-0 bg-transparent p-0",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
            className,
          )}
        >
          <TokenBadge tokenType={tokenType} bonusFp={bonusFp} size="applied" />
          {!disabled && (
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute -right-0.5 -top-0.5 z-10 flex size-4 items-center justify-center rounded-full bg-[#C47262] text-[var(--text)] shadow opacity-0 transition-opacity",
                "group-hover/applied-token:opacity-100 group-focus-visible/applied-token:opacity-100",
              )}
            >
              <X className="size-2.5" strokeWidth={3} />
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <TokenTooltipContent tokenType={tokenType} bonusFp={bonusFp} />
      </TooltipContent>
    </Tooltip>
  );
}
