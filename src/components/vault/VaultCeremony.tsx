"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { commitVaultSelection } from "@/app/actions/vault";
import type { CardTier } from "@/lib/contracts/cards";
import type { VaultCeremonyPreview, VaultEligibleCard } from "@/lib/contracts/vault";

const TIER_COLOR: Record<CardTier, string> = {
  bronze: "var(--tier-bronze)",
  silver: "var(--tier-silver)",
  gold: "var(--tier-gold)",
  diamond: "var(--tier-diamond)",
};

type Props = {
  seasonId: string;
  seasonYear: number;
  teamName: string;
  teamColorPrimary: string;
  teamColorSecondary: string;
  preview: VaultCeremonyPreview;
};

type Step = "title" | "recap" | "selection" | "dissolve" | "done";

const MILESTONE_LABELS: Record<string, string> = {
  hits: "Team Hits",
  home_runs: "Team Home Runs",
  stolen_bases: "Team Stolen Bases",
  pitching_wins: "Team Pitching Wins",
};

function initials(fullName: string): string {
  return fullName
    .split(" ")
    .map((p) => p[0] ?? "")
    .slice(0, 2)
    .join("");
}

function CardThumb({
  card,
  selected,
  dissolving,
  onToggle,
}: {
  card: VaultEligibleCard;
  selected: boolean;
  dissolving?: boolean;
  onToggle?: () => void;
}) {
  const color = TIER_COLOR[card.current_tier];
  const position = card.positions?.[0] ?? "";
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={dissolving}
      className={`flex flex-col items-center gap-1 rounded-md transition ${
        dissolving ? "pointer-events-none opacity-0" : "hover:scale-[1.03]"
      }`}
      style={{ transitionDuration: dissolving ? "2500ms" : "180ms" }}
    >
      <div
        className="flex flex-col overflow-hidden rounded-md border-2 bg-[var(--surface-2)]"
        style={{
          borderColor: selected ? "#f5f1e8" : color,
          boxShadow: selected ? "0 0 0 3px rgba(245, 241, 232, 0.3)" : undefined,
          width: 96,
          height: 134,
        }}
      >
        <div className="flex flex-1 items-center justify-center text-[var(--text-3)]">
          <span className="font-mono text-[10px] uppercase tracking-wider">
            {initials(card.full_name)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 bg-[var(--surface)] px-1.5 py-1">
          <span className="truncate text-[10px] font-semibold leading-tight text-[var(--text)]">
            {card.full_name}
          </span>
          <div className="flex items-center justify-between text-[9px] text-[var(--text-3)]">
            <span className="font-mono">{position.slice(0, 3).toUpperCase()}</span>
            <span className="font-mono">{Number(card.career_fp_total).toFixed(0)} FP</span>
          </div>
        </div>
      </div>
      <span
        className="font-mono text-[10px] uppercase tracking-wider"
        style={{ color: selected ? "#f5f1e8" : color }}
      >
        {selected ? "Vault" : "Dissolve"}
      </span>
    </button>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">{label}</span>
      <span className="font-mono text-xl tabular-nums text-[var(--text)]">{value}</span>
    </div>
  );
}

export function VaultCeremony(props: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("title");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { preview } = props;
  const { recap, eligibleCards } = preview;
  const selectedArray = [...selected];

  function toggleCard(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 10) {
        next.add(id);
      }
      return next;
    });
  }

  function handleCommit() {
    setError(null);
    startTransition(async () => {
      const res = await commitVaultSelection({
        seasonId: props.seasonId,
        cardIds: selectedArray,
      });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setStep("dissolve");
      // Let the dissolve transition play, then land on /vault.
      window.setTimeout(() => {
        router.push("/vault");
      }, 2600);
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      {step === "title" && (
        <section className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
          <div
            className="flex size-24 items-center justify-center rounded-full text-3xl font-bold transition-transform duration-700"
            style={{
              backgroundColor: props.teamColorPrimary,
              color: props.teamColorSecondary,
            }}
          >
            {props.teamName.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-[0.3em] text-[var(--text-3)]">
              End of season
            </span>
            <h1 className="font-sans text-5xl font-bold tracking-tight">
              {props.teamName}, {props.seasonYear}
            </h1>
            <p className="text-sm text-[var(--text-2)]">
              Your vault ceremony is ready. Preserve up to 10 cards forever.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStep("recap")}
            className="rounded-md bg-[var(--text)] px-6 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90"
          >
            Begin
          </button>
        </section>
      )}

      {step === "recap" && (
        <section className="flex flex-col gap-6">
          <header className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
              Season {props.seasonYear} recap
            </span>
            <h2 className="font-sans text-3xl font-bold tracking-tight">The year in numbers</h2>
          </header>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatPill label="Season FP" value={recap.season_fp.toLocaleString()} />
            <StatPill label="Contests played" value={recap.contests_played.toLocaleString()} />
            <StatPill label="Contests won" value={recap.season_contests_won.toLocaleString()} />
            <StatPill
              label="Manager level"
              value={`${recap.manager_level} · ${recap.manager_xp.toLocaleString()} XP`}
            />
          </div>
          {(recap.best_card || recap.top_token_trigger) && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {recap.best_card && (
                <div className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">
                    Best card
                  </span>
                  <span className="text-lg font-semibold text-[var(--text)]">
                    {recap.best_card.player}
                  </span>
                  <span
                    className="font-mono text-xs uppercase tracking-wider"
                    style={{ color: TIER_COLOR[recap.best_card.tier] }}
                  >
                    {recap.best_card.tier} · {Number(recap.best_card.fp).toFixed(0)} FP
                  </span>
                </div>
              )}
              {recap.top_token_trigger && (
                <div className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">
                    Top token trigger
                  </span>
                  <span className="text-lg font-semibold text-[var(--text)]">
                    {recap.top_token_trigger.token_type.replace(/_/g, " ")}
                  </span>
                  <span className="font-mono text-xs text-[var(--text-2)]">
                    +{Number(recap.top_token_trigger.bonus_fp).toFixed(1)} FP
                  </span>
                </div>
              )}
            </div>
          )}
          {recap.milestones_hit.length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
                Milestones earned
              </span>
              <ul className="flex flex-wrap gap-2 text-xs">
                {recap.milestones_hit.map((m) => (
                  <li
                    key={`${m.milestone_key}-${m.tier}`}
                    className="rounded-md bg-[var(--surface-2)] px-3 py-1 font-mono"
                  >
                    {MILESTONE_LABELS[m.milestone_key] ?? m.milestone_key} T{m.tier}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("title")}
              className="text-xs uppercase tracking-wider text-[var(--text-3)] hover:text-[var(--text-2)]"
            >
              ← back
            </button>
            <button
              type="button"
              onClick={() => setStep("selection")}
              className="rounded-md bg-[var(--text)] px-6 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90"
            >
              Choose your vault →
            </button>
          </div>
        </section>
      )}

      {step === "selection" && (
        <section className="flex flex-col gap-5">
          <header className="flex items-end justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
                Vault selection
              </span>
              <h2 className="font-sans text-3xl font-bold tracking-tight">
                Preserve up to 10 forever
              </h2>
              <p className="text-sm text-[var(--text-2)]">
                Tap a card to add or remove it. Unselected cards dissolve when you commit.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="font-mono text-2xl tabular-nums text-[var(--text)]">
                {selected.size}/10
              </span>
              <button
                type="button"
                onClick={handleCommit}
                disabled={pending}
                className="rounded-md bg-[var(--text)] px-6 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {pending ? "Committing…" : selected.size === 0 ? "Dissolve all" : "Commit vault"}
              </button>
            </div>
          </header>
          {error && (
            <div className="rounded-md border border-[var(--tier-bronze)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)]">
              {error}
            </div>
          )}
          <div className="flex flex-wrap gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            {eligibleCards.map((card) => (
              <CardThumb
                key={card.card_id}
                card={card}
                selected={selected.has(card.card_id)}
                onToggle={() => toggleCard(card.card_id)}
              />
            ))}
            {eligibleCards.length === 0 && (
              <p className="w-full py-8 text-center text-sm text-[var(--text-3)]">
                No cards to vault or dissolve.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStep("recap")}
            className="self-start text-xs uppercase tracking-wider text-[var(--text-3)] hover:text-[var(--text-2)]"
          >
            ← back to recap
          </button>
        </section>
      )}

      {step === "dissolve" && (
        <section className="flex flex-col gap-5">
          <header className="flex flex-col gap-1 text-center">
            <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">Goodbye</span>
            <h2 className="font-sans text-3xl font-bold tracking-tight">Dissolving…</h2>
          </header>
          <div className="flex flex-wrap justify-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            {eligibleCards.map((card) => (
              <CardThumb
                key={card.card_id}
                card={card}
                selected={selected.has(card.card_id)}
                dissolving={!selected.has(card.card_id)}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
