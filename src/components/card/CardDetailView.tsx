"use client";

import { Archive } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { vaultCardMidseason } from "@/app/actions/vault";
import { Card, type CardViewModel } from "@/components/card/Card";
import { DissolveCard } from "@/components/card/DissolveCard";
import { ExtendContractModal } from "@/components/card/ExtendContractModal";
import { QuickSellModal } from "@/components/card/QuickSellModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { nextTier, TIER_FRAME, TIERS } from "@/lib/card/tiers";
import { type CardTier, TIER_LABEL } from "@/lib/contracts/cards";

export type CardDetailData = {
  card: CardViewModel & {
    tierFpThresholds: Record<CardTier, number>;
    quickSellValue: number;
    extensionCount: number;
    tokensApplied: number;
    tokensTriggered: number;
    acquiredAt: string;
  };
  coinBalance: number;
  extensionCostPerPlay: Record<CardTier, number>;
  extensionEscalator: number;
};

export function CardDetailView({ data }: { data: CardDetailData }) {
  const router = useRouter();
  const [dissolving, setDissolving] = useState(false);
  const [vaulting, startVault] = useTransition();

  function handleVault() {
    startVault(async () => {
      const res = await vaultCardMidseason({ cardId: data.card.id });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success("Added to vault.");
      router.push("/vault");
      router.refresh();
    });
  }

  const { card } = data;
  const frame = TIER_FRAME[card.tier];
  const next = nextTier(card.tier);
  const currentFp = Math.round(card.careerFp);
  const nextThreshold = next ? card.tierFpThresholds[next] : null;
  const previousThreshold = card.tierFpThresholds[card.tier];
  const progressPct =
    next && nextThreshold
      ? Math.min(
          100,
          Math.max(
            0,
            ((currentFp - previousThreshold) / (nextThreshold - previousThreshold)) * 100,
          ),
        )
      : 100;

  const successRate =
    card.tokensApplied > 0 ? Math.round((card.tokensTriggered / card.tokensApplied) * 100) : null;

  return (
    <div className="flex flex-col gap-4 px-2 py-3">
      {/* Hero — medium card (160x224) fits the 288px sidebar with
          margin. Polish spec §33. */}
      <div className="flex flex-col items-center gap-3">
        <DissolveCard
          active={dissolving}
          onComplete={() => {
            router.push("/collection");
            router.refresh();
          }}
        >
          <Card card={card} size="medium" />
        </DissolveCard>
      </div>

      {/* Info panel — single scrollable column below the card. */}
      <section className="flex flex-col gap-4">
        <header className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-bold font-sans text-[var(--text)] text-lg tracking-tight">
              {card.playerName}
            </h1>
            {card.position && (
              <Badge variant="outline" className="uppercase tracking-wider">
                {card.position}
              </Badge>
            )}
            {card.teamAbbreviation && (
              <Badge variant="outline" className="uppercase tracking-wider">
                {card.teamAbbreviation}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[var(--text-2)] text-xs">
            <span
              className="rounded px-2 py-0.5 font-bold text-[10px] uppercase tracking-wider"
              style={{ backgroundColor: frame.accent, color: "var(--bg)" }}
            >
              {TIER_LABEL[card.tier]}
            </span>
            <span className="font-mono">
              Contract {card.contractPlays}/{card.contractMax}
            </span>
            {card.extensionCount > 0 && (
              <span className="text-[var(--text-3)]">· {card.extensionCount} ext.</span>
            )}
          </div>
        </header>

        <Tabs defaultValue="overview" className="flex flex-col gap-3">
          <TabsList className="w-full">
            <TabsTrigger value="overview" className="flex-1 text-xs">
              Overview
            </TabsTrigger>
            <TabsTrigger value="tokens" className="flex-1 text-xs">
              Tokens
            </TabsTrigger>
            <TabsTrigger value="log" className="flex-1 text-xs">
              Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex flex-col gap-4">
            <section>
              <div className="mb-1 flex items-end justify-between">
                <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
                  Career FP
                </span>
                <span className="font-mono text-2xl font-bold text-[var(--text)]">
                  {currentFp.toLocaleString()}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${progressPct}%`,
                    backgroundColor: frame.accent,
                  }}
                />
              </div>
              {next && nextThreshold ? (
                <p className="mt-1 text-xs text-[var(--text-3)]">
                  {(nextThreshold - currentFp).toLocaleString()} FP to {TIER_LABEL[next]}
                </p>
              ) : (
                <p className="mt-1 text-xs text-[var(--text-3)]">Max tier reached.</p>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-xs uppercase tracking-wider text-[var(--text-3)]">Status</h3>
              <p className="text-sm text-[var(--text-2)]">
                {card.isExpired
                  ? "Expired — extend the contract to play this card again."
                  : card.playerStatus === "il"
                    ? "On the injured list; ineligible until cleared."
                    : card.playerStatus === "dfa"
                      ? "Designated for assignment."
                      : card.playerStatus === "retired"
                        ? "Retired — locked from play."
                        : "Active and playable."}
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Actions</h3>
              <div className="flex flex-col gap-2">
                <div>
                  <ExtendContractModal
                    cardId={card.id}
                    playerName={card.playerName}
                    tier={card.tier}
                    extensionCount={card.extensionCount}
                    contractPlays={card.contractPlays}
                    coinBalance={data.coinBalance}
                    extensionCostPerPlay={data.extensionCostPerPlay}
                    extensionEscalator={data.extensionEscalator}
                    disabled={card.hasAppliedToken}
                    onExtended={() => {
                      router.refresh();
                    }}
                  />
                </div>
                <div>
                  <QuickSellModal
                    cardId={card.id}
                    playerName={card.playerName}
                    tier={card.tier}
                    quickSellValue={card.quickSellValue}
                    hasAppliedToken={card.hasAppliedToken}
                    onSold={() => {
                      // Dissolve the Large card, then navigate when the
                      // animation completes (via DissolveCard.onComplete).
                      setDissolving(true);
                    }}
                  />
                </div>
              </div>
              {card.hasAppliedToken && (
                <p className="text-xs text-[var(--text-3)]">
                  Remove the applied token before quick-selling or extending.
                </p>
              )}
              <div className="flex items-stretch gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleVault}
                  disabled={vaulting || card.isExpired || card.hasAppliedToken}
                  title={
                    card.isExpired
                      ? "Expired cards can't be vaulted"
                      : card.hasAppliedToken
                        ? "Remove the applied token first"
                        : "Freeze this card into the season vault"
                  }
                >
                  <Archive className="mr-1 size-4" aria-hidden="true" />
                  {vaulting ? "Vaulting…" : "Add to vault"}
                </Button>
              </div>
              <p className="text-xs text-[var(--text-3)]">
                Vaulting freezes a card for the season — it can't play again. Counts toward the
                10-card vault cap. Destroying a vaulted card returns ~15% of its quick-sell value.
              </p>
            </section>
          </TabsContent>

          <TabsContent value="tokens" className="flex flex-col gap-3">
            <dl className="grid grid-cols-3 gap-2">
              <Stat label="Applied" value={card.tokensApplied.toLocaleString()} />
              <Stat label="Triggered" value={card.tokensTriggered.toLocaleString()} />
              <Stat label="Rate" value={successRate === null ? "—" : `${successRate}%`} />
            </dl>
            <p className="text-xs text-[var(--text-3)]">
              Per-type breakdown lands with live contests in Phase 3.
            </p>
          </TabsContent>

          <TabsContent value="log" className="flex flex-col gap-3">
            <p className="text-sm text-[var(--text-2)]">
              Per-game FP log lands with live contests in Phase 3.
            </p>
          </TabsContent>
        </Tabs>

        <footer className="flex flex-col gap-0.5 text-[10px] text-[var(--text-3)]">
          <span>Tiers: {TIERS.map((t) => TIER_LABEL[t]).join(" → ")}</span>
          <span>Acquired {new Date(card.acquiredAt).toLocaleDateString()}</span>
        </footer>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-bold text-[var(--text)]">{value}</dd>
    </div>
  );
}
