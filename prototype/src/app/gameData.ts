import { Card, Position, Rarity, Token, TokenType, TOKEN_META } from './types';

type CardTemplate = Omit<Card, 'id'>;

const POOL: CardTemplate[] = [
  { playerName: 'Darius Cole', position: 'PG', team: 'PHX', rating: 97, rarity: 'legendary', stats: [{ label: 'SPD', value: 98 }, { label: 'AST', value: 96 }, { label: 'STL', value: 87 }] },
  { playerName: 'Marcus Webb', position: 'SG', team: 'LAL', rating: 94, rarity: 'epic', stats: [{ label: 'SCR', value: 96 }, { label: 'SPD', value: 90 }, { label: 'DEF', value: 72 }] },
  { playerName: 'Terrell Hayes', position: 'SF', team: 'BOS', rating: 91, rarity: 'epic', stats: [{ label: 'SCR', value: 93 }, { label: 'REB', value: 78 }, { label: 'DEF', value: 84 }] },
  { playerName: 'Jordan Miles', position: 'PF', team: 'MIA', rating: 89, rarity: 'rare', stats: [{ label: 'REB', value: 91 }, { label: 'BLK', value: 86 }, { label: 'SCR', value: 72 }] },
  { playerName: 'Andre Stone', position: 'C', team: 'CHI', rating: 92, rarity: 'epic', stats: [{ label: 'REB', value: 95 }, { label: 'BLK', value: 93 }, { label: 'STR', value: 94 }] },
  { playerName: 'Kevin Rush', position: 'PG', team: 'GSW', rating: 86, rarity: 'rare', stats: [{ label: 'AST', value: 88 }, { label: 'SPD', value: 85 }, { label: 'SCR', value: 79 }] },
  { playerName: 'Chris Ford', position: 'SG', team: 'HOU', rating: 82, rarity: 'common', stats: [{ label: 'SCR', value: 84 }, { label: 'SPD', value: 80 }, { label: 'AST', value: 64 }] },
  { playerName: 'DeShawn Park', position: 'SF', team: 'DEN', rating: 85, rarity: 'rare', stats: [{ label: 'SCR', value: 85 }, { label: 'REB', value: 76 }, { label: 'AST', value: 71 }] },
  { playerName: 'Malik Johnson', position: 'PF', team: 'ATL', rating: 80, rarity: 'common', stats: [{ label: 'REB', value: 82 }, { label: 'BLK', value: 74 }, { label: 'SCR', value: 68 }] },
  { playerName: 'Tyrone Hill', position: 'C', team: 'PHI', rating: 88, rarity: 'rare', stats: [{ label: 'REB', value: 90 }, { label: 'BLK', value: 88 }, { label: 'STR', value: 89 }] },
  { playerName: 'Brandon Lee', position: 'PG', team: 'NYK', rating: 78, rarity: 'common', stats: [{ label: 'AST', value: 81 }, { label: 'SPD', value: 76 }, { label: 'SCR', value: 65 }] },
  { playerName: 'Isaiah Grant', position: 'SG', team: 'OKC', rating: 84, rarity: 'rare', stats: [{ label: 'SCR', value: 87 }, { label: 'SPD', value: 82 }, { label: 'STL', value: 78 }] },
  { playerName: 'Rashan Moore', position: 'SF', team: 'TOR', rating: 87, rarity: 'rare', stats: [{ label: 'SCR', value: 88 }, { label: 'DEF', value: 83 }, { label: 'REB', value: 72 }] },
  { playerName: 'Elijah Cross', position: 'PF', team: 'SAS', rating: 83, rarity: 'common', stats: [{ label: 'REB', value: 85 }, { label: 'SCR', value: 76 }, { label: 'BLK', value: 70 }] },
  { playerName: 'Victor Sharp', position: 'C', team: 'MEM', rating: 81, rarity: 'common', stats: [{ label: 'REB', value: 83 }, { label: 'STR', value: 88 }, { label: 'BLK', value: 75 }] },
  { playerName: 'Xavier Hunt', position: 'PG', team: 'MIN', rating: 90, rarity: 'epic', stats: [{ label: 'AST', value: 93 }, { label: 'SPD', value: 91 }, { label: 'SCR', value: 85 }] },
  { playerName: 'Damien Price', position: 'SG', team: 'NOP', rating: 79, rarity: 'common', stats: [{ label: 'SCR', value: 81 }, { label: 'STL', value: 75 }, { label: 'SPD', value: 77 }] },
  { playerName: 'Lamar Wells', position: 'SF', team: 'ORL', rating: 93, rarity: 'legendary', stats: [{ label: 'SCR', value: 95 }, { label: 'REB', value: 82 }, { label: 'DEF', value: 90 }] },
  { playerName: 'Reggie Shaw', position: 'PF', team: 'MIL', rating: 86, rarity: 'rare', stats: [{ label: 'REB', value: 88 }, { label: 'BLK', value: 82 }, { label: 'SCR', value: 74 }] },
  { playerName: 'Desmond Knox', position: 'C', team: 'DAL', rating: 95, rarity: 'legendary', stats: [{ label: 'REB', value: 97 }, { label: 'BLK', value: 96 }, { label: 'STR', value: 98 }] },
];

let counter = 0;

export function drawPack(): Card[] {
  const shuffled = [...POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5).map(card => ({
    ...card,
    id: `card-${Date.now()}-${++counter}`,
  }));
}

export const INITIAL_PACKS = 7;

// ── Tokens ───────────────────────────────────────────────────────────────────
let tokCounter = 0;
function tok(type: TokenType): Token {
  const meta = TOKEN_META[type];
  return { id: `tok-${++tokCounter}`, type, ...meta };
}

export const INITIAL_TOKENS: Token[] = [
  tok('captain'),
  tok('boost'),
  tok('boost'),
  tok('shield'),
  tok('spark'),
  tok('lock'),
];

export { POOL };