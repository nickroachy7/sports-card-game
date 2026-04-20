import type { CardTier, PlayerStatus, TokenType } from "@/lib/contracts/cards";
import type { AutoSubMode, LineupPosition } from "@/lib/contracts/lineup";

/**
 * A card view model enriched with fields needed on the lineup page.
 * Superset of CardViewModel — `hasAppliedToken` is derived from
 * `appliedTokenId`, so the Card component can render either shape.
 */
export type LineupCardVM = {
  id: string;
  playerId: string;
  playerName: string;
  position: string | null;
  positions: string[];
  teamAbbreviation: string | null;
  tier: CardTier;
  careerFp: number;
  contractPlays: number;
  contractMax: number;
  playerStatus: PlayerStatus;
  isExpired: boolean;
  hasAppliedToken: boolean;
  isPitcher: boolean;
  appliedTokenId: string | null;
  photoUrl: string | null;
};

export type LineupTokenVM = {
  id: string;
  tokenType: TokenType;
  bonusFp: number;
  isPitcherToken: boolean;
  appliedToCardId: string | null;
  appliedToContestId: string | null;
};

export type LineupSlotVM = {
  position: LineupPosition;
  starterCardId: string | null;
  tokenApplicationId: string | null;
};

export type LineupViewProps = {
  contestId: string;
  contestName: string;
  lineupLocksAt: string; // ISO
  entryId: string;
  entryStatus: "building" | "submitted" | "locked" | "live" | "final";
  autoSubMode: AutoSubMode;
  slots: LineupSlotVM[];
  cards: LineupCardVM[];
  tokens: LineupTokenVM[];
  tokenApplications: {
    id: string;
    tokenId: string;
    cardId: string;
  }[];
};
