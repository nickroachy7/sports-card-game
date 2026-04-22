import type { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { closeDb } from "@/lib/db/client";
import { reconcileGame } from "@/lib/mlb/reconcile";

import { installMockProvider, resetMockProvider } from "../fixtures/mock-provider";
import {
  cleanupUser,
  getSeedClient,
  getTestSeason,
  getTestTeam,
  seedCard,
  seedContest,
  seedContestEntry,
  seedGame,
  seedPlayer,
  seedToken,
  seedTokenApplication,
  seedUser,
  setLineupSlot,
} from "../fixtures/seed";

/**
 * Integration test — polish spec §19, roadmap P11.2.
 *
 * Drives reconcileGame() end-to-end: seeds a real lineup, stubs
 * the BDL provider, runs the fn, asserts DB state. Catches the
 * same class of latent bug P9.5 surfaced (UPDATE-FROM + subquery
 * regression) plus future scoring-path regressions.
 *
 * Prereq: `supabase start` running at 127.0.0.1:64322.
 */

describe("reconcileGame", () => {
  let client: Client;
  let seasonId: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    client = await getSeedClient();
    seasonId = await getTestSeason(client);
  });

  afterAll(async () => {
    // Clean up any lingering users if a test forgot to.
    for (const id of userIds) {
      await cleanupUser(client, id).catch(() => undefined);
    }
    await client.end();
    await closeDb();
  });

  beforeEach(() => {
    installMockProvider();
  });

  afterEach(() => {
    resetMockProvider();
  });

  async function setupEntry(status: "live" | "submitted" | "final" = "live") {
    const { userId } = await seedUser(client, { seasonId });
    userIds.push(userId);
    const homeTeamId = await getTestTeam(client, 0);
    const awayTeamId = await getTestTeam(client, 1);
    const gameId = await seedGame(client, {
      seasonId,
      homeTeamId,
      awayTeamId,
      status: "final",
      homeRuns: 5,
      awayRuns: 2,
    });
    // Look up the game's bdl id so the mock provider gets keyed right.
    const { rows } = await client.query<{ bdl_game_id: number }>(
      "SELECT bdl_game_id FROM public.game WHERE id = $1",
      [gameId],
    );
    const bdlGameId = rows[0]?.bdl_game_id;
    if (!bdlGameId) throw new Error("seeded game missing bdl_game_id");

    const contestId = await seedContest(client, { seasonId, gameIds: [gameId] });
    const entryId = await seedContestEntry(client, {
      userId,
      contestId,
      seasonId,
      status,
    });
    return { userId, gameId, bdlGameId, contestId, entryId, homeTeamId, awayTeamId };
  }

  it("happy path: writes final_fp per hitter and rolls up entry.final_score", async () => {
    const { userId, gameId, bdlGameId, contestId, entryId, homeTeamId } = await setupEntry("live");

    const p1 = await seedPlayer(client, {
      firstName: "Alpha",
      lastName: "Hitter",
      positions: ["Catcher"],
      teamId: homeTeamId,
    });
    const p2 = await seedPlayer(client, {
      firstName: "Bravo",
      lastName: "Hitter",
      positions: ["First Baseman"],
      teamId: homeTeamId,
    });
    const c1 = await seedCard(client, { userId, seasonId, playerId: p1 });
    const c2 = await seedCard(client, { userId, seasonId, playerId: p2 });
    await setLineupSlot(client, { entryId, position: "C", cardId: c1 });
    await setLineupSlot(client, { entryId, position: "1B", cardId: c2 });

    const p1Bdl = (
      await client.query<{ bdl_player_id: number }>(
        "SELECT bdl_player_id FROM public.player WHERE id = $1",
        [p1],
      )
    ).rows[0]?.bdl_player_id;
    const p2Bdl = (
      await client.query<{ bdl_player_id: number }>(
        "SELECT bdl_player_id FROM public.player WHERE id = $1",
        [p2],
      )
    ).rows[0]?.bdl_player_id;
    if (!p1Bdl || !p2Bdl) throw new Error("players missing bdl ids");

    const mock = installMockProvider();
    mock.setMockStats(bdlGameId, [
      // 2 singles + 1 RBI + 1 R + 1 BB  = 3+3+2+2+2 = 12 FP
      { playerBdlId: p1Bdl, gameBdlId: bdlGameId, hits: 2, rbi: 1, runs: 1, bb: 1 },
      // 1 HR + 2 RBI = 10+4 = 14 FP
      { playerBdlId: p2Bdl, gameBdlId: bdlGameId, hits: 1, hr: 1, rbi: 2 },
    ]);

    const result = await reconcileGame(bdlGameId);
    expect(result.game_id).toBe(gameId);
    expect(result.slots_updated).toBe(2);

    const slotRows = await client.query<{ position: string; final_fp: string }>(
      `SELECT position, final_fp FROM public.contest_lineup_slot
       WHERE contest_entry_id = $1 ORDER BY position`,
      [entryId],
    );
    const byPos = new Map(slotRows.rows.map((r) => [r.position, Number(r.final_fp)]));
    expect(byPos.get("C")).toBeCloseTo(12, 2);
    expect(byPos.get("1B")).toBeCloseTo(14, 2);

    const entryRow = await client.query<{ final_score: string }>(
      "SELECT final_score FROM public.contest_entry WHERE id = $1",
      [entryId],
    );
    expect(Number(entryRow.rows[0]?.final_score)).toBeCloseTo(26, 2);

    await cleanupUser(client, userId);
    void contestId;
  });

  it("empty stats: no slot writes, no errors", async () => {
    const { userId, gameId, bdlGameId, entryId, homeTeamId } = await setupEntry("live");
    const p1 = await seedPlayer(client, { teamId: homeTeamId, positions: ["Catcher"] });
    const c1 = await seedCard(client, { userId, seasonId, playerId: p1 });
    await setLineupSlot(client, { entryId, position: "C", cardId: c1 });

    const mock = installMockProvider();
    mock.setMockStats(bdlGameId, []); // empty

    const result = await reconcileGame(bdlGameId);
    expect(result.game_id).toBe(null); // early-returns before game lookup
    expect(result.slots_updated).toBe(0);

    const slotRow = await client.query<{ final_fp: string }>(
      "SELECT final_fp FROM public.contest_lineup_slot WHERE contest_entry_id = $1 AND position = 'C'",
      [entryId],
    );
    expect(Number(slotRow.rows[0]?.final_fp)).toBe(0);

    await cleanupUser(client, userId);
    void gameId;
  });

  it("QS token: 6+ IP + ≤ 3 ER triggers + bonus adds to slot FP", async () => {
    const { userId, bdlGameId, contestId, entryId, homeTeamId } = await setupEntry("live");

    const pitcher = await seedPlayer(client, {
      firstName: "Ace",
      lastName: "Starter",
      positions: ["Starting Pitcher"],
      isPitcher: true,
      teamId: homeTeamId,
    });
    const pitcherCard = await seedCard(client, { userId, seasonId, playerId: pitcher });

    const tokenId = await seedToken(client, {
      userId,
      seasonId,
      tokenType: "quality_start_bonus",
      bonusFp: 8,
    });
    const applicationId = await seedTokenApplication(client, {
      userId,
      tokenId,
      cardId: pitcherCard,
      contestId,
    });
    await setLineupSlot(client, {
      entryId,
      position: "SP1",
      cardId: pitcherCard,
      tokenApplicationId: applicationId,
    });

    const pitcherBdl = (
      await client.query<{ bdl_player_id: number }>(
        "SELECT bdl_player_id FROM public.player WHERE id = $1",
        [pitcher],
      )
    ).rows[0]?.bdl_player_id;
    if (!pitcherBdl) throw new Error("pitcher missing bdl id");

    const mock = installMockProvider();
    // 6 IP, 2 ER, 5 K, 4 hits, 1 BB
    //   IP*2.25=13.5, K*2=10, ER*-2=-4, hits*-0.6=-2.4, BB*-0.6=-0.6
    //   = 16.5 raw FP, +8 QS bonus = 24.5
    mock.setMockStats(bdlGameId, [
      {
        playerBdlId: pitcherBdl,
        gameBdlId: bdlGameId,
        ip: 6,
        er: 2,
        p_k: 5,
        p_hits: 4,
        p_bb: 1,
      },
    ]);

    const result = await reconcileGame(bdlGameId);
    expect(result.qs_tokens_triggered).toBe(1);

    const appRow = await client.query<{
      triggered: boolean | null;
      bonus_fp_awarded: string;
    }>("SELECT triggered, bonus_fp_awarded FROM public.token_application WHERE id = $1", [
      applicationId,
    ]);
    expect(appRow.rows[0]?.triggered).toBe(true);
    expect(Number(appRow.rows[0]?.bonus_fp_awarded)).toBeCloseTo(8, 2);

    const slotRow = await client.query<{ final_fp: string }>(
      "SELECT final_fp FROM public.contest_lineup_slot WHERE contest_entry_id = $1 AND position = 'SP1'",
      [entryId],
    );
    expect(Number(slotRow.rows[0]?.final_fp)).toBeCloseTo(24.5, 2);

    await cleanupUser(client, userId);
  });

  it("winning-pitcher attribution: emits synthetic pitcher_win game_event", async () => {
    const { userId, gameId, bdlGameId, entryId, homeTeamId } = await setupEntry("live");

    const pitcher = await seedPlayer(client, {
      firstName: "Win",
      lastName: "Ner",
      positions: ["Starting Pitcher"],
      isPitcher: true,
      teamId: homeTeamId, // home team wins 5-2
    });
    const pitcherCard = await seedCard(client, { userId, seasonId, playerId: pitcher });
    await setLineupSlot(client, { entryId, position: "SP1", cardId: pitcherCard });

    const pitcherBdl = (
      await client.query<{ bdl_player_id: number }>(
        "SELECT bdl_player_id FROM public.player WHERE id = $1",
        [pitcher],
      )
    ).rows[0]?.bdl_player_id;
    if (!pitcherBdl) throw new Error("pitcher missing bdl id");

    const mock = installMockProvider();
    mock.setMockStats(bdlGameId, [
      // Starter with 6 IP on winning team → priority winner
      { playerBdlId: pitcherBdl, gameBdlId: bdlGameId, ip: 6, er: 2, p_k: 4 },
    ]);

    const result = await reconcileGame(bdlGameId);
    expect(result.wins_emitted).toBe(1);

    const eventRows = await client.query<{
      event_type: string;
      pitcher_player_id: string;
      source: string;
    }>(
      `SELECT event_type, pitcher_player_id, source FROM public.game_event
       WHERE game_id = $1 AND event_type = 'mlb.game.pitcher_win'`,
      [gameId],
    );
    expect(eventRows.rows.length).toBe(1);
    expect(eventRows.rows[0]?.pitcher_player_id).toBe(pitcher);
    expect(eventRows.rows[0]?.source).toBe("reconcile");

    await cleanupUser(client, userId);
    // Synthetic events aren't owned by users — clean up explicitly.
    await client.query("DELETE FROM public.game_event WHERE game_id = $1", [gameId]);
  });

  it("UPDATE-FROM regression guard: reconcile completes without 42P01 (P9.5)", async () => {
    // This test exists specifically to lock in the P9.5 bug fix. If
    // someone reintroduces the alias-through-FROM pattern, the
    // subquery restructure regresses and this test throws
    // "invalid reference to FROM-clause entry for table s" (42P01).
    const { userId, bdlGameId, entryId, homeTeamId } = await setupEntry("live");

    const p1 = await seedPlayer(client, { teamId: homeTeamId, positions: ["Catcher"] });
    const c1 = await seedCard(client, { userId, seasonId, playerId: p1 });
    await setLineupSlot(client, { entryId, position: "C", cardId: c1 });

    const p1Bdl = (
      await client.query<{ bdl_player_id: number }>(
        "SELECT bdl_player_id FROM public.player WHERE id = $1",
        [p1],
      )
    ).rows[0]?.bdl_player_id;
    if (!p1Bdl) throw new Error("player missing bdl id");

    const mock = installMockProvider();
    mock.setMockStats(bdlGameId, [{ playerBdlId: p1Bdl, gameBdlId: bdlGameId, hits: 1, rbi: 1 }]);

    // The assertion IS "doesn't throw." Explicit try/catch so a 42P01
    // shows up as a clean failure rather than a Vitest unhandled rejection.
    await expect(reconcileGame(bdlGameId)).resolves.toMatchObject({
      slots_updated: 1,
    });

    await cleanupUser(client, userId);
  });
});
