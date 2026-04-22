import type { LineupPosition } from "@/lib/contracts/lineup";

/** Shared react-dnd item types + payload shapes. */
export const DRAG_TYPES = {
  CARD: "lineup/card",
  TOKEN: "lineup/token",
} as const;

/**
 * A draggable card. When dragged from a lineup slot, `fromPosition`
 * carries the origin so the drop target can route to swap_lineup_slots
 * instead of update_lineup_slot.
 */
export type CardDragItem = {
  cardId: string;
  isPitcher: boolean;
  fromPosition?: LineupPosition;
};

export type TokenDragItem = {
  tokenId: string;
  isPitcherToken: boolean;
};
