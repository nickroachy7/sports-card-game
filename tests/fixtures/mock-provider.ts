import type { MLBDataProvider } from "@/lib/mlb/provider";
import { setMLBProvider } from "@/lib/mlb/provider";

/**
 * MLBDataProvider test double — polish spec §19.
 *
 * Tests call `installMockProvider()` in beforeEach, push stats per
 * bdlGameId via `setMockStats`, run the production code path
 * (reconcileGame, etc.), and assert DB state. `afterEach` restores
 * the real provider via `resetMockProvider()`.
 *
 * Only `fetchGameStats` is implemented (the only path reconcile
 * uses); other methods throw so accidental usage is loud.
 */

/**
 * Minimal stat shape reconcile.ts actually reads (see BdlStats
 * in src/lib/mlb/reconcile.ts). Tests populate these; any field
 * the real SDK exposes but reconcile doesn't touch is irrelevant.
 */
export type MockStat = {
  playerBdlId: number;
  gameBdlId: number;
  hits?: number;
  hr?: number;
  rbi?: number;
  runs?: number;
  bb?: number;
  ip?: number;
  p_k?: number;
  er?: number;
  p_hits?: number;
  p_bb?: number;
  p_runs?: number;
};

function toBdlShape(s: MockStat): Record<string, unknown> {
  return {
    player: { id: s.playerBdlId },
    game: { id: s.gameBdlId },
    hits: s.hits ?? 0,
    hr: s.hr ?? 0,
    rbi: s.rbi ?? 0,
    runs: s.runs ?? 0,
    bb: s.bb ?? 0,
    ip: s.ip ?? 0,
    p_k: s.p_k ?? 0,
    er: s.er ?? 0,
    p_hits: s.p_hits ?? 0,
    p_bb: s.p_bb ?? 0,
    p_runs: s.p_runs ?? 0,
  };
}

class FakeMLBProvider implements MLBDataProvider {
  private readonly statsByGame = new Map<number, Record<string, unknown>[]>();

  setMockStats(bdlGameId: number, stats: MockStat[]): void {
    this.statsByGame.set(bdlGameId, stats.map(toBdlShape));
  }

  clear(): void {
    this.statsByGame.clear();
  }

  // biome-ignore lint/suspicious/noExplicitAny: test double returns the narrow shape reconcile consumes.
  async fetchGameStats(gameId: number): Promise<any[]> {
    return this.statsByGame.get(gameId) ?? [];
  }

  fetchTeams(): never {
    throw new Error("mock-provider: fetchTeams not stubbed — add if a test needs it");
  }
  fetchActivePlayers(): never {
    throw new Error("mock-provider: fetchActivePlayers not stubbed — add if a test needs it");
  }
  fetchPlayerInjuries(): never {
    throw new Error("mock-provider: fetchPlayerInjuries not stubbed — add if a test needs it");
  }
  fetchGamesByDate(): never {
    throw new Error("mock-provider: fetchGamesByDate not stubbed — add if a test needs it");
  }
  fetchGame(): never {
    throw new Error("mock-provider: fetchGame not stubbed — add if a test needs it");
  }
}

let activeMock: FakeMLBProvider | null = null;

export function installMockProvider(): FakeMLBProvider {
  activeMock = new FakeMLBProvider();
  setMLBProvider(activeMock);
  return activeMock;
}

export function resetMockProvider(): void {
  activeMock = null;
  setMLBProvider(null);
}

export function getActiveMock(): FakeMLBProvider {
  if (!activeMock) {
    throw new Error("mock-provider: no active mock — call installMockProvider() in beforeEach");
  }
  return activeMock;
}
