import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cleanupUser,
  getSeedClient,
  getTestSeason,
  getTestTeam,
  seedCard,
  seedContest,
  seedGame,
  seedPlayer,
  seedToken,
  seedTokenApplication,
  seedUser,
  withOffseason,
} from "../fixtures/seed";

/**
 * Integration test — polish spec §19, roadmap P11.3.
 *
 * Drives commit_vault_selection() end-to-end. Covers the two
 * latent bugs surfaced by the P10.5 DO-block smoke:
 *   1. token_applied_both_or_neither check constraint fired
 *      when the fn only nulled applied_to_card_id.
 *   2. token_application.token_id NOT NULL FK blocked the
 *      "DELETE unused tokens" step.
 *
 * Plus: happy path, pre-vaulted tolerance (polish spec §17),
 * double-commit idempotency, 10-card cap enforcement.
 *
 * Prereq: `supabase start` running at 127.0.0.1:64322 and
 *         migrations 0000–0026 applied.
 */

describe("commit_vault_selection", () => {
  let client: Client;
  let seasonId: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    client = await getSeedClient();
    seasonId = await getTestSeason(client);
  });

  afterAll(async () => {
    for (const id of userIds) {
      await cleanupUser(client, id).catch(() => undefined);
    }
    await client.end();
  });

  async function commitCeremony(userId: string, cardIds: string[]) {
    return client.query<{ commit_vault_selection: string }>(
      "SELECT public.commit_vault_selection($1, $2, $3) AS commit_vault_selection",
      [userId, seasonId, cardIds],
    );
  }

  /** Seed a user + contest (so tokens have a contest_id to reference). */
  async function setupUserWithContext() {
    const { userId } = await seedUser(client, { seasonId });
    userIds.push(userId);
    const homeTeamId = await getTestTeam(client, 0);
    const awayTeamId = await getTestTeam(client, 1);
    const gameId = await seedGame(client, {
      seasonId,
      homeTeamId,
      awayTeamId,
      status: "scheduled",
    });
    const contestId = await seedContest(client, { seasonId, gameIds: [gameId] });
    return { userId, gameId, contestId, homeTeamId };
  }

  async function seedFreshCard(userId: string): Promise<string> {
    const player = await seedPlayer(client);
    return seedCard(client, { userId, seasonId, playerId: player });
  }

  async function seedMidseasonCard(userId: string): Promise<string> {
    const player = await seedPlayer(client);
    return seedCard(client, {
      userId,
      seasonId,
      playerId: player,
      isVaulted: true,
      vaultSource: "midseason",
    });
  }

  it("happy path: 3 fresh cards → 3 vault_entry rows, source='ceremony'", async () => {
    const { userId } = await setupUserWithContext();
    const c1 = await seedFreshCard(userId);
    const c2 = await seedFreshCard(userId);
    const c3 = await seedFreshCard(userId);

    await withOffseason(client, seasonId, () => commitCeremony(userId, [c1, c2, c3]));

    const vaultRows = await client.query<{ card_id: string }>(
      "SELECT card_id FROM public.vault_entry WHERE user_id = $1 AND season_id = $2",
      [userId, seasonId],
    );
    expect(vaultRows.rows.map((r) => r.card_id).sort()).toEqual([c1, c2, c3].sort());

    const cardRows = await client.query<{
      id: string;
      is_vaulted: boolean;
      vault_source: string | null;
    }>("SELECT id, is_vaulted, vault_source FROM public.card WHERE id = ANY($1)", [[c1, c2, c3]]);
    for (const row of cardRows.rows) {
      expect(row.is_vaulted).toBe(true);
      expect(row.vault_source).toBe("ceremony");
    }

    await cleanupUser(client, userId);
  });

  it("pre-vaulted tolerance: 1 midseason + 2 fresh → all 3 vaulted, midseason keeps source", async () => {
    const { userId } = await setupUserWithContext();
    const midseason = await seedMidseasonCard(userId);
    const fresh1 = await seedFreshCard(userId);
    const fresh2 = await seedFreshCard(userId);

    // Capture the midseason vaulted_at before ceremony to verify preservation.
    const before = await client.query<{ vaulted_at: Date }>(
      "SELECT vaulted_at FROM public.card WHERE id = $1",
      [midseason],
    );
    const priorVaultedAt = before.rows[0]?.vaulted_at;
    expect(priorVaultedAt).toBeTruthy();

    await withOffseason(client, seasonId, () =>
      commitCeremony(userId, [midseason, fresh1, fresh2]),
    );

    const vaultRows = await client.query<{ card_id: string }>(
      "SELECT card_id FROM public.vault_entry WHERE user_id = $1 AND season_id = $2",
      [userId, seasonId],
    );
    expect(vaultRows.rows.map((r) => r.card_id).sort()).toEqual([midseason, fresh1, fresh2].sort());

    const midRow = await client.query<{
      vault_source: string | null;
      vaulted_at: Date;
    }>("SELECT vault_source, vaulted_at FROM public.card WHERE id = $1", [midseason]);
    expect(midRow.rows[0]?.vault_source).toBe("midseason");
    expect(midRow.rows[0]?.vaulted_at.getTime()).toBe(priorVaultedAt?.getTime());

    const freshRow = await client.query<{ vault_source: string | null }>(
      "SELECT vault_source FROM public.card WHERE id = $1",
      [fresh1],
    );
    expect(freshRow.rows[0]?.vault_source).toBe("ceremony");

    await cleanupUser(client, userId);
  });

  it("token constraint guard (P10.5 #1): non-selected card's applied token doesn't trip check", async () => {
    // Pre-migration-0025 behavior: the fn's UPDATE set applied_to_card_id
    // to NULL WITHOUT nulling applied_to_contest_id, tripping the
    // token_applied_both_or_neither check constraint (errcode 23514).
    // Post-fix: both columns are nulled together. This test commits a
    // ceremony where an unused token points at a non-selected card —
    // the exact transaction that surfaced the bug.
    const { userId, contestId } = await setupUserWithContext();
    const nonSelected = await seedFreshCard(userId);
    const selected = await seedFreshCard(userId);

    await seedToken(client, {
      userId,
      seasonId,
      tokenType: "hr_bonus",
      bonusFp: 5,
      appliedToCardId: nonSelected,
      appliedToContestId: contestId,
    });

    // If the check-constraint bug ever regresses, this throws 23514.
    await expect(
      withOffseason(client, seasonId, () => commitCeremony(userId, [selected])),
    ).resolves.not.toThrow();

    // Vault committed successfully.
    const vaultRows = await client.query<{ card_id: string }>(
      "SELECT card_id FROM public.vault_entry WHERE user_id = $1",
      [userId],
    );
    expect(vaultRows.rows.map((r) => r.card_id)).toEqual([selected]);

    await cleanupUser(client, userId);
  });

  it("token FK guard (P10.5 #2): token_application survives token delete with token_id NULL", async () => {
    // Pre-migration-0026 behavior: the fn's DELETE FROM token tripped
    // the token_application.token_id NOT NULL FK (errcode 23503).
    // Post-fix: FK is ON DELETE SET NULL; token_application row
    // survives with token_id IS NULL.
    const { userId, contestId } = await setupUserWithContext();
    const nonSelected = await seedFreshCard(userId);
    const selected = await seedFreshCard(userId);

    const tokenId = await seedToken(client, {
      userId,
      seasonId,
      tokenType: "multi_hit_bonus",
      bonusFp: 5,
      appliedToCardId: nonSelected,
      appliedToContestId: contestId,
    });
    const applicationId = await seedTokenApplication(client, {
      userId,
      tokenId,
      cardId: nonSelected,
      contestId,
    });

    await expect(
      withOffseason(client, seasonId, () => commitCeremony(userId, [selected])),
    ).resolves.not.toThrow();

    const appRow = await client.query<{
      id: string;
      token_id: string | null;
    }>("SELECT id, token_id FROM public.token_application WHERE id = $1", [applicationId]);
    expect(appRow.rows.length).toBe(1);
    expect(appRow.rows[0]?.token_id).toBe(null);

    // Token itself was deleted (consumed_at IS NULL path).
    const tokenRow = await client.query<{ id: string }>(
      "SELECT id FROM public.token WHERE id = $1",
      [tokenId],
    );
    expect(tokenRow.rows.length).toBe(0);

    await cleanupUser(client, userId);
  });

  it("double-commit: second attempt raises 23514 (already committed)", async () => {
    const { userId } = await setupUserWithContext();
    const c1 = await seedFreshCard(userId);

    await withOffseason(client, seasonId, async () => {
      await commitCeremony(userId, [c1]);
      // Second call should raise.
      await expect(commitCeremony(userId, [])).rejects.toThrow(
        /already committed vault for this season/,
      );
    });

    await cleanupUser(client, userId);
  });

  it("cap enforcement: 11-card selection raises 22023", async () => {
    const { userId } = await setupUserWithContext();
    const cards = await Promise.all(Array.from({ length: 11 }, () => seedFreshCard(userId)));

    await expect(
      withOffseason(client, seasonId, () => commitCeremony(userId, cards)),
    ).rejects.toThrow(/cannot vault more than 10 cards/);

    await cleanupUser(client, userId);
  });
});
