"use client";

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
 * Polish spec §68 (Phase 23) + §76 (Phase 25) — three-role-row lineup
 * layout with bench-matching fixed card sizes.
 *
 * Phase 23 introduced the role rows; Phase 24 tried to make them
 * fluid via ResizeObserver + transform-scale; Phase 25 reverted the
 * fluid experiment because typical laptop viewports computed card
 * widths smaller than the bench's 96, producing the exact visual
 * inconsistency (tiny lineup cards, larger bench cards) the user
 * flagged.
 *
 * Design:
 *   ROTATION
 *            [SP1]      [SP2]
 *   INFIELD
 *   [C] [1B] [2B] [3B] [SS]
 *   OUTFIELD
 *        [OF1]  [OF2]  [OF3]
 *
 * Every row sits inside a shared-width container (544px = 5 cards ×
 * 96 + 4 gaps × 16, the natural infield width). Labels are block
 * elements inside that container so they flush to the same left
 * edge across all three rows. Rotation + Outfield rows center-
 * justify their cards within the shared container.
 */
const ROWS: ReadonlyArray<{ label: string; positions: readonly LineupPosition[] }> = [
  { label: "Rotation", positions: ["SP1", "SP2"] },
  { label: "Infield", positions: ["C", "1B", "2B", "3B", "SS"] },
  { label: "Outfield", positions: ["OF1", "OF2", "OF3"] },
] as const;

/**
 * 5 cards × 96 + 4 gaps × 16 = 544. All three rows share this width
 * so their labels + card groups align to a consistent left edge.
 */
const SHARED_ROW_WIDTH_PX = 544;

export function LineupGrid({
  slotFills,
  onCardDropped,
  onTokenDropped,
  onRemoveToken,
  onOpenDetail,
}: Props) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col gap-5" style={{ width: SHARED_ROW_WIDTH_PX }}>
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
    <div className="flex flex-col gap-2">
      <h3 className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
        {label}
      </h3>
      {/* `justify-center` is a no-op for the 5-card infield row (cards
          exactly fill the shared width) and centers the 2-card
          Rotation + 3-card Outfield rows within that shared width. */}
      <div className="flex justify-center gap-4">
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
