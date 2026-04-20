"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { quickSellCard } from "@/app/actions/cards";
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
import { type CardTier, TIER_LABEL } from "@/lib/contracts/cards";

type Props = {
  cardId: string;
  playerName: string;
  tier: CardTier;
  quickSellValue: number;
  hasAppliedToken: boolean;
  disabled?: boolean;
  onSold?: (result: { coinsEarned: number; balanceAfter: number }) => void;
};

/**
 * UI/UX spec §4.13.1 — Silver+ cards require confirm; Diamond gets a
 * stronger warning. Tokens applied → button disabled with helper text.
 */
export function QuickSellModal({
  cardId,
  playerName,
  tier,
  quickSellValue,
  hasAppliedToken,
  disabled,
  onSold,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const needsConfirm = tier !== "bronze";
  const isDiamond = tier === "diamond";

  function handleSold() {
    startTransition(async () => {
      const result = await quickSellCard({ cardId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Sold for ${result.data.coinsEarned.toLocaleString()} coins.`);
      onSold?.(result.data);
      setOpen(false);
    });
  }

  if (!needsConfirm) {
    // Bronze — no confirmation; still show the button for the Detail view.
    return (
      <Button
        variant="outline"
        onClick={handleSold}
        disabled={disabled || hasAppliedToken || pending}
        className="w-full"
      >
        {pending ? "Selling…" : `Quick-sell (${quickSellValue.toLocaleString()} coins)`}
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled || hasAppliedToken || pending}
        className="w-full"
      >
        Quick-sell ({quickSellValue.toLocaleString()} coins)
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Quick-sell {playerName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This {TIER_LABEL[tier]} card is worth{" "}
            <span className="font-mono font-semibold text-[var(--text)]">
              {quickSellValue.toLocaleString()} coins
            </span>
            . Selling is permanent.
            {isDiamond && (
              <>
                <br />
                <span className="mt-2 block font-semibold text-[var(--tier-diamond,#A8DDE2)]">
                  Diamond cards are eligible for the end-of-season Vault — selling forfeits that.
                </span>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep card</AlertDialogCancel>
          <AlertDialogAction onClick={handleSold} disabled={pending}>
            {pending ? "Selling…" : "Sell"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
