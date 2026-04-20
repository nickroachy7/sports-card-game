/** Shared react-dnd item types + payload shapes. */
export const DRAG_TYPES = {
  CARD: "lineup/card",
  TOKEN: "lineup/token",
} as const;

export type CardDragItem = {
  cardId: string;
  isPitcher: boolean;
};

export type TokenDragItem = {
  tokenId: string;
  isPitcherToken: boolean;
};
