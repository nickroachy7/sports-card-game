"use client";

import { Archive, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { getCardDetail } from "@/app/actions/cards";
import { vaultCardMidseason } from "@/app/actions/vault";
import { type CardDetailData, CardDetailView } from "@/components/card/CardDetailView";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type LineupContext = {
  /** If the card is currently in a slot, the drawer shows Remove-from-slot. */
  slotted: boolean;
  /** Called when the user picks Remove from slot. Drawer closes after the
   *  action settles. */
  onRemoveFromSlot: () => Promise<void> | void;
  /** Called after a successful mid-season vault so the caller can
   *  refresh. Drawer closes before this fires. */
  onVaulted?: () => void;
};

type Props = {
  cardId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When the card is opened from a lineup surface, passes slot-context
   *  actions. Omitted for Collection usage (later slice). */
  lineupContext?: LineupContext;
};

/**
 * Polish spec §6: single-click on a lineup or bench card opens this
 * drawer. Reuses <CardDetailView> (same content as the Collection detail
 * page) and appends lineup-context actions (remove from slot, add to
 * vault in P7.4).
 */
export function CardDetailDrawer({ cardId, open, onOpenChange, lineupContext }: Props) {
  const [data, setData] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();
  const [vaulting, startVault] = useTransition();

  // Fetch detail when opening with a new cardId. Cleared on close.
  useEffect(() => {
    if (!open || !cardId) {
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
  }, [cardId, open]);

  function handleRemoveFromSlot() {
    if (!lineupContext) return;
    startRemove(async () => {
      try {
        await lineupContext.onRemoveFromSlot();
        onOpenChange(false);
      } catch {
        toast.error("Couldn't remove card from slot.");
      }
    });
  }

  function handleAddToVault() {
    if (!cardId) return;
    startVault(async () => {
      const res = await vaultCardMidseason({ cardId });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success("Added to vault.");
      onOpenChange(false);
      lineupContext?.onVaulted?.();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text)] sm:max-w-2xl"
      >
        <SheetHeader className="flex-row items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <SheetTitle className="font-sans text-sm uppercase tracking-wider text-[var(--text-3)]">
            Card detail
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-3)]">
              Loading…
            </div>
          )}
          {errorMsg && !loading && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-sm text-[var(--text-3)]">
              <span>{errorMsg}</span>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          )}
          {data && !loading && <CardDetailView data={data} />}
        </div>

        {data && lineupContext && (
          <footer className="flex shrink-0 flex-col gap-2 border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">
              Lineup actions
            </span>
            <div className="flex gap-2">
              {lineupContext.slotted && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleRemoveFromSlot}
                  disabled={removing}
                >
                  <X className="mr-1 size-3.5" aria-hidden="true" />
                  {removing ? "Removing…" : "Remove from slot"}
                </Button>
              )}
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleAddToVault}
                disabled={vaulting || data.card.isExpired || data.card.hasAppliedToken}
                title={
                  data.card.isExpired
                    ? "Expired cards can't be vaulted"
                    : data.card.hasAppliedToken
                      ? "Remove the applied token first"
                      : undefined
                }
              >
                <Archive className="mr-1 size-3.5" aria-hidden="true" />
                {vaulting ? "Vaulting…" : "Add to vault"}
              </Button>
            </div>
          </footer>
        )}
      </SheetContent>
    </Sheet>
  );
}
