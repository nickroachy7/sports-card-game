"use client";

import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Polish spec §109 (Phase 36). Floating action button that opens the
 * buy-packs modal on /lineup. Took over the gold-pulse daily-pack
 * indicator from the old header shop link.
 *
 * Positioning: `fixed bottom-right` so the button stays put while
 * the cards grid scrolls. Hidden via `disabled` prop while pack
 * reveal is active so it doesn't overlap the modal's dismiss
 * affordance.
 */
type Props = {
  dailyReady: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function BuyPacksFab({ dailyReady, disabled = false, onClick }: Props) {
  if (disabled) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dailyReady ? "Buy packs — daily pack ready" : "Buy packs"}
      className={cn(
        "fixed right-5 bottom-5 z-30 flex size-14 items-center justify-center rounded-full shadow-lg transition-transform",
        "bg-[var(--tier-gold)] text-[var(--bg)] hover:scale-105",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
      )}
    >
      <Package className="size-6" aria-hidden="true" />
      {dailyReady && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 size-2.5 animate-pulse rounded-full border border-[var(--bg)] bg-[var(--tier-diamond)]"
        />
      )}
    </button>
  );
}
