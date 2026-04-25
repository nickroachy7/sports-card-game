"use client";

import { useState } from "react";

import { SidebarSection } from "@/components/layout/sidebar-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatContract } from "@/lib/card/tiers";
import type { CardTier } from "@/lib/contracts/cards";
import type { LineupCardVM, LineupTokenVM } from "@/lib/lineup/types";
import { TOKEN_LONG_LABEL, TOKEN_SHORT_LABEL } from "@/lib/token/display";
import { cn } from "@/lib/utils";

/**
 * Polish spec §104 (Phase 35). Selection panel that swaps into the
 * sidebar when multi-select mode is active on the cards grid. Shows
 * a count, running totals, the list of selected players, and the
 * bulk action buttons (Quick-sell, Add to vault, Clear).
 *
 * Display priority in LineupView's sidebar:
 *   1. selectMode === true         → <SelectionPanel />
 *   2. detailCardId in URL         → <DetailSidebar />
 *   3. otherwise                   → <AppSidebar />
 */

type Props = {
  /** All selected card view-models (ordered by selection order). */
  selectedCards: LineupCardVM[];
  /** Sum of quick-sell value across selected cards (coins). */
  quickSellTotal: number;
  /** How many of the selected cards are currently slotted in the
   *  lineup. Drives the warning copy in the quick-sell dialog. */
  lineupCount: number;
  /** True when the cards/tokens can currently be quick-sold /
   *  vaulted (building state or mid-season). False disables the
   *  action buttons with an explainer line. */
  canAct: boolean;
  onQuickSell: () => void | Promise<void>;
  onAddToVault: () => void | Promise<void>;
  onClear: () => void;
  /** Toggled during a bulk action; disables the action buttons so
   *  users don't double-click. */
  submitting: boolean;
  /**
   * Polish spec §201 (Phase 49 Wave 1.1). Tokens selected in the
   * same select-mode session. Cards + tokens share a single Quick-
   * sell button; vault stays cards-only.
   */
  selectedTokens: LineupTokenVM[];
  /** Sum of quick-sell value across selected tokens (coins). */
  tokenQuickSellTotal: number;
};

export function SelectionPanel(props: Props) {
  const {
    selectedCards,
    quickSellTotal,
    lineupCount,
    canAct,
    submitting,
    selectedTokens,
    tokenQuickSellTotal,
  } = props;
  const [dialog, setDialog] = useState<"quickSell" | "vault" | null>(null);

  // §201 — total selection includes both cards and tokens. Quick-sell
  // acts on both; vault stays cards-only.
  const totalSelected = selectedCards.length + selectedTokens.length;
  const combinedSellTotal = quickSellTotal + tokenQuickSellTotal;
  const actionDisabled = totalSelected === 0 || submitting || !canAct;
  const vaultDisabled = selectedCards.length === 0 || submitting || !canAct;

  return (
    <aside className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex flex-col gap-1 border-b border-[var(--border)] pb-3">
        <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">Selection</span>
        <div className="font-mono text-2xl font-bold tabular-nums text-[var(--text)]">
          {totalSelected} selected
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-[var(--text-2)]">
          <span>
            <span className="font-mono text-[var(--text)]">{combinedSellTotal}</span>{" "}
            <span className="text-[var(--text-3)]">coins quick-sell</span>
          </span>
          {lineupCount > 0 && <span className="text-[#D4A647]">{lineupCount} in lineup</span>}
          {selectedCards.length > 0 && selectedTokens.length > 0 && (
            <span className="text-[var(--text-3)]">
              · {selectedCards.length} card{selectedCards.length === 1 ? "" : "s"} +{" "}
              {selectedTokens.length} token{selectedTokens.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {selectedCards.length > 0 && (
          <SidebarSection title={`Cards (${selectedCards.length})`}>
            <ol className="flex flex-col gap-0.5">
              {selectedCards.map((card) => (
                <SelectionRow key={card.id} card={card} />
              ))}
            </ol>
          </SidebarSection>
        )}
        {selectedTokens.length > 0 && (
          <SidebarSection title={`Tokens (${selectedTokens.length})`}>
            <ol className="flex flex-col gap-0.5">
              {selectedTokens.map((tk) => (
                <TokenSelectionRow key={tk.id} token={tk} />
              ))}
            </ol>
          </SidebarSection>
        )}
        {totalSelected === 0 && (
          <div className="flex h-full items-center justify-center text-center text-xs text-[var(--text-3)]">
            Click cards in the grid or token chips in the tray to add them.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
        <Button
          variant="default"
          onClick={() => setDialog("quickSell")}
          disabled={actionDisabled}
          className="w-full"
        >
          Quick-sell ({combinedSellTotal} coins)
        </Button>
        <Button
          variant="outline"
          onClick={() => setDialog("vault")}
          disabled={vaultDisabled}
          className="w-full"
        >
          Add to vault ({selectedCards.length})
        </Button>
        {!canAct && selectedCards.length > 0 && (
          <p className="text-[10px] text-[var(--text-3)]">
            Bulk actions disabled while the contest is locked.
          </p>
        )}
        <Button
          variant="ghost"
          onClick={props.onClear}
          disabled={submitting}
          className="w-full text-[var(--text-2)]"
        >
          Clear
        </Button>
      </div>

      <AlertDialog open={dialog === "quickSell"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Quick-sell {totalSelected} item{totalSelected === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCards.length > 0 && selectedTokens.length > 0 ? (
                <>
                  {selectedCards.length} card{selectedCards.length === 1 ? "" : "s"} +{" "}
                  {selectedTokens.length} token{selectedTokens.length === 1 ? "" : "s"} for{" "}
                  <span className="font-mono text-[var(--text)]">{combinedSellTotal}</span> coins.
                </>
              ) : selectedTokens.length > 0 ? (
                <>
                  You&apos;ll earn{" "}
                  <span className="font-mono text-[var(--text)]">{tokenQuickSellTotal}</span> coins.
                </>
              ) : (
                <>
                  You&apos;ll earn{" "}
                  <span className="font-mono text-[var(--text)]">{quickSellTotal}</span> coins.
                </>
              )}{" "}
              Quick-sell is permanent — sold items can&apos;t be recovered.
              {lineupCount > 0 && (
                <>
                  {" "}
                  <span className="text-[#D4A647]">
                    {lineupCount} of the cards {lineupCount === 1 ? "is" : "are"} in your lineup and
                    will be removed.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setDialog(null);
                await props.onQuickSell();
              }}
            >
              Quick-sell
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "vault"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Vault {selectedCards.length} card{selectedCards.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vaulting freezes a card for the rest of the season — it can&apos;t be played again
              until next year. The vault holds up to 10 cards total.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setDialog(null);
                await props.onAddToVault();
              }}
            >
              Add to vault
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

function SelectionRow({ card }: { card: LineupCardVM }) {
  return (
    <li className="grid grid-cols-[2rem_1fr_auto_3rem] items-baseline gap-1 text-[11px]">
      <span className="font-mono text-[var(--text-3)]">{card.position ?? "—"}</span>
      <span className="min-w-0 truncate text-[var(--text-2)]">{card.playerName}</span>
      <TierChip tier={card.tier} />
      <span
        className={cn(
          "text-right font-mono tabular-nums",
          card.contractPlays <= 2 ? "text-[#D4A647]" : "text-[var(--text-3)]",
        )}
      >
        {formatContract(card.contractPlays, card.tier, "compact")}
      </span>
    </li>
  );
}

function TierChip({ tier }: { tier: CardTier }) {
  return (
    <span
      className="font-mono text-[9px] uppercase tracking-wider"
      style={{ color: `var(--tier-${tier})` }}
    >
      {tier.charAt(0).toUpperCase()}
    </span>
  );
}

/** Polish spec §201 — selected-token row in the SelectionPanel. */
function TokenSelectionRow({ token }: { token: LineupTokenVM }) {
  return (
    <li className="grid grid-cols-[2.25rem_1fr_auto] items-baseline gap-1 text-[11px]">
      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--tier-gold)]">
        {TOKEN_SHORT_LABEL[token.tokenType]}
      </span>
      <span className="min-w-0 truncate text-[var(--text-2)]">
        {TOKEN_LONG_LABEL[token.tokenType]}
      </span>
      <span className="text-right font-mono tabular-nums text-[var(--text-3)]">
        +{token.bonusFp} FP
      </span>
    </li>
  );
}
