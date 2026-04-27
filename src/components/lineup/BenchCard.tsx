"use client";

import { Check } from "lucide-react";
import { useEffect } from "react";
import { useDrag } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";

import type { AppliedTokenInfo } from "@/app/(app)/lineup/lineup-view";
import { Card } from "@/components/card/Card";
import { dragResult } from "@/components/card/drag-layer-state";
import { useLiveCardFp } from "@/components/lineup/LiveEventsProvider";
import { SlotGameState } from "@/components/lineup/SlotGameState";
import { AppliedTokenBadge } from "@/components/token/AppliedTokenBadge";
import type { LineupPosition } from "@/lib/contracts/lineup";
import type { LineupCardVM, SlotGameInfo } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

import { type CardDragItem, DRAG_TYPES } from "./drag-types";

type Props = {
  card: LineupCardVM;
  assigned: boolean;
  /** Polish spec §94 (Phase 32). When non-null, the card is rostered
   *  in a lineup slot and this is that slot's position. Included in
   *  the drag item so the drop handler on LineupSlot routes through
   *  `swap_lineup_slots` instead of `update_lineup_slot`. */
  fromPosition?: LineupPosition | null;
  appliedToken?: AppliedTokenInfo;
  /** Polish spec §58 — today's game for this card's player, or null
   *  when they have no game in the contest. Drives the footer line
   *  below the card (same info as on a lineup slot). */
  gameInfo: SlotGameInfo | null;
  onRemoveToken: (applicationId: string) => void;
  onOpenDetail: (cardId: string) => void;
  /** Polish spec §104 (Phase 35). Multi-select mode on the cards
   *  grid. When true: click toggles selection (onToggleSelect) and
   *  drag is disabled. Checkmark + highlight border render based on
   *  `isSelected`. When false, click opens detail and drag works
   *  normally. */
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (cardId: string) => void;
  disabled: boolean;
  locked: boolean;
};

export function BenchCard({
  card: cardProp,
  assigned,
  fromPosition = null,
  appliedToken,
  gameInfo,
  onRemoveToken,
  onOpenDetail,
  selectMode = false,
  isSelected = false,
  onToggleSelect,
  disabled,
  locked,
}: Props) {
  // §224 (Phase 56). Live override on lifetime FP. The trigger
  // mirrors event FP onto `card.career_fp_total` for any rostered
  // card; bench (unrostered) cards stay at their server-rendered
  // value since no live update fires for them. Outside the provider
  // (collection / shop pages) the hook returns null and we fall
  // through to the static prop.
  const liveCareerFp = useLiveCardFp(cardProp.id);
  const card = liveCareerFp !== null ? { ...cardProp, careerFp: liveCareerFp } : cardProp;
  // Phase 35: drag is disabled in select mode so clicks route to
  // toggle-selection instead of starting a drag.
  const dragCanDrag = !disabled && !selectMode;
  const [{ isDragging }, dragRef, preview] = useDrag<CardDragItem, void, { isDragging: boolean }>(
    () => ({
      type: DRAG_TYPES.CARD,
      item: () => {
        dragResult.lastDropAccepted = false;
        const item: CardDragItem = { cardId: card.id, isPitcher: card.isPitcher };
        if (fromPosition) item.fromPosition = fromPosition;
        return item;
      },
      canDrag: dragCanDrag,
      end: (_item, monitor) => {
        dragResult.lastDropAccepted = monitor.didDrop();
      },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [card.id, card.isPitcher, dragCanDrag, fromPosition],
  );

  // Suppress the HTML5 drag ghost — the card itself plus our drop-indicators
  // communicate drag state more cleanly.
  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  const handleClick = () => {
    if (locked) return;
    if (selectMode) {
      onToggleSelect?.(card.id);
      return;
    }
    onOpenDetail(card.id);
  };

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div
        className={cn(
          "relative rounded-md transition-[box-shadow,transform] duration-150",
          // Phase 35: highlight ring when selected. `--tier-gold` is
          // distinct from tier-frame colors so it reads as selection
          // state even on Gold cards.
          isSelected &&
            "shadow-[0_0_0_2px_var(--tier-gold),0_0_0_4px_color-mix(in_oklab,var(--tier-gold)_30%,transparent)]",
        )}
      >
        <button
          type="button"
          ref={(el) => {
            dragRef(el);
          }}
          // Post-submit: spec §16 keeps bench cards visible but non-
          // interactive — no drag + no click-to-detail.
          onClick={locked ? undefined : handleClick}
          className={cn(
            "appearance-none border-0 bg-transparent p-0 transition-opacity",
            // Polish spec §117 (Phase 38). Source fully hidden while
            // dragging — the motion ghost in <CardDragLayer> IS the
            // card in flight; no stale copy at source.
            //
            // NB: NEVER add `pointer-events-none` here. HTML5 drag
            // fires dragstart → our state flips isDragging=true →
            // re-render. If the source then becomes pointer-events-
            // none, the browser treats the drag source as
            // unreachable and cancels the drag. Kept as opacity-0
            // only; the cursor is on the ghost anyway.
            isDragging && "opacity-0",
            !locked && assigned && !selectMode && "opacity-60",
            !locked && selectMode && !isSelected && "opacity-80",
            locked && "cursor-not-allowed opacity-50",
            !locked && disabled && !selectMode && "cursor-not-allowed",
            !locked && selectMode && "cursor-pointer",
            !locked &&
              !selectMode &&
              !disabled &&
              !isDragging &&
              "cursor-grab active:cursor-grabbing",
          )}
          aria-label={
            locked
              ? `${card.playerName}${assigned ? " (in lineup)" : ""} — lineup locked`
              : selectMode
                ? `${card.playerName} — ${isSelected ? "selected, click to deselect" : "click to select"}`
                : `${card.playerName}${assigned ? " (in lineup)" : ""} — click for detail`
          }
          aria-pressed={selectMode ? isSelected : undefined}
        >
          <Card card={card} size="small" />
        </button>
        {/* Phase 35 checkmark badge. Sits above the "IN LINEUP" pill
            since selection state is the active UI while select mode
            is on. */}
        {selectMode && isSelected && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-1 top-1 z-20 inline-flex size-5 items-center justify-center rounded-full bg-[var(--tier-gold)] text-[var(--bg)] shadow"
          >
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        )}
        {appliedToken && !selectMode && (
          <div className="-right-2 -bottom-2 absolute z-10">
            <AppliedTokenBadge
              tokenType={appliedToken.tokenType}
              bonusFp={appliedToken.bonusFp}
              onRemove={() => onRemoveToken(appliedToken.applicationId)}
              disabled={locked}
            />
          </div>
        )}
      </div>
      {/* Polish spec §58 — today's game state, same info as lineup
          slot footer. Off-day (no game) gets a muted "OFF". */}
      <SlotGameState info={gameInfo} variant="bench" />
    </div>
  );
}
