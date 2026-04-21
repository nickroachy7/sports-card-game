"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { toast } from "sonner";

import { setAutoSubMode, submitLineup, updateLineupSlot } from "@/app/actions/lineup";
import { applyToken, removeToken } from "@/app/actions/tokens";
import { BenchDrawer } from "@/components/lineup/BenchDrawer";
import { CardDragLayer } from "@/components/lineup/CardDragLayer";
import { DiamondGrid } from "@/components/lineup/DiamondGrid";
import { TokenTray } from "@/components/lineup/TokenTray";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { AutoSubMode, LineupPosition } from "@/lib/contracts/lineup";
import { LINEUP_POSITIONS } from "@/lib/contracts/lineup";
import type { LineupCardVM, LineupTokenVM, LineupViewProps } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

type SlotFill = {
  card: LineupCardVM | null;
  appliedToken: {
    type: string;
    bonusFp: number;
    applicationId: string;
  } | null;
};

export function LineupView(props: LineupViewProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [mode, setMode] = useState<AutoSubMode>(props.autoSubMode);

  const locked = props.entryStatus !== "building";

  const cardsById = useMemo(() => {
    const map = new Map<string, LineupCardVM>();
    for (const c of props.cards) map.set(c.id, c);
    return map;
  }, [props.cards]);

  const tokensById = useMemo(() => {
    const map = new Map<string, LineupTokenVM>();
    for (const t of props.tokens) map.set(t.id, t);
    return map;
  }, [props.tokens]);

  const tokenApps = useMemo(() => {
    const byCardId = new Map<string, { id: string; tokenId: string }>();
    for (const app of props.tokenApplications) byCardId.set(app.cardId, app);
    return byCardId;
  }, [props.tokenApplications]);

  // Optimistic slot overlay. A pending bench→slot drop immediately
  // writes the cardId here so the UI doesn't wait for the server
  // round-trip to show the card in the slot. React's useOptimistic
  // rebases on `props.slots` — once the transition settles and the
  // router refresh delivers new props, the overlay is discarded.
  type OptimisticSlot = { position: LineupPosition; cardId: string | null };
  const baseSlots = useMemo<OptimisticSlot[]>(
    () =>
      LINEUP_POSITIONS.map((pos) => {
        const s = props.slots.find((x) => x.position === pos);
        return { position: pos, cardId: s?.starterCardId ?? null };
      }),
    [props.slots],
  );
  const [optimisticSlots, applyOptimisticPatch] = useOptimistic<OptimisticSlot[], OptimisticSlot>(
    baseSlots,
    (state, patch) => state.map((s) => (s.position === patch.position ? patch : s)),
  );

  // Build slotFills: for each canonical position, what's there?
  const slotFills = useMemo(() => {
    const fills = {} as Record<LineupPosition, SlotFill>;
    const byPos = new Map<LineupPosition, string | null>();
    for (const s of optimisticSlots) byPos.set(s.position, s.cardId);
    for (const pos of LINEUP_POSITIONS) {
      const effectiveId = byPos.get(pos) ?? null;
      const card = effectiveId ? (cardsById.get(effectiveId) ?? null) : null;
      let appliedToken: SlotFill["appliedToken"] = null;
      if (card) {
        const app = tokenApps.get(card.id);
        if (app) {
          const tok = tokensById.get(app.tokenId);
          if (tok) {
            appliedToken = {
              type: tok.tokenType,
              bonusFp: Number(tok.bonusFp),
              applicationId: app.id,
            };
          }
        }
      }
      fills[pos] = { card, appliedToken };
    }
    return fills;
  }, [optimisticSlots, cardsById, tokensById, tokenApps]);

  const assignedCardIds = useMemo(() => {
    const set = new Set<string>();
    for (const slot of optimisticSlots) {
      if (slot.cardId) set.add(slot.cardId);
    }
    return set;
  }, [optimisticSlots]);

  const filledCount = optimisticSlots.filter((s) => s.cardId !== null).length;
  const tokensApplied = props.tokens.filter((t) => t.appliedToCardId !== null).length;
  const canSubmit = filledCount === 10 && !locked && !submitting;

  function handleCardDropped(position: LineupPosition, cardId: string | null) {
    startTransition(async () => {
      // Optimistic overlay: show the card in the slot instantly. The
      // useOptimistic state is discarded when this transition settles,
      // at which point props.slots carries the real committed state.
      applyOptimisticPatch({ position, cardId });
      const result = await updateLineupSlot({
        entryId: props.entryId,
        position,
        starterCardId: cardId,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function handleTokenDropped(position: LineupPosition, tokenId: string) {
    const fill = slotFills[position];
    const card = fill.card;
    if (!card) {
      toast.error("Drop the token on a filled slot.");
      return;
    }
    startTransition(async () => {
      const result = await applyToken({
        tokenId,
        cardId: card.id,
        contestId: props.contestId,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function handleRemoveToken(applicationId: string) {
    startTransition(async () => {
      const result = await removeToken({ tokenApplicationId: applicationId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function handleModeChange(nextMode: AutoSubMode) {
    setMode(nextMode);
    startTransition(async () => {
      const result = await setAutoSubMode({ entryId: props.entryId, mode: nextMode });
      if (!result.ok) {
        toast.error(result.error.message);
        setMode(props.autoSubMode);
      }
    });
  }

  function handleSubmit() {
    startSubmit(async () => {
      const result = await submitLineup({ entryId: props.entryId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Lineup submitted. Locked until first pitch.");
      router.refresh();
    });
  }

  const lockCountdown = useLockCountdown(props.lineupLocksAt);

  const resolveCard = (cardId: string) => cardsById.get(cardId) ?? null;

  return (
    <DndProvider backend={HTML5Backend}>
      <CardDragLayer resolveCard={resolveCard} />
      <div className="flex min-h-full flex-col bg-[var(--bg)]">
        {/* Header strip */}
        <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3">
          <div className="flex flex-col">
            <h1 className="font-sans text-base font-bold tracking-tight text-[var(--text)]">
              {props.contestName}
            </h1>
            <span className="text-xs text-[var(--text-3)]">
              {locked ? <>Locked · {lockCountdown}</> : <>Locks in {lockCountdown}</>}
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-[var(--text-2)]">
            <span className="font-mono">
              <span className="text-[var(--text)]">{filledCount}</span> / 10 slots
            </span>
            <span className="font-mono">
              <span className="text-[var(--text)]">{tokensApplied}</span> tokens applied
            </span>
            <span className="font-mono uppercase tracking-wider">
              Auto-sub: <span className="text-[var(--text)]">{modeLabel(mode)}</span>
            </span>
          </div>
        </header>

        {/* Diamond */}
        <div className="flex-1 overflow-auto">
          <DiamondGrid
            slotFills={slotFills}
            locked={locked}
            onCardDropped={handleCardDropped}
            onTokenDropped={handleTokenDropped}
            onRemoveToken={handleRemoveToken}
          />
        </div>

        {/* Bench */}
        <BenchDrawer cards={props.cards} assignedCardIds={assignedCardIds} locked={locked} />

        {/* Tokens */}
        <TokenTray tokens={props.tokens} locked={locked} />

        {/* Auto-sub + Submit */}
        <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-3">
          <fieldset className="flex items-center gap-4" disabled={locked}>
            <legend className="sr-only">Auto-sub mode</legend>
            <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">Auto-sub</span>
            <ModeRadio
              label="Smart Auto"
              value="smart_auto"
              current={mode}
              onChange={handleModeChange}
            />
            <ModeRadio
              label="Manual Priority"
              value="manual_priority"
              current={mode}
              onChange={handleModeChange}
            />
          </fieldset>
          <Separator orientation="vertical" className="h-6" />
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting
              ? "Submitting…"
              : locked
                ? "Locked"
                : filledCount < 10
                  ? `Fill ${10 - filledCount} more slot${10 - filledCount === 1 ? "" : "s"}`
                  : "Submit lineup"}
          </Button>
        </div>
      </div>
    </DndProvider>
  );
}

function ModeRadio({
  label,
  value,
  current,
  onChange,
}: {
  label: string;
  value: AutoSubMode;
  current: AutoSubMode;
  onChange: (v: AutoSubMode) => void;
}) {
  const active = value === current;
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-2)] transition-colors",
        active && "text-[var(--text)]",
      )}
    >
      <input
        type="radio"
        name="auto-sub-mode"
        value={value}
        checked={active}
        onChange={() => onChange(value)}
        className="accent-[var(--text)]"
      />
      <span>{label}</span>
    </label>
  );
}

function modeLabel(m: AutoSubMode): string {
  return m === "smart_auto" ? "Smart" : "Manual";
}

/** Short countdown string to the lock time. 30-second tick granularity
 *  is enough for Phase 2 (Live state in Phase 3 ticks per-second). */
function useLockCountdown(lockIso: string): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const now = Date.now();
  const lockMs = new Date(lockIso).getTime();
  const delta = lockMs - now;
  if (delta <= 0) return "past lock time";
  const hours = Math.floor(delta / 3_600_000);
  const mins = Math.floor((delta % 3_600_000) / 60_000);
  if (hours > 24) return `${Math.floor(hours / 24)}d`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
