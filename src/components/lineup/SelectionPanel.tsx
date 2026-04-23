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
import type { CardTier } from "@/lib/contracts/cards";
import type { LineupCardVM } from "@/lib/lineup/types";
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
  /** True when the cards can currently be quick-sold / vaulted
   *  (building state or mid-season). False disables the action
   *  buttons with an explainer line. */
  canAct: boolean;
  onQuickSell: () => void | Promise<void>;
  onAddToVault: () => void | Promise<void>;
  onClear: () => void;
  /** Toggled during a bulk action; disables the action buttons so
   *  users don't double-click. */
  submitting: boolean;
};

export function SelectionPanel(props: Props) {
  const { selectedCards, quickSellTotal, lineupCount, canAct, submitting } = props;
  const [dialog, setDialog] = useState<"quickSell" | "vault" | null>(null);

  const actionDisabled = selectedCards.length === 0 || submitting || !canAct;

  return (
    <aside className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex flex-col gap-1 border-b border-[var(--border)] pb-3">
        <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">Selection</span>
        <div className="font-mono text-2xl font-bold tabular-nums text-[var(--text)]">
          {selectedCards.length} selected
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-[var(--text-2)]">
          <span>
            <span className="font-mono text-[var(--text)]">{quickSellTotal}</span>{" "}
            <span className="text-[var(--text-3)]">coins quick-sell</span>
          </span>
          {lineupCount > 0 && <span className="text-[#D4A647]">{lineupCount} in lineup</span>}
        </div>
      </header>

      <SidebarSection title="Cards" className="min-h-0 flex-1">
        {selectedCards.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--text-3)]">
            Click cards in the grid to add them.
          </div>
        ) : (
          <ol
            data-scroll="selection-list"
            className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
          >
            {selectedCards.map((card) => (
              <SelectionRow key={card.id} card={card} />
            ))}
          </ol>
        )}
      </SidebarSection>

      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
        <Button
          variant="default"
          onClick={() => setDialog("quickSell")}
          disabled={actionDisabled}
          className="w-full"
        >
          Quick-sell ({quickSellTotal} coins)
        </Button>
        <Button
          variant="outline"
          onClick={() => setDialog("vault")}
          disabled={actionDisabled}
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
              Quick-sell {selectedCards.length} card{selectedCards.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll earn{" "}
              <span className="font-mono text-[var(--text)]">{quickSellTotal}</span> coins.
              Quick-sell is permanent — sold cards can&apos;t be recovered.
              {lineupCount > 0 && (
                <>
                  {" "}
                  <span className="text-[#D4A647]">
                    {lineupCount} of these {lineupCount === 1 ? "is" : "are"} in your lineup and
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
        {card.contractPlays}/{card.contractMax}
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
