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
 * Polish spec §68 (Phase 23) — three-role-row lineup layout.
 *
 * Replaces the pre-P23 MLB-diamond-inspired 5x4 grid. The diamond
 * metaphor didn't carry its weight — users scan left-to-right, not
 * catcher-up-to-outfield. Three labeled rows read as a roster:
 *
 *   ROTATION   │       SP1      SP2
 *   INFIELD    │    C   1B   2B   3B   SS
 *   OUTFIELD   │        OF1    OF2    OF3
 *
 * Row 1 + Row 3 center-justify against Row 2's five-wide infield so
 * the short rows don't look left-biased. Card size is uniform across
 * all roles — the old diamond implicitly made edge cards feel smaller
 * due to the 5-col grid stretching.
 */
const ROWS: ReadonlyArray<{ label: string; positions: readonly LineupPosition[] }> = [
  { label: "Rotation", positions: ["SP1", "SP2"] },
  { label: "Infield", positions: ["C", "1B", "2B", "3B", "SS"] },
  { label: "Outfield", positions: ["OF1", "OF2", "OF3"] },
] as const;

export function LineupGrid({
  slotFills,
  onCardDropped,
  onTokenDropped,
  onRemoveToken,
  onOpenDetail,
}: Props) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
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
    <div className="flex flex-col gap-2">
      <h3 className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
        {label}
      </h3>
      <div className="flex flex-wrap justify-center gap-4">
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
