"use client";

import { X } from "lucide-react";
import { useDrop } from "react-dnd";

import { Card } from "@/components/card/Card";
import type { LineupPosition } from "@/lib/contracts/lineup";
import { isPitcherSlot } from "@/lib/contracts/lineup";
import type { LineupCardVM } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

import { type CardDragItem, DRAG_TYPES, type TokenDragItem } from "./drag-types";

type Props = {
  position: LineupPosition;
  card: LineupCardVM | null;
  appliedToken: {
    type: string;
    bonusFp: number;
    applicationId: string;
  } | null;
  locked: boolean;
  onCardDropped: (cardId: string | null) => void;
  onTokenDropped: (tokenId: string) => void;
  onRemoveToken: (applicationId: string) => void;
};

export function LineupSlot({
  position,
  card,
  appliedToken,
  locked,
  onCardDropped,
  onTokenDropped,
  onRemoveToken,
}: Props) {
  const isPitcher = isPitcherSlot(position);

  // Card drop target — accepts any hitter card for hitter slots, any pitcher for SP slots.
  const [{ isCardOver, canCardDrop }, cardDropRef] = useDrop<
    CardDragItem,
    void,
    { isCardOver: boolean; canCardDrop: boolean }
  >(
    () => ({
      accept: DRAG_TYPES.CARD,
      canDrop: (item) => !locked && item.isPitcher === isPitcher,
      drop: (item) => {
        onCardDropped(item.cardId);
      },
      collect: (monitor) => ({
        isCardOver: monitor.isOver(),
        canCardDrop: monitor.canDrop(),
      }),
    }),
    [locked, isPitcher, onCardDropped],
  );

  // Token drop target — only accepts tokens whose type matches the slot's player type
  // AND only when a card is present in this slot.
  const [{ isTokenOver, canTokenDrop }, tokenDropRef] = useDrop<
    TokenDragItem,
    void,
    { isTokenOver: boolean; canTokenDrop: boolean }
  >(
    () => ({
      accept: DRAG_TYPES.TOKEN,
      canDrop: (item) => !locked && !!card && item.isPitcherToken === isPitcher,
      drop: (item) => {
        onTokenDropped(item.tokenId);
      },
      collect: (monitor) => ({
        isTokenOver: monitor.isOver(),
        canTokenDrop: monitor.canDrop(),
      }),
    }),
    [locked, isPitcher, card, onTokenDropped],
  );

  const ringClass = cn(
    "relative flex h-[134px] w-[96px] flex-col items-center justify-center rounded-md border-2 border-dashed transition-colors",
    isCardOver && canCardDrop && "border-[var(--text)] bg-[var(--surface-2)]",
    isCardOver && !canCardDrop && "border-[#C47262] bg-[#C4726222]",
    isTokenOver && canTokenDrop && "border-[var(--tier-gold,#D4A647)]",
    !isCardOver && !isTokenOver && "border-[var(--border)] bg-[var(--surface)]",
  );

  if (!card) {
    return (
      <section
        ref={(el) => {
          cardDropRef(el);
        }}
        className={ringClass}
        aria-label={`${position} slot, empty`}
      >
        <span className="font-sans text-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">
          {position}
        </span>
        <span className="mt-1 text-[9px] uppercase tracking-wider text-[var(--text-3)]">
          Drag {isPitcher ? "a pitcher" : "a hitter"}
        </span>
      </section>
    );
  }

  return (
    <section
      ref={(el) => {
        // Filled slots stack both refs — card-drop to swap, token-drop to apply.
        cardDropRef(el);
        tokenDropRef(el);
      }}
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-md transition-colors",
        isTokenOver && canTokenDrop && "ring-2 ring-[var(--tier-gold,#D4A647)]",
        isCardOver && canCardDrop && "ring-2 ring-[var(--text)]",
        isCardOver && !canCardDrop && "ring-2 ring-[#C47262]",
      )}
      aria-label={`${position} slot, ${card.playerName}`}
    >
      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-3)]">
        {position}
      </span>
      <Card card={card} size="small" />
      {appliedToken && (
        <div className="flex items-center gap-1 rounded-full border border-[var(--tier-gold,#D4A647)] bg-[var(--surface)] px-2 py-0.5 font-sans text-[9px] font-semibold uppercase tracking-wider text-[var(--tier-gold,#D4A647)]">
          <span>{formatTokenLabel(appliedToken.type)}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveToken(appliedToken.applicationId);
            }}
            disabled={locked}
            aria-label="Remove token"
            className="flex h-3 w-3 items-center justify-center rounded-full hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            <X className="size-2.5" aria-hidden="true" />
          </button>
        </div>
      )}
      {!appliedToken && !locked && (
        <button
          type="button"
          onClick={() => onCardDropped(null)}
          className="text-[10px] text-[var(--text-3)] underline-offset-2 hover:text-[var(--text-2)] hover:underline"
          aria-label={`Remove ${card.playerName}`}
        >
          remove
        </button>
      )}
    </section>
  );
}

function formatTokenLabel(tokenType: string): string {
  switch (tokenType) {
    case "hr_bonus":
      return "HR";
    case "multi_hit_bonus":
      return "2H";
    case "sb_bonus":
      return "SB";
    case "strikeout_bonus":
      return "K8+";
    case "quality_start_bonus":
      return "QS";
    default:
      return tokenType;
  }
}

export { formatTokenLabel };
