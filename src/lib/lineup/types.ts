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
  /** FK to public.team.id for the player's current team. Used by the
   *  slot-footer game-state line to match the card to today's game. */
  teamId: string | null;
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
  /** Polish spec §46 (Phase 18). Populated by LineupView post-submit
   *  so the Card footer shows contest-scoped FP instead of career FP. */
  contestFp?: number | null;
  contestFpLabel?: "LIVE" | "FINAL";
};

/**
 * Polish spec §45 (Phase 18). Per-contest, per-slot game narration
 * surfaced on the lineup page. One entry per starter whose team has
 * a contest game today.
 */
export type SlotGameInfo = {
  gameId: string;
  /** The team the starter plays FOR (our player.team_id). */
  playerTeamId: string;
  /** The team abbreviation for the opponent (not our player). */
  opponentAbbr: string;
  /** True when our player's team is the home team in this game. */
  isHome: boolean;
  /** ISO timestamp. Null for unschedulued games. */
  scheduledStart: string | null;
  status: "scheduled" | "live" | "final" | "postponed" | "suspended" | "canceled";
  homeRuns: number | null;
  awayRuns: number | null;
  /** Polish spec §54 (Phase 20). 1-15+ during live play, NULL when
   *  scheduled or final. Webhook handler populates via play.inning. */
  currentInning: number | null;
  /** 'top' | 'bottom' during live play, NULL otherwise. */
  currentInningHalf: "top" | "bottom" | null;
  /** Polish spec §64 (Phase 22). 0-2 during live play, NULL when
   *  scheduled or final. Webhook handler populates via play.outs. */
  currentOuts: number | null;
  /** Polish spec §65 (Phase 22). 1 or 2 for DHs; 1 (or null) for
   *  single-game matchups. Drives the DH marker in the slot footer. */
  gameNumber: number | null;
  /** True when THIS matchup-date has both DH1 and DH2 rows in our DB.
   *  Drives whether the slot-footer DH marker renders at all — a
   *  single-game matchup shouldn't confuse users with "(DH1)". */
  hasDoubleHeader: boolean;
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
  /** Running FP from live events (before game_end reconcile). */
  liveFp: number;
  /** Authoritative FP after reconcile. Zero until the starter's game
   *  finalizes + reconcileGame runs. */
  finalFp: number;
};

export type LineupViewProps = {
  contestId: string;
  contestName: string;
  lineupLocksAt: string; // ISO
  entryId: string;
  entryStatus: "building" | "submitted" | "live" | "final";
  autoSubMode: AutoSubMode;
  /** Sum of live_fp across slots (live during games). Included so the
   *  unified view can render the Live Score big number in submitted/
   *  live/final states without an extra round-trip. Zero when building. */
  liveScore: number;
  /** Sum of final_fp across slots (settles after all games reconcile). */
  finalScore: number;
  /** Games the contest covers. Used to scope the Event Feed's initial
   *  fetch so we don't pull the full game_event table. */
  contestGameIds: string[];
  slots: LineupSlotVM[];
  cards: LineupCardVM[];
  tokens: LineupTokenVM[];
  tokenApplications: {
    id: string;
    tokenId: string;
    cardId: string;
    /**
     * Polish spec §128 (Phase 40). null = pending (no game event yet
     * fired the trigger AND entry not yet finalized). true = hit.
     * false = missed (set at entry finalize).
     */
    triggered: boolean | null;
  }[];
  /**
   * Polish spec §45. Per-card today's game info for slot footer +
   * per-slot lock derivation. Keyed by `card.id`.
   */
  slotGameByCardId: Record<string, SlotGameInfo>;
  /**
   * Polish spec §69 (Phase 23). Pre-formatted "{away}@{home}" matchup
   * strings keyed by `game.id`. Used by the Event Feed chip so each
   * event row says which game it belongs to. Spans every contest
   * game (including DH siblings), not just the DISTINCT ON winners
   * surfaced to the slot footer.
   */
  gameMatchupById: Record<string, string>;
  /**
   * Polish spec §109 (Phase 36). Coin balance for the buy-packs
   * modal + FAB. Kept on LineupViewProps so the modal doesn't need
   * a round-trip before rendering.
   */
  coinBalance: number;
  /** True when the daily pack hasn't been claimed in the last 24h. */
  dailyPackReady: boolean;
  /** Seconds until the daily pack rolls over (0 when ready). */
  dailyPackSecondsUntilReady: number;
  /** Coin cost of one standard pack. From economy_config. */
  standardPackCost: number;
};
