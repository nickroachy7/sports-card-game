"use client";

import { Check, X } from "lucide-react";

import { TokenTooltipContent } from "@/components/token/TokenTooltipContent";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TokenType } from "@/lib/contracts/cards";
import { TOKEN_LONG_LABEL } from "@/lib/token/display";
import { cn } from "@/lib/utils";

import { TokenBadge } from "./TokenBadge";

/**
 * Applied-state corner badge.
 *
 * Click = remove (when pending). A small X glyph sits in the top-
 * right of the pip on hover so the affordance is visible; the tooltip
 * (via wrapped <Tooltip>) explains what the token does.
 *
 * Polish spec §129 (Phase 40): once a token resolves (the contest
 * event fires or finalize marks it missed), the badge renders with a
 * permanent status chip — ✓ (emerald) for hit, ✗ (red) for missed —
 * and the pip dims for missed state. Resolved tokens are no longer
 * removable (the game is over, the result is final).
 */
type Props = {
  tokenType: TokenType;
  bonusFp: number;
  /** P40 §128: null = pending, true = hit, false = missed. */
  triggered?: boolean | null;
  onRemove: () => void;
  disabled?: boolean;
  className?: string;
};

export function AppliedTokenBadge({
  tokenType,
  bonusFp,
  triggered = null,
  onRemove,
  disabled,
  className,
}: Props) {
  const resolved = triggered !== null;
  const hit = triggered === true;
  const missed = triggered === false;
  // Resolved tokens aren't interactive — the state is the story.
  const effectiveDisabled = disabled || resolved;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (effectiveDisabled) return;
    onRemove();
  }

  const ariaLabel = hit
    ? `${TOKEN_LONG_LABEL[tokenType]} token — hit`
    : missed
      ? `${TOKEN_LONG_LABEL[tokenType]} token — missed`
      : `Remove ${TOKEN_LONG_LABEL[tokenType]} token`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          disabled={effectiveDisabled}
          aria-label={ariaLabel}
          className={cn(
            "group/applied-token relative block appearance-none border-0 bg-transparent p-0",
            effectiveDisabled ? "cursor-default" : "cursor-pointer",
            missed && "opacity-50",
            className,
          )}
        >
          <TokenBadge tokenType={tokenType} bonusFp={bonusFp} size="applied" />

          {/* Hit chip — permanent ✓ top-right. */}
          {hit && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-0.5 -top-0.5 z-10 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow"
            >
              <Check className="size-2.5" strokeWidth={3} />
            </span>
          )}

          {/* Missed chip — permanent ✗ top-right. */}
          {missed && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-0.5 -top-0.5 z-10 flex size-4 items-center justify-center rounded-full bg-[#C47262] text-white shadow"
            >
              <X className="size-2.5" strokeWidth={3} />
            </span>
          )}

          {/* Remove affordance — only on pending + hover. */}
          {!resolved && !disabled && (
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
