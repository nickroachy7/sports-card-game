export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type TokenType = 'captain' | 'boost' | 'shield' | 'spark' | 'lock';

export interface CardStat {
  label: string;
  value: number;
}

export interface Card {
  id: string;
  playerName: string;
  position: Position;
  team: string;
  rating: number;
  rarity: Rarity;
  stats: CardStat[];
}

export interface DragItem {
  card: Card;
  source: 'hand' | 'lineup';
  handIndex?: number;
  slotIndex?: number;
}

export interface Token {
  id:          string;
  type:        TokenType;
  symbol:      string;
  label:       string;
  description: string;
}

export interface TokenDragItem {
  token:      Token;
  source:     'tray' | 'slot';
  trayIndex?: number;
  slotIndex?: number;
}

export const LINEUP_POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#888888',
  rare: '#aaaaaa',
  epic: '#cccccc',
  legendary: '#e8e8e8',
};

/** Distinct grayscale per token type — intentionally offset from rarity values */
export const TOKEN_COLOR: Record<TokenType, string> = {
  captain: '#e4e0d4',   // warm off-white — most prestigious
  boost:   '#d0d0d0',
  spark:   '#b0b8b0',
  shield:  '#9898a8',
  lock:    '#787878',
};

export const TOKEN_META: Record<TokenType, { label: string; symbol: string; description: string }> = {
  captain: { label: '1.5×', symbol: '★', description: 'Earns 1.5× fantasy points this week'          },
  boost:   { label: '+5',   symbol: '↑', description: 'Adds +5 to this player\'s OVR rating'          },
  shield:  { label: 'DEF',  symbol: '◈', description: 'Player protected from injury this week'         },
  spark:   { label: 'SPK',  symbol: '◆', description: 'Activates a +10% point streak bonus'            },
  lock:    { label: 'LCK',  symbol: '⊡', description: 'Card locked to slot — cannot be benched'        },
};

export const CARD_DIMS = {
  hand:   { width: 84,  height: 118 },
  lineup: { width: 120, height: 168 },
  pack:   { width: 144, height: 202 },
};