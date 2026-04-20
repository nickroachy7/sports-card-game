import { randomUUID } from "node:crypto";

import { Client, type QueryResultRow } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * RLS smoke tests (DB schema spec §14).
 *
 * Creates two fake auth.users rows, seeds each with a minimal row set
 * across the 10 critical owner-scoped tables, then switches the session
 * role to `authenticated` with each user's JWT claim and asserts:
 *   - user A sees only user A's rows
 *   - user B sees only user B's rows
 *
 * Requires local Supabase stack up (supabase start) + migrations applied.
 */

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

const userAId = randomUUID();
const userBId = randomUUID();

let setupClient: Client;
let seasonId: string;

async function insertFakeUser(id: string, email: string): Promise<void> {
  // Supabase auth.users requires a handful of columns. Use supabase_auth_admin
  // (postgres is a superuser on local) to bypass any DEFAULT quirks.
  await setupClient.query(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, raw_app_meta_data,
                             raw_user_meta_data, created_at, updated_at,
                             confirmation_sent_at, email_confirmed_at, last_sign_in_at,
                             encrypted_password, is_sso_user, is_anonymous)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, '{}'::jsonb, '{}'::jsonb, now(), now(), now(), now(), now(),
             '', false, false)`,
    [id, email],
  );
}

async function seedOwnerRows(userId: string): Promise<void> {
  // profile
  await setupClient.query(
    `INSERT INTO public.profile (user_id, team_name, team_color_primary,
                                 team_color_secondary, team_logo_id)
     VALUES ($1, $2, '#000000', '#FFFFFF', 'logo_a')`,
    [userId, `team_${userId.slice(0, 8)}`],
  );
  // user_season_state
  await setupClient.query(
    `INSERT INTO public.user_season_state (user_id, season_id) VALUES ($1, $2)`,
    [userId, seasonId],
  );
  // manager_account
  await setupClient.query(
    `INSERT INTO public.manager_account (user_id, manager_xp) VALUES ($1, 0)`,
    [userId],
  );
  // a fake player to own a card against
  const playerRow = await setupClient.query(
    `INSERT INTO public.player (bdl_player_id, first_name, last_name, full_name)
     VALUES ($1, 'Test', 'Player', 'Test Player') RETURNING id`,
    [Math.floor(Math.random() * 1_000_000_000)],
  );
  const playerId = playerRow.rows[0].id as string;
  // card
  const cardRow = await setupClient.query(
    `INSERT INTO public.card (user_id, player_id, season_id) VALUES ($1, $2, $3) RETURNING id`,
    [userId, playerId, seasonId],
  );
  const cardId = cardRow.rows[0].id as string;
  // token
  await setupClient.query(
    `INSERT INTO public.token (user_id, season_id, token_type, bonus_fp, acquired_source)
     VALUES ($1, $2, 'hr_bonus', 5.0, 'pack')`,
    [userId, seasonId],
  );
  // coin_transaction
  await setupClient.query(
    `INSERT INTO public.coin_transaction (user_id, season_id, amount, balance_after, reason)
     VALUES ($1, $2, 500, 500, 'onboarding_bundle')`,
    [userId, seasonId],
  );
  // pack_opening
  await setupClient.query(
    `INSERT INTO public.pack_opening (user_id, season_id, pack_type, coin_cost)
     VALUES ($1, $2, 'daily', 0)`,
    [userId, seasonId],
  );
  // contract_extension
  await setupClient.query(
    `INSERT INTO public.contract_extension
        (card_id, user_id, plays_added, coin_cost, extension_number, tier_at_extension)
     VALUES ($1, $2, 5, 100, 1, 'bronze')`,
    [cardId, userId],
  );
  // team_milestone_state
  await setupClient.query(
    `INSERT INTO public.team_milestone_state (user_id, season_id) VALUES ($1, $2)`,
    [userId, seasonId],
  );
  // team_milestone_award
  await setupClient.query(
    `INSERT INTO public.team_milestone_award
       (user_id, season_id, milestone_key, tier, coin_reward, xp_reward)
     VALUES ($1, $2, 'hits', 1, 100, 100)`,
    [userId, seasonId],
  );
}

/** Run a query as `authenticated` with JWT claim sub = userId. */
async function queryAsUser<T extends QueryResultRow>(userId: string, sql: string): Promise<T[]> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const result = await client.query<T>(sql);
    return result.rows;
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

describe("RLS: owner-scoped tables only expose own rows to authenticated users", () => {
  beforeAll(async () => {
    setupClient = new Client({ connectionString: DATABASE_URL });
    await setupClient.connect();

    // Pick up the seeded 2026 season.
    const { rows } = await setupClient.query<{ id: string }>(
      "SELECT id FROM public.season WHERE year = 2026",
    );
    if (rows.length === 0) {
      throw new Error("2026 season not seeded — did 0007_seed_season.sql run?");
    }
    seasonId = rows[0].id;

    await insertFakeUser(userAId, `rls-a-${userAId}@test.local`);
    await insertFakeUser(userBId, `rls-b-${userBId}@test.local`);
    await seedOwnerRows(userAId);
    await seedOwnerRows(userBId);
  }, 30_000);

  afterAll(async () => {
    // CASCADE from auth.users wipes everything owner-scoped.
    await setupClient.query("DELETE FROM auth.users WHERE id = ANY($1)", [[userAId, userBId]]);
    await setupClient.end();
  });

  const ownerScopedTables = [
    "card",
    "token",
    "user_season_state",
    "coin_transaction",
    "pack_opening",
    "contract_extension",
    "team_milestone_state",
    "team_milestone_award",
  ] as const;

  for (const table of ownerScopedTables) {
    it(`${table}: user A sees only user A's rows`, async () => {
      const rows = await queryAsUser<{ user_id: string }>(
        userAId,
        `SELECT user_id FROM public.${table} WHERE user_id IN ('${userAId}','${userBId}')`,
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.user_id === userAId)).toBe(true);
    });

    it(`${table}: user B sees only user B's rows`, async () => {
      const rows = await queryAsUser<{ user_id: string }>(
        userBId,
        `SELECT user_id FROM public.${table} WHERE user_id IN ('${userAId}','${userBId}')`,
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.user_id === userBId)).toBe(true);
    });
  }

  it("profile: public read — both users visible to everyone", async () => {
    const rowsFromA = await queryAsUser<{ user_id: string }>(
      userAId,
      `SELECT user_id FROM public.profile WHERE user_id IN ('${userAId}','${userBId}')`,
    );
    expect(new Set(rowsFromA.map((r) => r.user_id))).toEqual(new Set([userAId, userBId]));
  });

  it("webhook_delivery: service-only table is invisible to authenticated", async () => {
    const rows = await queryAsUser<{ delivery_id: string }>(
      userAId,
      `SELECT delivery_id FROM public.webhook_delivery`,
    );
    expect(rows).toHaveLength(0);
  });
});
