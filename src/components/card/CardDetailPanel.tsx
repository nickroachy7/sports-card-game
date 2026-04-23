"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { getCardDetail } from "@/app/actions/cards";
import { type CardDetailData, CardDetailView } from "@/components/card/CardDetailView";
import { Button } from "@/components/ui/button";

export type LineupContext = {
  /** If the card is currently in a slot, the detail view renders a
   *  Remove-from-slot button inside its Actions section. */
  slotted: boolean;
  /** Called when the user picks Remove from slot. */
  onRemoveFromSlot: () => Promise<void> | void;
  /** Called after a successful mid-season vault so the caller can refresh. */
  onVaulted?: () => void;
};

type Props = {
  cardId: string | null;
  /** When the card is opened from a lineup surface, passes slot-context
   *  actions. Omitted for Collection usage. */
  lineupContext?: LineupContext;
  /** Called when the user wants to close the detail view (e.g., after a
   *  successful remove-from-slot or vault action). */
  onClose?: () => void;
};

/**
 * Polish spec §25 (Phase 13) + §106 (Phase 35) — card detail
 * rendered as a sidebar panel (not a drawer).
 *
 * Phase 35 cleanup: the separate "Lineup Actions" footer that used
 * to live here (with a duplicate Add-to-vault button) was removed.
 * Remove-from-slot folded into CardDetailView's Actions section via
 * `lineupContext`, producing a single Actions block inside the
 * detail view itself.
 *
 * Fetches detail on `cardId` change and renders <CardDetailView>.
 */
export function CardDetailPanel({ cardId, lineupContext, onClose }: Props) {
  const [data, setData] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();

  useEffect(() => {
    if (!cardId) {
      setData(null);
      setErrorMsg(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    (async () => {
      const res = await getCardDetail(cardId);
      if (cancelled) return;
      if (!res.ok) {
        setErrorMsg(res.error.message);
        setData(null);
      } else {
        setData(res.data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  function handleRemoveFromSlot() {
    if (!lineupContext) return;
    startRemove(async () => {
      try {
        await lineupContext.onRemoveFromSlot();
        onClose?.();
      } catch {
        toast.error("Couldn't remove card from slot.");
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        {loading && (
          <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-3)]">
            Loading…
          </div>
        )}
        {errorMsg && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-sm text-[var(--text-3)]">
            <span>{errorMsg}</span>
            {onClose && (
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        )}
        {data && !loading && (
          <CardDetailView
            data={data}
            lineupContext={
              lineupContext
                ? {
                    slotted: lineupContext.slotted,
                    onRemoveFromSlot: handleRemoveFromSlot,
                    removing,
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
