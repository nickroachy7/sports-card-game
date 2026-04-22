"use client";

import type { LineupPosition } from "@/lib/contracts/lineup";
import type { LineupCardVM } from "@/lib/lineup/types";
import { LineupSlot } from "./LineupSlot";

type SlotFill = {
  card: LineupCardVM | null;
  appliedToken: {
    type: string;
    bonusFp: number;
    applicationId: string;
  } | null;
};

type Props = {
  slotFills: Record<LineupPosition, SlotFill>;
  locked: boolean;
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
 * MLB diamond-inspired positional grid — UI/UX spec §5.1.1.
 *
 *   .  SP1  .  SP2  .
 *   3B  SS  .  2B  1B
 *   .  .   C   .   .
 *   OF1 .  OF2  .  OF3
 */
export function DiamondGrid({
  slotFills,
  locked,
  onCardDropped,
  onTokenDropped,
  onRemoveToken,
  onOpenDetail,
}: Props) {
  function slot(position: LineupPosition) {
    const fill = slotFills[position];
    return (
      <LineupSlot
        position={position}
        card={fill.card}
        appliedToken={fill.appliedToken}
        locked={locked}
        onCardDropped={(cardId, fromPosition) => onCardDropped(position, cardId, fromPosition)}
        onTokenDropped={(tokenId) => onTokenDropped(position, tokenId)}
        onRemoveToken={onRemoveToken}
        onOpenDetail={onOpenDetail}
      />
    );
  }

  return (
    <div
      className="mx-auto grid w-full max-w-3xl justify-items-center gap-y-3 px-4 py-4"
      style={{
        gridTemplateColumns: "repeat(5, minmax(96px, 1fr))",
        gridTemplateRows: "repeat(4, auto)",
      }}
    >
      {/* Row 1: SP1 . . . SP2 */}
      <div className="col-start-1">{slot("SP1")}</div>
      <div className="col-start-5">{slot("SP2")}</div>

      {/* Row 2: 3B SS . 2B 1B */}
      <div className="col-start-1 row-start-2">{slot("3B")}</div>
      <div className="col-start-2 row-start-2">{slot("SS")}</div>
      <div className="col-start-4 row-start-2">{slot("2B")}</div>
      <div className="col-start-5 row-start-2">{slot("1B")}</div>

      {/* Row 3: . . C . . */}
      <div className="col-start-3 row-start-3">{slot("C")}</div>

      {/* Row 4: OF1 . OF2 . OF3 */}
      <div className="col-start-1 row-start-4">{slot("OF1")}</div>
      <div className="col-start-3 row-start-4">{slot("OF2")}</div>
      <div className="col-start-5 row-start-4">{slot("OF3")}</div>
    </div>
  );
}
