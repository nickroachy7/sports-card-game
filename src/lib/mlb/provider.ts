import type { MLBGame, MLBPlayer, MLBPlayerInjury, MLBStats, MLBTeam } from "@balldontlie/sdk";

import { getBdlClient } from "./client";
import { paginate } from "./paginate";
import { withBdlRetry } from "./retry";

/**
 * Provider abstraction so callers don't depend directly on @balldontlie/sdk.
 * Swappable with a different MLB data source later (MLB Stats API,
 * Sportradar, etc.) by implementing this interface.
 *
 * Shapes stay 1:1 with the SDK's types — domain code already maps to
 * those fields in Drizzle schema, and parallel types would duplicate
 * work.
 */
export interface MLBDataProvider {
  fetchTeams(): Promise<MLBTeam[]>;
  fetchActivePlayers(): AsyncIterable<MLBPlayer>;
  /**
   * Iterate every player BDL knows on the given team (no "active"
   * filter). Polish spec §41 — `getActivePlayers` was too narrow
   * (excluded 60-day IL + recently-optioned players that ARE on the
   * 40-man). This path picks them up.
   */
  fetchPlayersByTeam(teamBdlId: number): AsyncIterable<MLBPlayer>;
  fetchPlayerInjuries(): Promise<MLBPlayerInjury[]>;
  fetchGamesByDate(date: Date): Promise<MLBGame[]>;
  fetchGame(gameId: number): Promise<MLBGame>;
  fetchGameStats(gameId: number): Promise<MLBStats[]>;
}

/** ISO YYYY-MM-DD for a Date (UTC). BDL getGames expects this shape. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

class BallDontLieProvider implements MLBDataProvider {
  async fetchTeams(): Promise<MLBTeam[]> {
    const bdl = getBdlClient();
    const response = await withBdlRetry(() => bdl.mlb.getTeams());
    return response.data;
  }

  fetchActivePlayers(): AsyncIterable<MLBPlayer> {
    const bdl = getBdlClient();
    return paginate((cursor) => bdl.mlb.getActivePlayers({ cursor, per_page: 100 }));
  }

  fetchPlayersByTeam(teamBdlId: number): AsyncIterable<MLBPlayer> {
    const bdl = getBdlClient();
    return paginate((cursor) =>
      bdl.mlb.getPlayers({ cursor, per_page: 100, team_ids: [teamBdlId] }),
    );
  }

  async fetchPlayerInjuries(): Promise<MLBPlayerInjury[]> {
    const bdl = getBdlClient();
    const out: MLBPlayerInjury[] = [];
    for await (const injury of paginate((cursor) =>
      bdl.mlb.getPlayerInjuries({ cursor, per_page: 100 }),
    )) {
      out.push(injury);
    }
    return out;
  }

  async fetchGamesByDate(date: Date): Promise<MLBGame[]> {
    const bdl = getBdlClient();
    const dates = [isoDate(date)];
    const out: MLBGame[] = [];
    for await (const game of paginate((cursor) =>
      bdl.mlb.getGames({ cursor, per_page: 100, dates }),
    )) {
      out.push(game);
    }
    return out;
  }

  async fetchGame(gameId: number): Promise<MLBGame> {
    const bdl = getBdlClient();
    const response = await withBdlRetry(() => bdl.mlb.getGame(gameId));
    return response.data;
  }

  async fetchGameStats(gameId: number): Promise<MLBStats[]> {
    const bdl = getBdlClient();
    const out: MLBStats[] = [];
    for await (const stat of paginate((cursor) =>
      bdl.mlb.getStats({ cursor, per_page: 100, game_ids: [gameId] }),
    )) {
      out.push(stat);
    }
    return out;
  }
}

let defaultProvider: MLBDataProvider | null = null;

/** Default provider — @balldontlie/sdk-backed. Swap via setMLBProvider in tests. */
export function getMLBProvider(): MLBDataProvider {
  if (!defaultProvider) defaultProvider = new BallDontLieProvider();
  return defaultProvider;
}

/** Install an alternate provider (tests, fakes). */
export function setMLBProvider(provider: MLBDataProvider | null): void {
  defaultProvider = provider;
}
