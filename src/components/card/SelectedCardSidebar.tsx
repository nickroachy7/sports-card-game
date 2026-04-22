"use client";

import { ArrowLeft } from "lucide-react";

import { CardDetailPanel, type LineupContext } from "@/components/card/CardDetailPanel";
import { Button } from "@/components/ui/button";

type Props = {
  cardId: string | null;
  onBack: () => void;
  lineupContext?: LineupContext;
};

/**
 * Polish spec §25 (Phase 13) — sidebar wrapper that renders
 * <CardDetailPanel> with a Back button row on top. Used on both the
 * lineup and collection pages; when `cardId` is set, the parent
 * swaps its default sidebar content for this.
 *
 * The Back button is consistent across surfaces so the
 * navigation pattern reads the same way everywhere.
 */
export function SelectedCardSidebar({ cardId, onBack, lineupContext }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="-ml-2 flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-7 gap-1 px-2 text-[var(--text-2)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back
        </Button>
      </div>
      <CardDetailPanel cardId={cardId} lineupContext={lineupContext} onClose={onBack} />
    </div>
  );
}
