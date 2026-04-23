"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import type { LineupPosition } from "@/lib/contracts/lineup";
import type { LineupCardVM, SlotGameInfo } from "@/lib/lineup/types";
import { LineupSlot } from "./LineupSlot";

type SlotFill = {
  card: LineupCardVM | null;
  appliedToken: {
    type: string;
    bonusFp: number;
    applicationId: string;
  } | null;
  /** Polish spec §44 — per-slot lock derived from gameInfo + building state. */
  locked: boolean;
  /** Polish spec §45 — game info for this slot (if any). */
  gameInfo: SlotGameInfo | null;
};

type Props = {
  slotFills: Record<LineupPosition, SlotFill>;
  onCardDropped: (
    position: LineupPosition,
    cardId: string | null,
    fromPosition: LineupPosition | null,
  ) => void;
  onTokenDropped: (position: LineupPosition, tokenId: string) => void;
  onRemoveToken: (applicationId: string) => void;
  onOpenDetail: (cardId: string) => void;
};

/**
 * Polish spec §68 (Phase 23) + §74 (Phase 24) — three-role-row lineup
 * layout with fit-to-pane card scaling.
 *
 * Phase 23 replaced the diamond with three labeled rows (Rotation /
 * Infield / Outfield). Phase 24 makes those rows fluid: the grid
 * measures its pane via ResizeObserver, computes a target card width
 * that fits both the pane-width (5 cards wide) and pane-height (3
 * rows + chrome), and exposes that as CSS custom properties.
 *
 * LineupSlot reads `--card-w-px` + `--card-scale` and renders its
 * 96×134 `<Card size="small" />` inside a transform:scale() shell —
 * the shell's layout-box matches the target size while the inner
 * card keeps its hardcoded measurements. This avoids a Card.tsx
 * refactor.
 */
const ROWS: ReadonlyArray<{ label: string; positions: readonly LineupPosition[] }> = [
  { label: "Rotation", positions: ["SP1", "SP2"] },
  { label: "Infield", positions: ["C", "1B", "2B", "3B", "SS"] },
  { label: "Outfield", positions: ["OF1", "OF2", "OF3"] },
] as const;

/**
 * Layout constants used by the sizing math. These mirror the Tailwind
 * classes on the grid + rows below; keep them in sync if either side
 * changes. Purely numeric — the measurement helper needs raw pixels.
 */
const LAYOUT = {
  /** p-6 top + bottom (24 * 2). */
  GRID_PADDING_Y: 48,
  /** p-6 left + right (24 * 2). */
  GRID_PADDING_X: 48,
  /** gap-4 between the three rows (16px * 2 gaps). */
  ROW_GAP_Y: 16,
  /** Row label font size + gap-1 below (text-[10px] uppercase + 4px gap). */
  ROW_LABEL_H: 22,
  /** Per-slot chrome: position label (~14px line) + SlotGameState pill
   *  (~22px) + remove button (~16px) + gaps (~18px). Reserved per
   *  slot's flex column, outside the card shell. */
  SLOT_CHROME_H: 70,
  /** gap-4 between cards within a row (16px * 4 gaps for 5-card infield). */
  CARD_GAP_X: 16,
  /** `<Card size="small">` inline width. */
  CARD_BASE_W: 96,
  /** `<Card size="small">` inline height. */
  CARD_BASE_H: 134,
  /** Aspect ratio (h / w) = 134 / 96 ≈ 1.396. */
  CARD_ASPECT: 134 / 96,
  /** Cap so cards don't grow absurdly on 4K-class monitors.
   *  Polish spec §74 called ~180-220px; 200 sits centrally. */
  CARD_MAX_W: 200,
  /** Floor so micro-viewports still render a shape, even if illegible.
   *  Realistic viewports stay above this. */
  CARD_MIN_W: 60,
};

/**
 * Compute the card width that fits the pane given both axes. Picks the
 * tighter of the width-derived and height-derived limits, then caps and
 * floors. Return value feeds both `--card-w-px` (length) and
 * `--card-scale` (unitless = w / CARD_BASE_W).
 */
function computeCardWidth(paneW: number, paneH: number): number {
  const usableH =
    paneH -
    LAYOUT.GRID_PADDING_Y -
    2 * LAYOUT.ROW_GAP_Y -
    3 * LAYOUT.ROW_LABEL_H -
    3 * LAYOUT.SLOT_CHROME_H;
  const rowCardH = usableH / 3;
  const widthFromHeight = rowCardH / LAYOUT.CARD_ASPECT;
  const widthFromWidth = (paneW - LAYOUT.GRID_PADDING_X - 4 * LAYOUT.CARD_GAP_X) / 5;
  return Math.max(LAYOUT.CARD_MIN_W, Math.min(LAYOUT.CARD_MAX_W, widthFromHeight, widthFromWidth));
}

export function LineupGrid({
  slotFills,
  onCardDropped,
  onTokenDropped,
  onRemoveToken,
  onOpenDetail,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = useState(LAYOUT.CARD_BASE_W);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const recompute = () => {
      const rect = el.getBoundingClientRect();
      // During SSR hydration the element may have zero dimensions for
      // one frame; guard so we don't emit NaN into the CSS var.
      if (rect.width <= 0 || rect.height <= 0) return;
      setCardW(computeCardWidth(rect.width, rect.height));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const styleVars: CSSProperties = {
    // Consumed by LineupSlot's scaling shell. `--card-w-px` is the
    // reserved layout width; `--card-scale` scales the inner 96×134
    // box to fill it. Both vars are set together so they stay in sync.
    ["--card-w-px" as string]: `${cardW}px`,
    ["--card-scale" as string]: (cardW / LAYOUT.CARD_BASE_W).toString(),
  };

  return (
    <div ref={rootRef} style={styleVars} className="flex h-full w-full flex-col gap-4 p-6">
      {ROWS.map((row) => (
        <RoleRow
          key={row.label}
          label={row.label}
          positions={row.positions}
          slotFills={slotFills}
          onCardDropped={onCardDropped}
          onTokenDropped={onTokenDropped}
          onRemoveToken={onRemoveToken}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </div>
  );
}

function RoleRow({
  label,
  positions,
  slotFills,
  onCardDropped,
  onTokenDropped,
  onRemoveToken,
  onOpenDetail,
}: {
  label: string;
  positions: readonly LineupPosition[];
  slotFills: Props["slotFills"];
  onCardDropped: Props["onCardDropped"];
  onTokenDropped: Props["onTokenDropped"];
  onRemoveToken: Props["onRemoveToken"];
  onOpenDetail: Props["onOpenDetail"];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <h3 className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
        {label}
      </h3>
      <div className="flex flex-1 items-start justify-center gap-4">
        {positions.map((position) => {
          const fill = slotFills[position];
          return (
            <LineupSlot
              key={position}
              position={position}
              card={fill.card}
              appliedToken={fill.appliedToken}
              locked={fill.locked}
              gameInfo={fill.gameInfo}
              onCardDropped={(cardId, fromPosition) =>
                onCardDropped(position, cardId, fromPosition)
              }
              onTokenDropped={(tokenId) => onTokenDropped(position, tokenId)}
              onRemoveToken={onRemoveToken}
              onOpenDetail={onOpenDetail}
            />
          );
        })}
      </div>
    </div>
  );
}
