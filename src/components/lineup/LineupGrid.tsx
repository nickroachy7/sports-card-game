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
 * Polish spec §78 (Phase 26) — three-role-row lineup with inline role
 * labels + lineup-size cards.
 *
 * Phase 25 matched lineup cards to bench size (96×134); on a typical
 * laptop pane the layout read as "tiny cards floating in a void." P26
 * addresses that with:
 *
 *   - `size="lineup"` (120×168) → cards 25% bigger than bench.
 *   - Per-slot chrome dropped for filled slots (no position label
 *     above, no result pill below, no inline remove). Fits 3 rows
 *     vertically on typical laptop viewports.
 *   - Role labels moved INLINE to the left of each card row so we
 *     save ~60px vertical vs the above-row stacked variant.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │ ROTATION  [SP1] [SP2]                         │
 *   │ INFIELD   [C] [1B] [2B] [3B] [SS]             │
 *   │ OUTFIELD  [OF1]  [OF2]  [OF3]                 │
 *   └──────────────────────────────────────────────┘
 *
 * Fixed label column = 80px wide so all three labels vertically
 * align. Cards area = natural infield width (5×120 + 4×16 = 664).
 * Total row = 80 + 16 + 664 = 760px; centered horizontally in the
 * pane. Rotation and Outfield rows center-justify their cards
 * within the 664px area so cards align on the same x-axis across
 * rows.
 */
const ROWS: ReadonlyArray<{ label: string; positions: readonly LineupPosition[] }> = [
  { label: "Rotation", positions: ["SP1", "SP2"] },
  { label: "Infield", positions: ["C", "1B", "2B", "3B", "SS"] },
  { label: "Outfield", positions: ["OF1", "OF2", "OF3"] },
] as const;

/**
 * Infield's natural width: 5 × 120 + 4 × 16 = 664.
 * All three rows share this width; rotation + outfield center within.
 */
const CARDS_AREA_WIDTH_PX = 664;
/** Fixed column for the inline role label — keeps labels vertically aligned. */
const LABEL_COL_WIDTH_PX = 80;

export function LineupGrid({
  slotFills,
  onCardDropped,
  onTokenDropped,
  onRemoveToken,
  onOpenDetail,
}: Props) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4 py-4">
      <div className="flex flex-col gap-4">
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
    <div className="flex items-center gap-4">
      <h3
        className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-[var(--text-3)]"
        style={{ width: LABEL_COL_WIDTH_PX }}
      >
        {label}
      </h3>
      <div className="flex justify-center gap-4" style={{ width: CARDS_AREA_WIDTH_PX }}>
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
