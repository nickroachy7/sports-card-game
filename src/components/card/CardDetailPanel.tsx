"use client";

import { Archive, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { getCardDetail } from "@/app/actions/cards";
import { vaultCardMidseason } from "@/app/actions/vault";
import { type CardDetailData, CardDetailView } from "@/components/card/CardDetailView";
import { Button } from "@/components/ui/button";

export type LineupContext = {
  /** If the card is currently in a slot, the panel shows Remove-from-slot. */
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
 * Polish spec §25 (Phase 13) — card detail rendered as a sidebar panel
 * (not a drawer). Extracted from the former <CardDetailDrawer> so the
 * same content can live flush in a 288px sidebar column.
 *
 * Fetches detail on `cardId` change, renders <CardDetailView> (the
 * pure content shared with the collection detail page), and tacks on
 * lineup-specific actions (Remove from slot / Add to vault) if
 * `lineupContext` is provided.
 */
export function CardDetailPanel({ cardId, lineupContext, onClose }: Props) {
  const [data, setData] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();
  const [vaulting, startVault] = useTransition();

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

  function handleAddToVault() {
    if (!cardId) return;
    startVault(async () => {
      const res = await vaultCardMidseason({ cardId });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success("Added to vault.");
      onClose?.();
      lineupContext?.onVaulted?.();
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
        {data && !loading && <CardDetailView data={data} />}
      </div>

      {data && lineupContext && (
        <footer className="flex shrink-0 flex-col gap-2 border-[var(--border)] border-t bg-[var(--surface-2)] px-3 py-3">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">
            Lineup actions
          </span>
          <div className="flex flex-col gap-2">
            {lineupContext.slotted && (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleRemoveFromSlot}
                disabled={removing}
              >
                <X className="mr-1 size-3.5" aria-hidden="true" />
                {removing ? "Removing…" : "Remove from slot"}
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
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
    </div>
  );
}
