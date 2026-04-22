"use client";

import { useState } from "react";

import type { RevealedCard } from "@/app/actions/packs-reveal";
import { PackCardFlip } from "@/components/pack/PackCardFlip";
import { PackDupePanel } from "@/components/pack/PackDupePanel";
import { StarPullBurst } from "@/components/pack/StarPullBurst";
import type { CardTier, PlayerStatus } from "@/lib/contracts/cards";

/**
 * /palette preview of the pack reveal vocabulary — demos the flip,
 * the two celebration variants (star / starter), and the dupe panel
 * without requiring a real pack purchase.
 */

type Props = Record<string, never>;

function mock(
  overrides: Partial<RevealedCard> & {
    tier?: CardTier;
    valueTier?: RevealedCard["playerValueTier"];
  } = {},
): RevealedCard {
  const { tier = "bronze", valueTier = "role", ...rest } = overrides;
  return {
    id: Math.random().toString(36).slice(2),
    playerName: "Jose Caballero",
    position: "Shortstop",
    teamAbbreviation: "NYY",
    tier,
    careerFp: 0,
    contractPlays: 15,
    contractMax: 15,
    playerStatus: "active" as PlayerStatus,
    isExpired: false,
    hasAppliedToken: false,
    photoUrl: null,
    playerValueTier: valueTier,
    quickSellValue: tier === "bronze" ? 10 : tier === "silver" ? 50 : tier === "gold" ? 200 : 1000,
    ...rest,
  };
}

export function PackRevealDemo(_: Props) {
  const [flipState, setFlipState] = useState({
    role: false,
    star: false,
    starter: false,
  });
  const [celebration, setCelebration] = useState<"star" | "starter" | null>(null);

  function triggerFlip(key: "role" | "star" | "starter") {
    setFlipState((s) => ({ ...s, [key]: true }));
    if (key === "star") {
      setCelebration("star");
      window.setTimeout(() => setCelebration((c) => (c === "star" ? null : c)), 900);
    } else if (key === "starter") {
      setCelebration("starter");
      window.setTimeout(() => setCelebration((c) => (c === "starter" ? null : c)), 450);
    }
  }

  function resetFlip(key: "role" | "star" | "starter") {
    setFlipState((s) => ({ ...s, [key]: false }));
    setCelebration(null);
  }

  const dupeNew = mock({ tier: "bronze", valueTier: "starter", contractPlays: 15 });
  const dupeExisting = mock({
    tier: "gold",
    valueTier: "starter",
    careerFp: 5400,
    contractPlays: 7,
    contractMax: 15,
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Flip variants — tap each to preview. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FlipDemo
          label="Role / Prospect — no celebration"
          card={mock({ valueTier: "role" })}
          faceUp={flipState.role}
          onFlip={() => triggerFlip("role")}
          onReset={() => resetFlip("role")}
          celebrationTier="role"
          celebrating={false}
        />
        <FlipDemo
          label="Starter — small celebration"
          card={mock({ valueTier: "starter", playerName: "Brandon Lowe" })}
          faceUp={flipState.starter}
          onFlip={() => triggerFlip("starter")}
          onReset={() => resetFlip("starter")}
          celebrationTier="starter"
          celebrating={celebration === "starter"}
        />
        <FlipDemo
          label="Star — full celebration"
          card={mock({ valueTier: "star", playerName: "Aaron Judge", teamAbbreviation: "NYY" })}
          faceUp={flipState.star}
          onFlip={() => triggerFlip("star")}
          onReset={() => resetFlip("star")}
          celebrationTier="star"
          celebrating={celebration === "star"}
        />
      </div>

      {/* Dupe panel. */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">Dupe panel</span>
        <div className="mt-4 flex justify-center">
          <PackDupePanel
            newCard={dupeNew}
            existingCard={dupeExisting}
            pending={false}
            onKeepNew={() => {}}
            onKeepExisting={() => {}}
          />
        </div>
      </div>
    </div>
  );
}

function FlipDemo({
  label,
  card,
  faceUp,
  onFlip,
  onReset,
  celebrationTier,
  celebrating,
}: {
  label: string;
  card: RevealedCard;
  faceUp: boolean;
  onFlip: () => void;
  onReset: () => void;
  celebrationTier: RevealedCard["playerValueTier"];
  celebrating: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">{label}</span>
      <StarPullBurst active={celebrating} tier={celebrationTier}>
        <PackCardFlip card={card} faceUp={faceUp} onFlip={onFlip} />
      </StarPullBurst>
      <button
        type="button"
        onClick={onReset}
        className="text-[11px] text-[var(--text-3)] underline-offset-2 hover:text-[var(--text-2)] hover:underline"
      >
        Reset
      </button>
    </div>
  );
}
