"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { toast } from "sonner";
import { quickSellCards } from "@/app/actions/cards";
import {
  setAutoSubMode,
  submitLineup,
  swapLineupSlots,
  updateLineupSlot,
} from "@/app/actions/lineup";
import type { OpenPackResult, OpenPacksBatchResult } from "@/app/actions/packs";
import { fetchRevealedCards, type RevealedCard } from "@/app/actions/packs-reveal";
import { applyToken, removeToken } from "@/app/actions/tokens";
import { vaultCardsMidseason } from "@/app/actions/vault";
import { CardDetailPanel } from "@/components/card/CardDetailPanel";
import { CardDragLayer } from "@/components/card/CardDragLayer";
import { AppSidebar, shortName } from "@/components/layout/AppSidebar";
import { CardContractEventsProvider } from "@/components/lineup/CardContractEventsProvider";
import { CardsPanel } from "@/components/lineup/CardsPanel";
import { DRAG_TYPES } from "@/components/lineup/drag-types";
import { LineupGrid } from "@/components/lineup/LineupGrid";
import { LineupShell } from "@/components/lineup/LineupShell";
import { type FeedPlayer, LiveEventsProvider } from "@/components/lineup/LiveEventsProvider";
import { SelectionPanel } from "@/components/lineup/SelectionPanel";
import { TokenTray } from "@/components/lineup/TokenTray";
import { useAutoScrollOnDrag } from "@/components/lineup/use-autoscroll-on-drag";
import { BuyPacksFab } from "@/components/pack/BuyPacksFab";
import { BuyPacksModal } from "@/components/pack/BuyPacksModal";
import { PackOpenerModal } from "@/components/pack/PackOpenerModal";
import { TokenDragLayer } from "@/components/token/TokenDragLayer";
import { Button } from "@/components/ui/button";
import type { PackType, TokenType } from "@/lib/contracts/cards";
import type { AutoSubMode, LineupPosition } from "@/lib/contracts/lineup";
import { LINEUP_POSITIONS } from "@/lib/contracts/lineup";
import type {
  LineupCardVM,
  LineupTokenVM,
  LineupViewProps,
  SlotGameInfo,
} from "@/lib/lineup/types";

/**
 * Coin value per tier for the bulk quick-sell running total. Matches
 * the economy-config defaults shipped in the db seed; if the config
 * ever drifts at runtime, the server authoritative total from the
 * action result is what ultimately credits the user.
 */
const QUICK_SELL_VALUE_BY_TIER: Record<string, number> = {
  bronze: 10,
  silver: 25,
  gold: 75,
  diamond: 200,
};

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
  // Polish spec §96 (Phase 32). Auto-scroll the main container when
  // a drag is in progress near the viewport edge. Without this,
  // cards buried below the fold in the CardsPanel can't be dragged
  // up to lineup slots at the top.
  useAutoScrollOnDrag();
  // Polish spec §101 (Phase 34) + §105 (Phase 35). The auto-fading
  // scrollbar behavior was replaced with fully hidden scrollbars
  // scoped to `data-scroll-surface="lineup"` on the shell. The
  // `useScrollFade` hook is still available in the codebase for
  // other surfaces that might want the P34 fade, but not needed
  // here.
  // Polish spec §89 (P30 modal → P33 reverted to sidebar swap).
  // Card detail reads the `?card={id}` URL param; the sidebar swaps
  // between the default <AppSidebar> and <CardDetailPanel> based on
  // it. Back/forward + shareable links survive either way.
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

  // Polish spec §94 (Phase 32). Inverse of slotFills — cardId → the
  // position that card occupies. CardsPanel passes the position down
  // to each BenchCard so the drag source can include `fromPosition`,
  // routing drops to swap_lineup_slots.
  const cardToSlotPosition = useMemo(() => {
    const map = new Map<string, LineupPosition>();
    for (const slot of optimisticSlots) {
      if (slot.cardId) map.set(slot.cardId, slot.position);
    }
    return map;
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

  // Polish spec §104 (Phase 35). Multi-select state lives on
  // LineupView so CardsPanel + sidebar swap both read the same
  // selection. Selection is intentionally non-persistent — exits
  // on navigation, reload, or Escape.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkSubmitting, startBulk] = useTransition();

  // Polish spec §109 (Phase 36). Buy-packs + reveal state. The FAB
  // opens the buy modal; confirming a purchase fires the batch
  // action and stages a reveal payload that drives PackOpenerModal.
  const [buyOpen, setBuyOpen] = useState(false);
  const [revealPayload, setRevealPayload] = useState<{
    result: OpenPackResult;
    cards: RevealedCard[];
    existingByCardId: Map<string, RevealedCard>;
  } | null>(null);

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

      // Polish spec §113 follow-up (Phase 38). When a remove
      // happens (cardId === null), any token currently applied to
      // the card being removed also detaches — user expectation is
      // "both the card and the token go back to their sections."
      // Swaps (handled above) keep the token since the card is
      // still in the lineup, just in a different slot.
      const appliedAtPosition = cardId === null ? slotFills[position].appliedToken : null;

      // Bench → slot (or explicit remove with cardId=null).
      applyOptimisticPatch({ position, cardId });
      const [result, tokenResult] = await Promise.all([
        updateLineupSlot({
          entryId: props.entryId,
          position,
          starterCardId: cardId,
        }),
        appliedAtPosition
          ? removeToken({ tokenApplicationId: appliedAtPosition.applicationId })
          : Promise.resolve({ ok: true } as const),
      ]);
      if (!tokenResult.ok && tokenResult.error.code !== "NOT_FOUND") {
        // Log but don't block the slot update — slot removal
        // already succeeded; token detach failure is recoverable
        // on next refresh. Skip NOT_FOUND since that just means
        // the token was already detached server-side.
        toast.error(`Token detach failed: ${tokenResult.error.message}`);
      }
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
        // NOT_FOUND is idempotent success: the token was already
        // removed (e.g. by the auto-detach on slot clear). Don't
        // surface it as an error.
        if (result.error.code !== "NOT_FOUND") {
          toast.error(result.error.message);
          return;
        }
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

  // Polish spec §89 (Phase 30 → reverted in Phase 33). Card click →
  // push ?card=id URL param. The sidebar swaps to <CardDetailPanel>
  // when the param is set; back/forward + shareable links survive.
  const handleOpenDetail = useCallback(
    (cardId: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("card", cardId);
      router.push(`/lineup?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Polish spec §104 (Phase 35). Multi-select handlers. Entering
  // select mode clears the card detail param so the sidebar swap
  // unambiguously falls to SelectionPanel. Exiting always clears
  // the selection — carry-over across enter/exit felt worse than
  // starting fresh in informal testing.
  const handleToggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      const next = !prev;
      if (!next) setSelectedIds(new Set());
      return next;
    });
    // On entry, kick any open card detail to the curb.
    const next = new URLSearchParams(searchParams.toString());
    if (next.has("card")) {
      next.delete("card");
      const q = next.toString();
      router.replace(q ? `/lineup?${q}` : "/lineup", { scroll: false });
    }
  }, [router, searchParams]);

  const handleToggleSelect = useCallback((cardId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, []);

  // Escape key exits select mode as a quick-escape for power users
  // — matches the pattern on the contest-final modal + others.
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode, handleClearSelection]);

  const selectedCards = useMemo<LineupCardVM[]>(() => {
    const out: LineupCardVM[] = [];
    for (const id of selectedIds) {
      const c = cardsById.get(id);
      if (c) out.push(c);
    }
    return out;
  }, [selectedIds, cardsById]);

  const selectionLineupCount = useMemo(() => {
    let n = 0;
    for (const id of selectedIds) if (assignedCardIds.has(id)) n += 1;
    return n;
  }, [selectedIds, assignedCardIds]);

  const selectionQuickSellTotal = useMemo(() => {
    let total = 0;
    for (const c of selectedCards) total += QUICK_SELL_VALUE_BY_TIER[c.tier] ?? 0;
    return total;
  }, [selectedCards]);

  const handleBulkQuickSell = useCallback(() => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    startBulk(async () => {
      const result = await quickSellCards({ cardIds: ids });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      const { soldCount, totalCoinsEarned, failures } = result.data;
      if (soldCount > 0) {
        toast.success(
          `Sold ${soldCount} card${soldCount === 1 ? "" : "s"} for ${totalCoinsEarned} coin${totalCoinsEarned === 1 ? "" : "s"}`,
        );
      }
      if (failures.length > 0) {
        toast.error(
          `${failures.length} card${failures.length === 1 ? "" : "s"} couldn't be sold (${failures[0]?.message ?? "unknown"})`,
        );
      }
      setSelectedIds(new Set());
      setSelectMode(false);
      router.refresh();
    });
  }, [selectedIds, router]);

  // Polish spec §109 (Phase 36). After openPacksBatch returns,
  // flatten all openings' cardResults into a single synthetic
  // OpenPackResult so the reveal modal renders the whole batch as
  // one continuous flow. Dupe existing-instance lookup happens the
  // same way a single pack does; we just union everyone's existing
  // IDs into the fetchRevealedCards call.
  const handleBatchOpened = useCallback(async (batch: OpenPacksBatchResult, packType: PackType) => {
    if (batch.openings.length === 0) return;
    const flatCardIds: string[] = [];
    const flatCardResults: OpenPackResult["cardResults"] = [];
    const flatTokenIds: string[] = [];
    let totalDupes = 0;
    let totalCoinsFromDupes = 0;
    for (const op of batch.openings) {
      flatCardIds.push(...op.cardIds);
      flatCardResults.push(...op.cardResults);
      flatTokenIds.push(...op.tokenIds);
      totalDupes += op.duplicateCount;
      totalCoinsFromDupes += op.coinsFromDupes;
    }
    const existingIds = flatCardResults
      .map((c) => c.existingCardId)
      .filter((id): id is string => !!id);
    const allIds = Array.from(new Set([...flatCardIds, ...existingIds]));
    const all = await fetchRevealedCards(allIds);
    const newCardIds = new Set(flatCardIds);
    const newCards = flatCardIds
      .map((id) => all.find((c) => c.id === id))
      .filter((c): c is RevealedCard => !!c);
    const existingMap = new Map<string, RevealedCard>();
    for (const c of all) {
      if (!newCardIds.has(c.id)) existingMap.set(c.id, c);
    }
    // Synthesize a single OpenPackResult that covers the whole batch.
    const synthetic: OpenPackResult = {
      openingId: batch.openings[0]?.openingId ?? "",
      cardIds: flatCardIds,
      cardResults: flatCardResults,
      tokenIds: flatTokenIds,
      duplicateCount: totalDupes,
      coinsFromDupes: totalCoinsFromDupes,
      coinCost: batch.totalCoinCost,
      balanceAfter: batch.balanceAfter,
      packType,
    };
    setRevealPayload({
      result: synthetic,
      cards: newCards,
      existingByCardId: existingMap,
    });
  }, []);

  const handleRevealClosed = useCallback(() => {
    setRevealPayload(null);
    router.refresh();
  }, [router]);

  const handleBulkVault = useCallback(() => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    startBulk(async () => {
      const result = await vaultCardsMidseason({ cardIds: ids });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      const { vaultedCount, failures } = result.data;
      if (vaultedCount > 0) {
        toast.success(`Vaulted ${vaultedCount} card${vaultedCount === 1 ? "" : "s"}`);
      }
      if (failures.length > 0) {
        toast.error(
          `${failures.length} card${failures.length === 1 ? "" : "s"} couldn't be vaulted (${failures[0]?.message ?? "unknown"})`,
        );
      }
      setSelectedIds(new Set());
      setSelectMode(false);
      router.refresh();
    });
  }, [selectedIds, router]);

  // Polish spec §100 (Phase 34). Back button on the detail sidebar —
  // strips `?card` from the URL so the sidebar swaps back to the
  // default AppSidebar.
  const handleCloseDetail = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("card");
    const q = next.toString();
    router.push(q ? `/lineup?${q}` : "/lineup", { scroll: false });
  }, [router, searchParams]);

  // Which slot (if any) holds the currently-opened card. Drives the
  // detail sidebar's Remove-from-slot action visibility.
  const detailSlotPosition = detailCardId
    ? (optimisticSlots.find((s) => s.cardId === detailCardId)?.position ?? null)
    : null;

  async function handleRemoveFromSlot() {
    if (!detailSlotPosition) return;
    // Phase 38 follow-up. Detach any applied token alongside the
    // slot clear so the card + token both go back to their
    // sections — matches the × button path in handleCardDropped.
    const applied = slotFills[detailSlotPosition].appliedToken;
    applyOptimisticPatch({ position: detailSlotPosition, cardId: null });
    const [result, tokenResult] = await Promise.all([
      updateLineupSlot({
        entryId: props.entryId,
        position: detailSlotPosition,
        starterCardId: null,
      }),
      applied
        ? removeToken({ tokenApplicationId: applied.applicationId })
        : Promise.resolve({ ok: true } as const),
    ]);
    if (!tokenResult.ok && tokenResult.error.code !== "NOT_FOUND") {
      toast.error(`Token detach failed: ${tokenResult.error.message}`);
    }
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
          onRemoveStarter={(position) => handleCardDropped(position, null, null)}
        />
      }
      sidebar={
        // Polish spec §104 (Phase 35). Sidebar swap priority:
        //   1. selectMode → <SelectionPanel>
        //   2. ?card=id   → <DetailSidebar>
        //   3. default    → <AppSidebar>
        selectMode ? (
          <SelectionPanel
            selectedCards={selectedCards}
            quickSellTotal={selectionQuickSellTotal}
            lineupCount={selectionLineupCount}
            canAct={!locked}
            submitting={bulkSubmitting}
            onQuickSell={handleBulkQuickSell}
            onAddToVault={handleBulkVault}
            onClear={handleClearSelection}
          />
        ) : detailCardId ? (
          <DetailSidebar
            cardId={detailCardId}
            slotted={detailSlotPosition !== null}
            onRemoveFromSlot={handleRemoveFromSlot}
            onVaulted={() => router.refresh()}
            onClose={handleCloseDetail}
          />
        ) : (
          <AppSidebar
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
        )
      }
      tokens={<TokenTray tokens={props.tokens} locked={locked} />}
      cards={
        <CardsPanel
          cards={props.cards}
          assignedCardIds={assignedCardIds}
          cardToSlotPosition={cardToSlotPosition}
          appliedTokenByCardId={appliedTokenByCardId}
          slotGameByCardId={props.slotGameByCardId}
          onRemoveToken={handleRemoveToken}
          onOpenDetail={handleOpenDetail}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelectMode={handleToggleSelectMode}
          onToggleSelect={handleToggleSelect}
          locked={locked}
        />
      }
    />
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <CardDragLayer accepts={DRAG_TYPES.CARD} resolveCard={resolveCard} />
      <TokenDragLayer resolveToken={resolveToken} />
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
      {/* Polish spec §109 (Phase 36). FAB + buy modal + reveal.
          FAB hidden while a reveal is in flight so it doesn't
          overlap the modal's dismiss affordance. */}
      <BuyPacksFab
        dailyReady={props.dailyPackReady}
        disabled={revealPayload !== null}
        onClick={() => setBuyOpen(true)}
      />
      <BuyPacksModal
        open={buyOpen}
        onOpenChange={setBuyOpen}
        coinBalance={props.coinBalance}
        dailyReady={props.dailyPackReady}
        dailySecondsUntilReady={props.dailyPackSecondsUntilReady}
        standardCost={props.standardPackCost}
        onOpened={(result, packType) => {
          // Fire-and-forget; handleBatchOpened sets revealPayload
          // which opens the PackOpenerModal.
          void handleBatchOpened(result, packType);
        }}
      />
      <PackOpenerModal
        open={revealPayload !== null}
        onOpenChange={(next) => {
          if (!next) handleRevealClosed();
        }}
        result={revealPayload?.result ?? null}
        cards={revealPayload?.cards ?? []}
        existingByCardId={revealPayload?.existingByCardId ?? new Map()}
        onClosed={handleRevealClosed}
      />
    </DndProvider>
  );
}

/**
 * Polish spec §100 (Phase 34). Wraps CardDetailPanel with a Back
 * button at the top so users can return to the default sidebar.
 * Pre-P30 the SelectedCardSidebar component did this; P30 replaced
 * it with a modal; P33 reverted the swap pattern; P34 restores the
 * Back button affordance inline here.
 */
function DetailSidebar({
  cardId,
  slotted,
  onRemoveFromSlot,
  onVaulted,
  onClose,
}: {
  cardId: string;
  slotted: boolean;
  onRemoveFromSlot: () => void;
  onVaulted: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="-ml-2 flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-7 gap-1 px-2 text-[var(--text-2)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back
        </Button>
      </div>
      <CardDetailPanel
        cardId={cardId}
        lineupContext={{
          slotted,
          onRemoveFromSlot,
          onVaulted,
        }}
        onClose={onClose}
      />
    </div>
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
