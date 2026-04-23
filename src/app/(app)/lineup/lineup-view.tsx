"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
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
import { CardDetailModal } from "@/components/card/CardDetailModal";
import { CardDragLayer } from "@/components/card/CardDragLayer";
import { AppSidebar, shortName } from "@/components/layout/AppSidebar";
import { BenchDrawer } from "@/components/lineup/BenchDrawer";
import { CardContractEventsProvider } from "@/components/lineup/CardContractEventsProvider";
import { DRAG_TYPES } from "@/components/lineup/drag-types";
import { LineupGrid } from "@/components/lineup/LineupGrid";
import { LineupShell } from "@/components/lineup/LineupShell";
import { type FeedPlayer, LiveEventsProvider } from "@/components/lineup/LiveEventsProvider";
import { TokenTray } from "@/components/lineup/TokenTray";
import { TokenDragLayer } from "@/components/token/TokenDragLayer";
import type { TokenType } from "@/lib/contracts/cards";
import type { AutoSubMode, LineupPosition } from "@/lib/contracts/lineup";
import { LINEUP_POSITIONS } from "@/lib/contracts/lineup";
import type {
  LineupCardVM,
  LineupTokenVM,
  LineupViewProps,
  SlotGameInfo,
} from "@/lib/lineup/types";

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
  /** Polish spec §44 — true when the slot is locked (building-state
   *  lock rules OR per-slot lock from the starter's game having started). */
  locked: boolean;
  /** Polish spec §45 — today's game for this slot's starter, if any. */
  gameInfo: SlotGameInfo | null;
};

export function LineupView(props: LineupViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [mode, setMode] = useState<AutoSubMode>(props.autoSubMode);
  // Polish spec §89 (Phase 30). Card detail is a modal keyed by the
  // `?card={id}` URL param so back/forward navigation + shareable
  // links keep working. Previously this was local useState driving a
  // sidebar swap.
  const detailCardId = searchParams.get("card");

  // Polish spec §44 — per-slot lock semantics. Bench + tokens remain
  // draggable in submitted/live states (so the user can edit un-started
  // slots); individual LineupSlots reject drops when their own game
  // has started. `locked=true` here only when the contest is fully
  // final — nothing can be modified.
  const locked = props.entryStatus === "final";
  // Legacy entry-status indicator for sidebar + bench chrome — shows
  // "locked" vibes once the user has submitted, even if individual
  // slots are still editable.
  const submitted = props.entryStatus !== "building";

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
  // Polish spec §44 — per-slot lock derived from game info. Pre-submit
  // (building) state: all slots unlocked (user is drafting). Post-submit:
  // slot is locked when the starter's game has started.
  const isBuilding = props.entryStatus === "building";
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
      const gameInfo = card ? (props.slotGameByCardId[card.id] ?? null) : null;
      const slotLocked =
        !isBuilding &&
        gameInfo !== null &&
        (gameInfo.status === "live" ||
          gameInfo.status === "final" ||
          (gameInfo.scheduledStart !== null &&
            new Date(gameInfo.scheduledStart).getTime() <= Date.now()));

      // Polish spec §46 — post-submit, the card footer shows contest FP
      // instead of career FP. Compute here so the Card component stays
      // oblivious to lineup concerns.
      const liveFp = fp?.liveFp ?? 0;
      const finalFp = fp?.finalFp ?? 0;
      const contestFp = liveFp + finalFp;
      const contestFpLabel: "LIVE" | "FINAL" = gameInfo?.status === "final" ? "FINAL" : "LIVE";
      const enhancedCard: LineupCardVM | null =
        card && !isBuilding ? { ...card, contestFp, contestFpLabel } : card;

      fills[pos] = {
        card: enhancedCard,
        appliedToken,
        liveFp,
        finalFp,
        locked: slotLocked,
        gameInfo,
      };
    }
    return fills;
  }, [
    optimisticSlots,
    cardsById,
    tokensById,
    tokenApps,
    slotFpByPosition,
    props.slotGameByCardId,
    isBuilding,
  ]);

  const assignedCardIds = useMemo(() => {
    const set = new Set<string>();
    for (const slot of optimisticSlots) {
      if (slot.cardId) set.add(slot.cardId);
    }
    return set;
  }, [optimisticSlots]);

  // Lineup's rostered players — input to <LiveEventsProvider> post-
  // submit so the Realtime channel filters to just these IDs. Derived
  // from slotFills so a mid-session lineup change (e.g., auto-sub)
  // re-shapes the subscription.
  const lineupPlayers = useMemo<FeedPlayer[]>(() => {
    const out: FeedPlayer[] = [];
    for (const pos of LINEUP_POSITIONS) {
      const card = slotFills[pos].card;
      if (card) out.push({ playerId: card.playerId, displayName: shortName(card.playerName) });
    }
    return out;
  }, [slotFills]);

  // Rostered card ids — input to <CardContractEventsProvider> for the
  // per-slot contract-depletion glow (polish spec §30).
  const rosteredCardIds = useMemo<string[]>(() => {
    const out: string[] = [];
    for (const pos of LINEUP_POSITIONS) {
      const card = slotFills[pos].card;
      if (card) out.push(card.id);
    }
    return out;
  }, [slotFills]);

  const filledCount = optimisticSlots.filter((s) => s.cardId !== null).length;
  // Submit is a one-time entry step; only meaningful in building state.
  const canSubmit = filledCount === 10 && !submitted && !submitting;

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

  // Polish spec §89 (Phase 30). Card click → push ?card=id URL
  // param. The CardDetailModal reads the param and opens itself.
  const handleOpenDetail = useCallback(
    (cardId: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("card", cardId);
      router.push(`/lineup?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Which slot (if any) holds the currently-opened card. Drives the
  // modal's Remove-from-slot action visibility.
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

  // Post-submit: wrap the tree in <LiveEventsProvider> so the Event
  // Feed + per-slot FP glow share one Realtime channel (polish spec
  // §21). Building state skips the provider entirely — no submitted
  // lineup means no events to narrate.
  const isPostSubmit = props.entryStatus !== "building";

  const shell = (
    <LineupShell
      grid={
        <LineupGrid
          slotFills={slotFills}
          onCardDropped={handleCardDropped}
          onTokenDropped={handleTokenDropped}
          onRemoveToken={handleRemoveToken}
          onOpenDetail={handleOpenDetail}
        />
      }
      sidebar={
        <AppSidebar
          variant="lineup"
          teamSummary={props.teamSummary}
          contestName={props.contestName}
          slotFills={slotFills}
          entryStatus={props.entryStatus}
          liveScore={props.liveScore}
          finalScore={props.finalScore}
          contestGameIds={props.contestGameIds}
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
          slotGameByCardId={props.slotGameByCardId}
          onRemoveToken={handleRemoveToken}
          onOpenDetail={handleOpenDetail}
          locked={locked}
        />
      }
      tokens={<TokenTray tokens={props.tokens} locked={locked} />}
    />
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <CardDragLayer accepts={DRAG_TYPES.CARD} resolveCard={resolveCard} />
      <TokenDragLayer resolveToken={resolveToken} />
      {/* Polish spec §89 (Phase 30). Card detail modal reads the
          ?card param and opens automatically. Lineup context wires
          the "Remove from slot" action. */}
      <CardDetailModal
        lineupContext={{
          slotted: detailSlotPosition !== null,
          onRemoveFromSlot: handleRemoveFromSlot,
          onVaulted: () => router.refresh(),
        }}
      />
      {isPostSubmit ? (
        <LiveEventsProvider
          lineupPlayers={lineupPlayers}
          contestGameIds={props.contestGameIds}
          gameMatchupById={props.gameMatchupById}
        >
          <CardContractEventsProvider rosteredCardIds={rosteredCardIds}>
            {shell}
          </CardContractEventsProvider>
        </LiveEventsProvider>
      ) : (
        shell
      )}
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
