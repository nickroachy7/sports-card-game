"use client";

import { ArrowLeft, Coins } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { quickSellToken } from "@/app/actions/tokens";
import { TokenBadge } from "@/components/token/TokenBadge";
import { Button } from "@/components/ui/button";
import type { LineupTokenVM } from "@/lib/lineup/types";
import { TOKEN_LONG_LABEL, tokenRuleText } from "@/lib/token/display";

type Props = {
  /** The token currently selected (read from URL `?token=...`). */
  token: LineupTokenVM;
  /** Sell value in coins for this token's type, from economy_config. */
  sellValue: number;
  /** When true, contest is locked / token is applied — quick-sell disabled. */
  disableQuickSell: boolean;
  /** Optional reason text shown on disabled quick-sell button. */
  disableReason?: string | null;
  /** Called after a successful quick-sell so the caller can refresh. */
  onSold?: () => void;
  /** Called when the user wants to close the detail view. */
  onClose: () => void;
};

/**
 * Polish spec §195 (Phase 49). Sidebar token detail. Mirrors
 * `CardDetailPanel`'s layout pattern: ArrowLeft "Back" header, then
 * a body that shows the token's identity (badge + label + rule
 * text) followed by an Actions section housing the quick-sell
 * button.
 *
 * Reads token data from props (no fetch) since the lineup page
 * already has the full LineupTokenVM in `tokensById`. The lineup-
 * view passes the resolved token + the sell-value lookup via
 * config-driven props.
 */
export function TokenDetailPanel({
  token,
  sellValue,
  disableQuickSell,
  disableReason,
  onSold,
  onClose,
}: Props) {
  const [isSelling, startSell] = useTransition();
  const longLabel = TOKEN_LONG_LABEL[token.tokenType];
  const ruleCopy = tokenRuleText(token.tokenType, token.bonusFp);

  function handleQuickSell() {
    startSell(async () => {
      const res = await quickSellToken({ tokenId: token.id });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(`Sold ${longLabel} token for ${res.data.coinsEarned} coins.`);
      onSold?.();
      onClose();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="-ml-2 flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-7 gap-1 px-2 text-[var(--text-2)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
        {/* Identity block: badge + label + bonus chip + rule. */}
        <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-5">
          <TokenBadge
            tokenType={token.tokenType}
            bonusFp={token.bonusFp}
            size="tray"
            dim={false}
            isDragging={false}
          />
          <div className="flex flex-col items-center gap-1">
            <h2 className="font-sans text-base font-bold tracking-tight text-[var(--text)]">
              {longLabel}
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--tier-gold)]">
              +{token.bonusFp} FP
            </span>
          </div>
          <p className="text-center text-[12px] leading-snug text-[var(--text-2)]">{ruleCopy}</p>
        </div>

        {/* Actions block: quick-sell. */}
        <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-3)]">Actions</h3>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
              Wave 1
            </span>
          </div>
          <Button
            variant="outline"
            onClick={handleQuickSell}
            disabled={disableQuickSell || isSelling}
            className="justify-between"
          >
            <span className="flex items-center gap-2">
              <Coins className="size-3.5" aria-hidden="true" />
              {isSelling ? "Selling…" : "Quick-sell"}
            </span>
            <span className="font-mono text-[var(--tier-gold)]">+{sellValue}</span>
          </Button>
          {disableReason && (
            <p className="text-[11px] leading-snug text-[var(--text-3)]">{disableReason}</p>
          )}
        </section>
      </div>
    </div>
  );
}
