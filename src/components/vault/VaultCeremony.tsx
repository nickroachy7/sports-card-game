"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { getEmptyImage, HTML5Backend } from "react-dnd-html5-backend";

import { commitVaultSelection } from "@/app/actions/vault";
import { Card, type CardViewModel } from "@/components/card/Card";
import { CardDragLayer } from "@/components/card/CardDragLayer";
import { DissolveCard } from "@/components/card/DissolveCard";
import { dragResult } from "@/components/card/drag-layer-state";
import type { CardTier } from "@/lib/contracts/cards";
import type { VaultCeremonyPreview, VaultEligibleCard } from "@/lib/contracts/vault";

/** Drag type for vault-selection cards. Distinct from lineup's
 *  "lineup/card" so the lineup drag layer (if ever co-mounted) ignores
 *  these and vice-versa. */
const VAULT_DRAG_TYPE = "vault/card";

type VaultDragItem = {
  cardId: string;
  /** Where the card is right now: in the grid, or already in the vault. */
  zone: "grid" | "vault";
};

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

function toViewModel(card: VaultEligibleCard): CardViewModel {
  return {
    id: card.card_id,
    playerName: card.full_name,
    position: card.positions?.[0] ?? null,
    teamAbbreviation: card.team_abbreviation,
    tier: card.current_tier,
    careerFp: Number(card.career_fp_total),
    contractPlays: card.contract_plays_remaining,
    contractMax: 15,
    playerStatus: "active",
    isExpired: card.is_expired,
    hasAppliedToken: false,
    photoUrl: null,
  };
}

function CardThumb({
  card,
  selected,
  dissolving,
  dissolveDelay,
  draggable,
  zone,
  onToggle,
}: {
  card: VaultEligibleCard;
  selected: boolean;
  dissolving?: boolean;
  dissolveDelay?: number;
  /** Enable drag source. Off during dissolve step. */
  draggable?: boolean;
  /** Which dropzone contains this card right now. */
  zone?: "grid" | "vault";
  onToggle?: () => void;
}) {
  const color = TIER_COLOR[card.current_tier];
  const willDissolve = !!dissolving && !selected;
  const canDrag = !!draggable && !dissolving;

  const [{ isDragging }, dragRef, preview] = useDrag<VaultDragItem, void, { isDragging: boolean }>(
    () => ({
      type: VAULT_DRAG_TYPE,
      item: () => {
        dragResult.lastDropAccepted = false;
        return { cardId: card.card_id, zone: zone ?? "grid" };
      },
      canDrag: canDrag,
      end: (_item, monitor) => {
        dragResult.lastDropAccepted = monitor.didDrop();
      },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [card.card_id, zone, canDrag],
  );

  useEffect(() => {
    if (canDrag) preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview, canDrag]);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!!dissolving}
      ref={(el) => {
        if (canDrag) dragRef(el);
      }}
      className={`flex flex-col items-center gap-1 rounded-md transition ${
        dissolving ? "pointer-events-none" : "hover:scale-[1.03]"
      } ${canDrag && !isDragging ? "cursor-grab active:cursor-grabbing" : ""} ${
        isDragging ? "opacity-25" : ""
      }`}
      style={{ transitionDuration: "180ms" }}
      aria-pressed={selected}
    >
      <DissolveCard active={willDissolve} delay={dissolveDelay ?? 0}>
        <div
          className="rounded-md"
          style={{
            boxShadow: selected ? "0 0 0 3px rgba(245, 241, 232, 0.55)" : undefined,
          }}
        >
          <Card size="small" card={toViewModel(card)} />
        </div>
      </DissolveCard>
      <span
        className="font-mono text-[10px] uppercase tracking-wider"
        style={{ color: selected ? "#f5f1e8" : color }}
      >
        {selected ? "Vault" : "Dissolve"}
      </span>
    </button>
  );
}

/** Vault dropzone — drop a grid card here to add it to the preserved
 *  set. Reject drops when already at 10 or the card is already vaulted. */
function VaultDropzone({
  count,
  onDropCard,
  onRemoveCard: _onRemoveCard,
  children,
}: {
  count: number;
  onDropCard: (cardId: string) => void;
  onRemoveCard: (cardId: string) => void;
  children: React.ReactNode;
}) {
  const full = count >= 10;
  const [{ isOver, canDrop }, dropRef] = useDrop<
    VaultDragItem,
    void,
    { isOver: boolean; canDrop: boolean }
  >(
    () => ({
      accept: VAULT_DRAG_TYPE,
      canDrop: (item) => item.zone === "grid" && !full,
      drop: (item) => {
        onDropCard(item.cardId);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [full, onDropCard],
  );

  const active = isOver && canDrop;
  const reject = isOver && !canDrop;
  return (
    <div
      ref={(el) => {
        dropRef(el);
      }}
      className={`flex flex-col gap-2 rounded-lg border-2 border-dashed p-4 transition-colors ${
        active
          ? "border-[var(--text)] bg-[var(--surface-2)]"
          : reject
            ? "border-[#C47262] bg-[var(--surface)]"
            : "border-[var(--tier-gold,#D4A647)] bg-[var(--surface)]"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-[0.2em] text-[var(--tier-gold,#D4A647)]">
          Vault
        </span>
        <span className="font-mono text-sm tabular-nums text-[var(--text)]">{count} / 10</span>
      </div>
      {children}
    </div>
  );
}

/** Grid dropzone — release a vaulted card here to un-preserve it. */
function GridDropzone({
  onDropCard,
  children,
}: {
  onDropCard: (cardId: string) => void;
  children: React.ReactNode;
}) {
  const [{ isOver, canDrop }, dropRef] = useDrop<
    VaultDragItem,
    void,
    { isOver: boolean; canDrop: boolean }
  >(
    () => ({
      accept: VAULT_DRAG_TYPE,
      canDrop: (item) => item.zone === "vault",
      drop: (item) => {
        onDropCard(item.cardId);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [onDropCard],
  );
  const active = isOver && canDrop;
  return (
    <div
      ref={(el) => {
        dropRef(el);
      }}
      className={`transition-opacity ${active ? "opacity-100" : ""}`}
    >
      {children}
    </div>
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
  return (
    <DndProvider backend={HTML5Backend}>
      <VaultCeremonyInner {...props} />
    </DndProvider>
  );
}

function VaultCeremonyInner(props: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("title");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { preview } = props;
  const { recap, eligibleCards } = preview;
  const selectedArray = [...selected];

  const cardsById = useMemo(() => {
    const m = new Map<string, VaultEligibleCard>();
    for (const c of eligibleCards) m.set(c.card_id, c);
    return m;
  }, [eligibleCards]);

  const resolveCard = (id: string): CardViewModel | null => {
    const c = cardsById.get(id);
    return c ? toViewModel(c) : null;
  };

  function selectCard(id: string) {
    setSelected((prev) => {
      if (prev.has(id) || prev.size >= 10) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function unselectCard(id: string) {
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
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
                Drag a card into the vault (or tap to toggle). Unselected cards dissolve when you
                commit.
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

          <CardDragLayer accepts={VAULT_DRAG_TYPE} resolveCard={resolveCard} />

          {/* Vault dropzone — drop cards in here to preserve them. */}
          <VaultDropzone count={selected.size} onDropCard={selectCard} onRemoveCard={unselectCard}>
            <div className="flex min-h-[150px] flex-wrap items-center gap-3">
              {selectedArray.length === 0 && (
                <p className="w-full py-4 text-center text-sm text-[var(--text-3)]">
                  Drag or tap cards to preserve up to 10.
                </p>
              )}
              {selectedArray.map((id) => {
                const card = cardsById.get(id);
                if (!card) return null;
                return (
                  <CardThumb
                    key={id}
                    card={card}
                    selected
                    draggable
                    zone="vault"
                    onToggle={() => unselectCard(id)}
                  />
                );
              })}
            </div>
          </VaultDropzone>

          {/* Grid dropzone — eligible but-not-yet-preserved cards. Also
              accepts drags FROM the vault so you can pull cards back
              out by dragging them here. */}
          <GridDropzone onDropCard={unselectCard}>
            <div className="flex flex-wrap gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
              {eligibleCards
                .filter((c) => !selected.has(c.card_id))
                .map((card) => (
                  <CardThumb
                    key={card.card_id}
                    card={card}
                    selected={false}
                    draggable
                    zone="grid"
                    onToggle={() => selectCard(card.card_id)}
                  />
                ))}
              {eligibleCards.length === 0 && (
                <p className="w-full py-8 text-center text-sm text-[var(--text-3)]">
                  No cards to vault or dissolve.
                </p>
              )}
            </div>
          </GridDropzone>
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
            {eligibleCards
              .filter((c) => !selected.has(c.card_id))
              .map((card, idx) => (
                <CardThumb
                  key={card.card_id}
                  card={card}
                  selected={false}
                  dissolving
                  dissolveDelay={idx * 0.04}
                />
              ))}
            {eligibleCards
              .filter((c) => selected.has(c.card_id))
              .map((card) => (
                <CardThumb key={card.card_id} card={card} selected dissolving />
              ))}
          </div>
        </section>
      )}
    </main>
  );
}
