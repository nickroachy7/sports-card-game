"use client";

import { ArrowRight, Check, Coins } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { fetchRevealTokens, type RevealedToken, resolvePendingToken } from "@/app/actions/tokens";
import { TokenBadge } from "@/components/token/TokenBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TokenType } from "@/lib/contracts/cards";
import type { LineupTokenVM } from "@/lib/lineup/types";
import { TOKEN_LONG_LABEL, TOKEN_SHORT_LABEL } from "@/lib/token/display";
import { cn } from "@/lib/utils";

/**
 * Polish spec §199 (Phase 49 Wave 2). Token overflow resolve modal.
 *
 * Appears after pack reveal completes when at least one pending
 * token (granted by `open_pack` while user was at cap) needs
 * resolution. The user walks through them one at a time:
 *   - Pick an existing token to replace (auto-quicksells the chosen
 *     one, flips pending → active)
 *   - Or "Quick-sell new" (sells the pending one for coins, no
 *     inventory change)
 *
 * Replace picker shows ALL active tokens sorted by ascending
 * bonus_fp so the cheapest-to-replace are at the top (per the
 * Phase 49 Wave 2 interview answer).
 *
 * On every resolve, fires `router.refresh()` indirectly via the
 * `onResolved` callback so the lineup page re-renders the new tray
 * count + balance.
 */

type Props = {
  /** Pending token ids from the just-completed pack reveal batch.
   *  Modal fetches their full info on mount. */
  pendingIds: string[];
  /** All currently-active (non-pending, non-consumed) tokens, used
   *  to populate the replace picker. Comes from lineup-view's
   *  `props.tokens` which already has `is_pending=false` rows. */
  activeTokens: LineupTokenVM[];
  /** Per-type quicksell payouts from `economy_config`. */
  sellValueByType: Record<string, number>;
  /** Called after a pending is resolved (keep_replace or
   *  quicksell_new). Caller typically calls `router.refresh()`. */
  onResolved: () => void;
  /** Called when the modal closes (all pending resolved or user
   *  bailed mid-flow — bailed pending tokens stay in DB; the modal
   *  re-opens on next pack open). */
  onClose: () => void;
};

export function TokenOverflowResolveModal({
  pendingIds,
  activeTokens,
  sellValueByType,
  onResolved,
  onClose,
}: Props) {
  const [pending, setPending] = useState<RevealedToken[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, startSubmit] = useTransition();
  // Per-pending replaced-id selection. Pre-populated to the cheapest
  // active token; user can override via the picker below.
  const [pickedReplacedId, setPickedReplacedId] = useState<string | null>(null);

  const open = pendingIds.length > 0;
  const current = pending[currentIndex] ?? null;
  const remaining = pending.length - currentIndex;

  // Fetch full info for the pending ids on mount.
  useEffect(() => {
    if (pendingIds.length === 0) {
      setPending([]);
      setLoadingDetails(false);
      return;
    }
    let cancelled = false;
    setLoadingDetails(true);
    (async () => {
      const res = await fetchRevealTokens({ ids: pendingIds });
      if (cancelled) return;
      if (res.ok) {
        // Filter to is_pending=true so already-resolved rows
        // (e.g. user closed + reopened) don't reappear.
        setPending(res.data.filter((t) => t.isPending));
      } else {
        toast.error(res.error.message);
        setPending([]);
      }
      setLoadingDetails(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingIds]);

  // Active tokens sorted by ascending bonus_fp — cheapest-to-replace
  // at the top (per interview answer). Memoized so the same picker
  // ordering survives re-renders mid-resolve.
  const sortedActive = useMemo(() => {
    return [...activeTokens]
      .filter((t) => t.appliedToCardId === null)
      .sort((a, b) => a.bonusFp - b.bonusFp);
  }, [activeTokens]);

  // Default the picker to the cheapest active token whenever the
  // current pending changes. User can override.
  useEffect(() => {
    if (!current) return;
    setPickedReplacedId(sortedActive[0]?.id ?? null);
  }, [current, sortedActive]);

  function handleKeepReplace() {
    if (!current || !pickedReplacedId) return;
    startSubmit(async () => {
      const res = await resolvePendingToken({
        action: "keep_replace",
        pendingTokenId: current.id,
        replacedTokenId: pickedReplacedId,
      });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      const replaced = activeTokens.find((t) => t.id === pickedReplacedId);
      const replacedLabel = replaced ? TOKEN_LONG_LABEL[replaced.tokenType] : "old token";
      toast.success(
        `Kept ${TOKEN_LONG_LABEL[current.tokenType as TokenType]}; sold ${replacedLabel} for ${res.data.coinsEarned} coins.`,
      );
      onResolved();
      advanceOrClose();
    });
  }

  function handleQuickSellNew() {
    if (!current) return;
    startSubmit(async () => {
      const res = await resolvePendingToken({
        action: "quicksell_new",
        pendingTokenId: current.id,
      });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(
        `Sold ${TOKEN_LONG_LABEL[current.tokenType as TokenType]} for ${res.data.coinsEarned} coins.`,
      );
      onResolved();
      advanceOrClose();
    });
  }

  function advanceOrClose() {
    if (currentIndex + 1 >= pending.length) {
      onClose();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  if (!open) return null;

  return (
    <Dialog
      open={open}
      // Block dismiss-by-overlay-click + Esc — user must resolve all
      // pending tokens. They can still close from the X corner button
      // but onClose triggers caller's bailout (pending stays in DB).
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Token cap reached · {remaining} to resolve</DialogTitle>
          <DialogDescription>
            Your token inventory is at cap. Pick a token to replace, or quick-sell the new one for
            coins.
          </DialogDescription>
        </DialogHeader>

        {loadingDetails ? (
          <div className="flex items-center justify-center py-8 text-sm text-[var(--text-3)]">
            Loading…
          </div>
        ) : current ? (
          <div className="flex flex-col gap-4">
            {/* The new (pending) token. */}
            <section className="flex items-center gap-3 rounded-lg border border-[#D4A647]/40 bg-[#D4A647]/5 px-3 py-3">
              <TokenBadge
                tokenType={current.tokenType as TokenType}
                bonusFp={current.bonusFp}
                size="tray"
                dim={false}
                isDragging={false}
              />
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#D4A647]">
                  New (pending)
                </span>
                <span className="font-sans text-sm font-bold text-[var(--text)]">
                  {TOKEN_LONG_LABEL[current.tokenType as TokenType]}
                </span>
                <span className="font-mono text-[11px] text-[var(--text-2)]">
                  +{current.bonusFp} FP per trigger
                </span>
              </div>
            </section>

            {/* Replace picker. */}
            {sortedActive.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-xs uppercase tracking-wider text-[var(--text-3)]">
                  Replace which token?
                </h3>
                <div className="flex max-h-[200px] flex-col gap-1 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-1">
                  {sortedActive.map((tk) => (
                    <button
                      key={tk.id}
                      type="button"
                      onClick={() => setPickedReplacedId(tk.id)}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[11px] transition-colors",
                        pickedReplacedId === tk.id
                          ? "bg-[var(--tier-gold)]/15 text-[var(--text)]"
                          : "text-[var(--text-2)] hover:bg-[var(--surface-3)]",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "font-mono text-[9px] uppercase tracking-wider",
                            pickedReplacedId === tk.id
                              ? "text-[var(--tier-gold)]"
                              : "text-[var(--text-3)]",
                          )}
                        >
                          {TOKEN_SHORT_LABEL[tk.tokenType]}
                        </span>
                        <span>{TOKEN_LONG_LABEL[tk.tokenType]}</span>
                        <span className="font-mono tabular-nums text-[var(--text-3)]">
                          +{tk.bonusFp}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-[var(--text-3)]">
                        <Coins className="size-3" aria-hidden="true" />
                        <span className="font-mono tabular-nums">
                          {sellValueByType[tk.tokenType] ?? 0}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-[var(--text-3)]">
            All resolved.
          </div>
        )}

        <DialogFooter className="flex flex-row justify-between gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={handleQuickSellNew}
            disabled={!current || submitting}
            className="flex-1"
          >
            <Coins className="mr-1 size-3.5" aria-hidden="true" />
            {current ? `Sell new (+${sellValueByType[current.tokenType] ?? 0})` : "Sell new"}
          </Button>
          <Button
            onClick={handleKeepReplace}
            disabled={!current || !pickedReplacedId || submitting}
            className="flex-1"
          >
            {currentIndex + 1 >= pending.length ? (
              <>
                Replace & finish
                <Check className="ml-1 size-3.5" aria-hidden="true" />
              </>
            ) : (
              <>
                Replace · next
                <ArrowRight className="ml-1 size-3.5" aria-hidden="true" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
