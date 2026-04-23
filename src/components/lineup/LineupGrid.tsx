"use client";

import { useEffect, useRef, useState } from "react";

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
 * Polish spec §78 (Phase 26) + §80 (Phase 27) — responsive three-row
 * or two-row lineup layout.
 *
 * Phase 27 adds a mode picker. When the pane has enough vertical
 * space to fit three labeled role rows (~640px), we render the
 * Rotation / Infield / Outfield shape. When space is tight, we fall
 * back to a two-row grouping (Pitchers / Hitters) so the three-row
 * version's outfield doesn't clip below the fold.
 *
 * Card size stays `"lineup"` (120×168) in both modes. Per-slot
 * game-state pills (polish spec §45) render below every filled
 * card in both modes — restored in Phase 27 after being dropped in
 * P26. Pills carry the at-a-glance LIVE/FINAL/PRE signal that users
 * shouldn't have to chase into the Box Score for.
 *
 *   Three-row (tall panes):           Two-row (tight panes):
 *   ROTATION  [SP1] [SP2]              PITCHERS  [SP1] [SP2]
 *   INFIELD   [C] [1B] [2B] [3B] [SS]  HITTERS   [C][1B][2B][3B][SS][OF1][OF2][OF3]
 *   OUTFIELD       [OF1] [OF2] [OF3]
 *
 * Width note: two-row mode's hitter row needs ~1168px of main-pane
 * width (8 × 120 + 7 × 16 + label column + gap). Fits 1440px
 * laptops comfortably; very narrow viewports (≤1280 main-pane) may
 * see horizontal clip on the right side of the hitter row. Accepted
 * trade-off per user's "no scroll" rule.
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
 * Three-row mode vertical budget:
 *   3 rows × (168 card + 4 gap + 20 pill) + 2 row-gaps × 16 = 620px
 * plus some padding buffer. Use 640 as the threshold — anything
 * smaller drops to two-row.
 */
const THREE_ROW_MIN_PANE_HEIGHT = 640;

/** Fixed column for the inline role label — keeps labels vertically aligned. */
const LABEL_COL_WIDTH_PX = 80;

/**
 * Cards-area width per mode. Matches the widest row's natural width
 * so shorter rows can center-justify their cards within and align
 * visually on the same axis across rows.
 *   3-row: infield 5 cards × 120 + 4 gaps × 16 = 664
 *   2-row: hitters 8 cards × 120 + 7 gaps × 16 = 1072
 */
const CARDS_AREA_WIDTH_PX = {
  three: 664,
  two: 1072,
} as const;

export function LineupGrid({
  slotFills,
  onCardDropped,
  onTokenDropped,
  onRemoveToken,
  onOpenDetail,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rowMode, setRowMode] = useState<"three" | "two">("three");

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const recompute = () => {
      const rect = el.getBoundingClientRect();
      if (rect.height <= 0) return;
      setRowMode(rect.height >= THREE_ROW_MIN_PANE_HEIGHT ? "three" : "two");
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = rowMode === "three" ? THREE_ROWS : TWO_ROWS;
  const cardsAreaWidth = CARDS_AREA_WIDTH_PX[rowMode];

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full flex-col items-center justify-center px-4 py-4"
    >
      <div className="flex flex-col gap-4">
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
    <div className="flex items-center gap-4">
      <h3
        className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-[var(--text-3)]"
        style={{ width: LABEL_COL_WIDTH_PX }}
      >
        {label}
      </h3>
      <div className="flex items-start justify-center gap-4" style={{ width: cardsAreaWidth }}>
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
