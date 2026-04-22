"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { toast } from "sonner";

import {
  setAutoSubMode,
  submitLineup,
  swapLineupSlots,
  updateLineupSlot,
} from "@/app/actions/lineup";
import { applyToken, removeToken } from "@/app/actions/tokens";
import { CardDetailDrawer } from "@/components/card/CardDetailDrawer";
import { CardDragLayer } from "@/components/card/CardDragLayer";
import { BenchDrawer } from "@/components/lineup/BenchDrawer";
import { DiamondGrid } from "@/components/lineup/DiamondGrid";
import { DRAG_TYPES } from "@/components/lineup/drag-types";
import { LineupShell } from "@/components/lineup/LineupShell";
import { LineupSidebar } from "@/components/lineup/LineupSidebar";
import { TokenTray } from "@/components/lineup/TokenTray";
import { TokenDragLayer } from "@/components/token/TokenDragLayer";
import type { TokenType } from "@/lib/contracts/cards";
import type { AutoSubMode, LineupPosition } from "@/lib/contracts/lineup";
import { LINEUP_POSITIONS } from "@/lib/contracts/lineup";
import type { LineupCardVM, LineupTokenVM, LineupViewProps } from "@/lib/lineup/types";

export type AppliedTokenInfo = {
  tokenType: TokenType;
  bonusFp: number;
  applicationId: string;
};

type SlotFill = {
  card: LineupCardVM | null;
  appliedToken: {
    type: string;
    bonusFp: number;
    applicationId: string;
  } | null;
  /** Running FP during live games (populated by the scoring reducer). */
  liveFp: number;
  /** Authoritative FP after game reconcile. Zero until the starter's
   *  game finalizes. */
  finalFp: number;
};

export function LineupView(props: LineupViewProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [mode, setMode] = useState<AutoSubMode>(props.autoSubMode);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

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

  // Map slot position → committed FPs (live_fp / final_fp) from props.
  // These don't flow through the optimistic overlay — they only update
  // when a server refresh delivers new slot data.
  const slotFpByPosition = useMemo(() => {
    const map = new Map<LineupPosition, { liveFp: number; finalFp: number }>();
    for (const s of props.slots) {
      map.set(s.position, { liveFp: s.liveFp, finalFp: s.finalFp });
    }
    return map;
  }, [props.slots]);

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
      const fp = slotFpByPosition.get(pos);
      fills[pos] = {
        card,
        appliedToken,
        liveFp: fp?.liveFp ?? 0,
        finalFp: fp?.finalFp ?? 0,
      };
    }
    return fills;
  }, [optimisticSlots, cardsById, tokensById, tokenApps, slotFpByPosition]);

  const assignedCardIds = useMemo(() => {
    const set = new Set<string>();
    for (const slot of optimisticSlots) {
      if (slot.cardId) set.add(slot.cardId);
    }
    return set;
  }, [optimisticSlots]);

  const filledCount = optimisticSlots.filter((s) => s.cardId !== null).length;
  const canSubmit = filledCount === 10 && !locked && !submitting;

  function handleCardDropped(
    position: LineupPosition,
    cardId: string | null,
    fromPosition: LineupPosition | null,
  ) {
    startTransition(async () => {
      // Slot → slot drop: run the atomic swap through swap_lineup_slots
      // so both slots update in one transaction. Optimistic overlay
      // swaps both positions; server-side SQL fn validates dual
      // eligibility.
      if (fromPosition && cardId) {
        const currentAtTarget =
          optimisticSlots.find((s) => s.position === position)?.cardId ?? null;
        applyOptimisticPatch({ position, cardId });
        applyOptimisticPatch({ position: fromPosition, cardId: currentAtTarget });
        const result = await swapLineupSlots({
          entryId: props.entryId,
          positionA: fromPosition,
          positionB: position,
        });
        if (!result.ok) {
          toast.error(result.error.message);
          return;
        }
        router.refresh();
        return;
      }

      // Bench → slot (or explicit remove with cardId=null).
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

  const appliedTokenByCardId = useMemo(() => {
    const map = new Map<string, AppliedTokenInfo>();
    for (const [cardId, app] of tokenApps.entries()) {
      const tok = tokensById.get(app.tokenId);
      if (!tok) continue;
      map.set(cardId, {
        tokenType: tok.tokenType,
        bonusFp: Number(tok.bonusFp),
        applicationId: app.id,
      });
    }
    return map;
  }, [tokenApps, tokensById]);

  const resolveToken = (tokenId: string) => {
    const tok = tokensById.get(tokenId);
    if (!tok) return null;
    return { tokenType: tok.tokenType, bonusFp: Number(tok.bonusFp) };
  };

  function handleOpenDetail(cardId: string) {
    setDetailCardId(cardId);
  }

  // Which slot (if any) holds the currently-opened card. Drives the
  // drawer's Remove-from-slot action visibility.
  const detailSlotPosition = detailCardId
    ? (optimisticSlots.find((s) => s.cardId === detailCardId)?.position ?? null)
    : null;

  async function handleRemoveFromSlot() {
    if (!detailSlotPosition) return;
    applyOptimisticPatch({ position: detailSlotPosition, cardId: null });
    const result = await updateLineupSlot({
      entryId: props.entryId,
      position: detailSlotPosition,
      starterCardId: null,
    });
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <CardDragLayer accepts={DRAG_TYPES.CARD} resolveCard={resolveCard} />
      <TokenDragLayer resolveToken={resolveToken} />
      <LineupShell
        header={
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3">
            <div className="flex flex-col">
              <h1 className="font-sans text-base font-bold tracking-tight text-[var(--text)]">
                {props.contestName}
              </h1>
              <span className="text-xs text-[var(--text-3)]">
                {locked ? <>Locked · {lockCountdown}</> : <>Locks in {lockCountdown}</>}
              </span>
            </div>
          </header>
        }
        diamond={
          <DiamondGrid
            slotFills={slotFills}
            locked={locked}
            onCardDropped={handleCardDropped}
            onTokenDropped={handleTokenDropped}
            onRemoveToken={handleRemoveToken}
            onOpenDetail={handleOpenDetail}
          />
        }
        sidebar={
          <LineupSidebar
            slotFills={slotFills}
            entryStatus={props.entryStatus}
            liveScore={props.liveScore}
            finalScore={props.finalScore}
            autoSubMode={mode}
            onAutoSubModeChange={handleModeChange}
            canSubmit={canSubmit}
            submitting={submitting}
            locked={locked}
            lockCountdown={lockCountdown}
            onSubmit={handleSubmit}
          />
        }
        bench={
          <BenchDrawer
            cards={props.cards}
            assignedCardIds={assignedCardIds}
            appliedTokenByCardId={appliedTokenByCardId}
            onRemoveToken={handleRemoveToken}
            onOpenDetail={handleOpenDetail}
            locked={locked}
          />
        }
        tokens={<TokenTray tokens={props.tokens} locked={locked} />}
      />
      <CardDetailDrawer
        cardId={detailCardId}
        open={detailCardId !== null}
        onOpenChange={(next) => {
          if (!next) setDetailCardId(null);
        }}
        lineupContext={{
          slotted: detailSlotPosition !== null,
          onRemoveFromSlot: handleRemoveFromSlot,
          onVaulted: () => router.refresh(),
        }}
      />
    </DndProvider>
  );
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
