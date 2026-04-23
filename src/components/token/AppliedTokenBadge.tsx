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
 * Pending: short-label pip (K8 / HR / etc.), gold border. Small X
 * affordance appears in the top-right on hover for remove.
 *
 * Hit: ✓ replaces the short-label in the center, border flips to
 * emerald. No corner chip, no opacity change — the pip itself is
 * the state indicator. Non-interactive (game's final).
 *
 * Missed: ✗ replaces the short-label, border flips to muted red.
 * Same non-interactive rule.
 *
 * Prior (v1): resolved tokens showed a small corner chip + dimmed
 * the pip to 50%. The corner chip read as a remove affordance and
 * the dim was subtle; P40 follow-up moved the state to the pip
 * center.
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
  const state = hit ? "hit" : missed ? "missed" : "pending";

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
            className,
          )}
        >
          <TokenBadge tokenType={tokenType} bonusFp={bonusFp} size="applied" state={state} />

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
