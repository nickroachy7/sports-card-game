"use client";

import { useEffect, useState } from "react";

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
 * Polish spec §82 (Phase 28) — flow-based lineup layout.
 *
 * Cards render at bench size (96×134). Role labels sit ABOVE each
 * row — classic section-header pattern. Rows are center-justified
 * within the page horizontally. When the viewport is tall enough
 * (window.innerHeight ≥ 940), we render three labeled rows (Rotation
 * / Infield / Outfield). Otherwise we collapse to two rows
 * (Pitchers / Hitters). Whichever mode, content flows naturally in
 * the page — no fixed pane, no forced centering, no overflow-hidden.
 * The outer `<main>` scrolls when needed.
 *
 *   Three-row:                        Two-row:
 *   ROTATION                           PITCHERS
 *   [SP1] [SP2]                        [SP1] [SP2]
 *   INFIELD                            HITTERS
 *   [C] [1B] [2B] [3B] [SS]            [C][1B][2B][3B][SS][OF1][OF2][OF3]
 *   OUTFIELD
 *   [OF1] [OF2] [OF3]
 *
 * Threshold note: 940 was chosen so 3-row only appears when the
 * whole page — header + lineup + bench + tokens — fits the viewport
 * without scroll. Most 13" laptops fall under that, landing in
 * 2-row mode. 14" MacBook Pro and up (or any external monitor) hit
 * 3-row naturally.
 */
const THREE_ROWS: ReadonlyArray<{ label: string; positions: readonly LineupPosition[] }> = [
  { label: "Rotation", positions: ["SP1", "SP2"] },
  { label: "Infield", positions: ["C", "1B", "2B", "3B", "SS"] },
  { label: "Outfield", positions: ["OF1", "OF2", "OF3"] },
] as const;

const TWO_ROWS: ReadonlyArray<{ label: string; positions: readonly LineupPosition[] }> = [
  { label: "Pitchers", positions: ["SP1", "SP2"] },
  { label: "Hitters", positions: ["C", "1B", "2B", "3B", "SS", "OF1", "OF2", "OF3"] },
] as const;

/**
 * Viewport height threshold — above this, the full 3-row layout +
 * bench + tokens + header fits without scroll on most displays.
 * Below, we use 2-row which fits comfortably in most laptop sizes.
 */
const THREE_ROW_MIN_INNER_HEIGHT = 940;

/**
 * Cards-area width per mode. Matches the widest row's natural width
 * at bench size (96×134):
 *   3-row: infield 5 cards × 96 + 4 gaps × 16 = 544
 *   2-row: hitters 8 cards × 96 + 7 gaps × 16 = 880
 */
const CARDS_AREA_WIDTH_PX = {
  three: 544,
  two: 880,
} as const;

export function LineupGrid({
  slotFills,
  onCardDropped,
  onTokenDropped,
  onRemoveToken,
  onOpenDetail,
}: Props) {
  const [rowMode, setRowMode] = useState<"three" | "two">("three");

  useEffect(() => {
    const recompute = () => {
      if (typeof window === "undefined") return;
      setRowMode(window.innerHeight >= THREE_ROW_MIN_INNER_HEIGHT ? "three" : "two");
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  const rows = rowMode === "three" ? THREE_ROWS : TWO_ROWS;
  const cardsAreaWidth = CARDS_AREA_WIDTH_PX[rowMode];

  return (
    <div className="flex w-full flex-col items-center gap-6 px-4 py-6">
      {rows.map((row) => (
        <RoleRow
          key={row.label}
          label={row.label}
          positions={row.positions}
          slotFills={slotFills}
          cardsAreaWidth={cardsAreaWidth}
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
  cardsAreaWidth,
  onCardDropped,
  onTokenDropped,
  onRemoveToken,
  onOpenDetail,
}: {
  label: string;
  positions: readonly LineupPosition[];
  slotFills: Props["slotFills"];
  cardsAreaWidth: number;
  onCardDropped: Props["onCardDropped"];
  onTokenDropped: Props["onTokenDropped"];
  onRemoveToken: Props["onRemoveToken"];
  onOpenDetail: Props["onOpenDetail"];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-3)]">
        {label}
      </h3>
      <div className="flex justify-center gap-4" style={{ width: cardsAreaWidth }}>
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
