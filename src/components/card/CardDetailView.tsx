"use client";

import { Archive, HelpCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { vaultCardMidseason } from "@/app/actions/vault";
import { Card, type CardViewModel } from "@/components/card/Card";
import { DissolveCard } from "@/components/card/DissolveCard";
import { QuickSellModal } from "@/components/card/QuickSellModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cardVaultMultiplier, formatContract, nextTier, TIER_FRAME, TIERS } from "@/lib/card/tiers";
import { type CardTier, TIER_LABEL } from "@/lib/contracts/cards";

export type CardDetailData = {
  card: CardViewModel & {
    tierFpThresholds: Record<CardTier, number>;
    quickSellValue: number;
    playsUsed: number;
    tokensApplied: number;
    tokensTriggered: number;
    acquiredAt: string;
  };
  coinBalance: number;
};

/**
 * Polish spec §106 (Phase 35). CardDetailView is lineup-only after
 * /collection was removed in Phase 32 — there's no other caller.
 * LineupContext lets the detail render Remove-from-slot as a first-
 * class Actions button when the card is currently rostered. Prior
 * to Phase 35, Remove-from-slot lived in a separate "Lineup Actions"
 * footer in CardDetailPanel, which duplicated the Add-to-vault
 * button; that footer was deleted and Remove-from-slot folded in
 * here.
 */
export type CardDetailLineupContext = {
  slotted: boolean;
  onRemoveFromSlot: () => Promise<void> | void;
  removing?: boolean;
};

export function CardDetailView({
  data,
  lineupContext,
}: {
  data: CardDetailData;
  lineupContext?: CardDetailLineupContext;
}) {
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
              Contract {formatContract(card.contractPlays, card.tier)}
            </span>
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
                  ? "Expired — tier-up refills plays to the new tier's budget."
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
              {/* Polish spec §106 (Phase 35). One Actions block, all
                  outline-variant buttons for equal visual weight. P41
                  retired "Extend Contract" — plays refill automatically
                  on tier-up, so the button went with the feature.
                  Order: Remove-from-slot (if slotted) → Quick-sell →
                  Add-to-vault (with inline vault-score preview §135). */}
              <div className="flex flex-col gap-2">
                {lineupContext?.slotted && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => lineupContext.onRemoveFromSlot()}
                    disabled={lineupContext.removing}
                  >
                    <X className="mr-1 size-4" aria-hidden="true" />
                    {lineupContext.removing ? "Removing…" : "Remove from slot"}
                  </Button>
                )}
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
                {/* P41 polish follow-up: the vault-score preview sits
                    directly above the Add-to-vault button so the number
                    is visible at the decision point. Replaces the
                    standalone VaultScorePreview block (felt bulky in
                    the sidebar and lived away from the action). */}
                <InlineVaultScore
                  playsUsed={card.playsUsed}
                  careerFp={currentFp}
                  accent={frame.accent}
                />
                <div className="flex items-stretch gap-1">
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
                  {/* Polish spec §106 — vault explainer collapsed
                      behind an inline (i). Native <details> keeps
                      this accessible with zero extra deps. */}
                  <VaultHelpToggle />
                </div>
              </div>
              {card.hasAppliedToken && (
                <p className="text-xs text-[var(--text-3)]">
                  Remove the applied token before quick-selling or vaulting.
                </p>
              )}
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

/**
 * Polish spec §106 (Phase 35). Collapsible (?) next to Add-to-vault.
 * Native <details>/<summary> so it's accessible, keyboard-friendly,
 * and needs no extra UI primitives. Click the icon to toggle a
 * small panel beneath the Add-to-vault button with the vault
 * explainer. Previously this paragraph sat always-visible below
 * the button.
 */
/**
 * Polish spec §135 (Phase 41). Shows the vault score the card would
 * snapshot at if vaulted right now. The multiplier celebrates peak
 * single-game performance: 1 play × high FP = rare, 21+ plays = 1×.
 *
 * `vaultScore = careerFp × cardVaultMultiplier(playsUsed)`. Static
 * lookup on the client — the multiplier curve lives in two places
 * (SQL fn `card_vault_multiplier` and TS `cardVaultMultiplier`) and
 * must stay synced (§133).
 */
/**
 * Polish spec §135 (Phase 41). Compact vault-score preview rendered
 * directly above the Add-to-vault button. Single-line decision aid:
 * big score on the right, formula breakdown on the left, short warning
 * copy below for the unplayed edge case (multiplier = 0).
 *
 * Replaces the standalone VaultScorePreview block — the score belongs
 * next to the action, not off in its own section.
 */
function InlineVaultScore({
  playsUsed,
  careerFp,
  accent,
}: {
  playsUsed: number;
  careerFp: number;
  accent: string;
}) {
  const multiplier = cardVaultMultiplier(playsUsed);
  const vaultScore = Math.round(careerFp * multiplier);
  const unplayed = playsUsed === 0;

  return (
    <div
      className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
      title={
        unplayed
          ? "Played 0 games — vault multiplier is 0×. Play the card at least once to earn a score."
          : `Played in ${playsUsed} ${playsUsed === 1 ? "game" : "games"} · multiplier ${multiplier.toFixed(1)}×`
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
          Would vault at
        </span>
        <span
          className="font-bold font-mono text-lg leading-none"
          style={{ color: unplayed ? "var(--text-3)" : accent }}
        >
          {vaultScore.toLocaleString()}
        </span>
      </div>
      <span className="font-mono text-[10px] text-[var(--text-3)]">
        {careerFp.toLocaleString()} FP × {multiplier.toFixed(1)}×
        {unplayed && " · play it once to earn a multiplier"}
      </span>
    </div>
  );
}

function VaultHelpToggle() {
  return (
    <details className="group relative flex items-center">
      <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-3)] transition-colors hover:border-[var(--text-2)] hover:text-[var(--text-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-2)] [&::-webkit-details-marker]:hidden">
        <HelpCircle className="size-4" aria-hidden="true" />
        <span className="sr-only">Vault info</span>
      </summary>
      <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text-2)] shadow-lg">
        Vaulting freezes a card for the season — it can&apos;t play again. Counts toward the 10-card
        vault cap. Destroying a vaulted card returns ~15% of its quick-sell value.
      </div>
    </details>
  );
}
