"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { CardDetailPanel, type LineupContext } from "@/components/card/CardDetailPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  /** LineupContext exposes lineup-specific actions (remove from slot,
   *  on-vault refresh) when opened from the lineup page. Null when
   *  opened from the collection page. */
  lineupContext?: LineupContext;
};

/**
 * Polish spec §89 (Phase 30). Card detail modal. Replaces the
 * SidebarFadeSwap-to-SelectedCardSidebar pattern that both the
 * lineup and collection pages used pre-P30. The modal reads its
 * open state from the `?card={id}` URL param so back/forward
 * navigation + shareable links still work.
 *
 * `CardDetailPanel` (the actual content) is reused verbatim. The
 * modal just provides an overlay + close affordance.
 */
export function CardDetailModal({ lineupContext }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cardId = searchParams.get("card");

  const close = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("card");
    const q = next.toString();
    router.push(q ? `${window.location.pathname}?${q}` : window.location.pathname, {
      scroll: false,
    });
  }, [router, searchParams]);

  return (
    <Dialog
      open={cardId !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[var(--border)] bg-[var(--surface)] text-[var(--text)] sm:max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>Card detail</DialogTitle>
          <DialogDescription>Player stats, contract, and actions.</DialogDescription>
        </DialogHeader>
        {cardId && (
          <CardDetailPanel cardId={cardId} lineupContext={lineupContext} onClose={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}
