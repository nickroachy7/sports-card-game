import { randomUUID } from "node:crypto";

import { Client } from "pg";

/**
 * Integration test fixture helpers — polish spec §19.
 *
 * Seed realistic scenarios against local Supabase so we can
 * invoke SQL functions (`reconcileGame`, `commit_vault_selection`,
 * etc.) end-to-end in Vitest and assert DB state. Bypasses RLS by
 * using a direct `pg` Client on DATABASE_URL (same pattern as
 * tests/integration/rls.test.ts).
 *
 * Cleanup model: every test calls `cleanupUser(userId)` in
 * afterEach/afterAll. `auth.users` DELETE cascades to the owner-
 * scoped tables; non-owner rows (games, contests, players) are
 * intentionally left for the next test to reuse OR explicitly
 * deleted in test teardown.
 */

const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:64322/postgres";
const DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

/** Open a new pg client against the local Supabase DB. */
export async function getSeedClient(): Promise<Client> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

// ── Season + team + player lookups ────────────────────────────

/** The seeded 2026 season id. Throws if the seed migration didn't run. */
export async function getTestSeason(client: Client): Promise<string> {
  const r = await client.query<{ id: string }>(
    "SELECT id FROM public.season WHERE year = 2026 LIMIT 1",
  );
  if (!r.rows[0]) {
    throw new Error("2026 season not seeded — did 0007_seed_season.sql run?");
  }
  return r.rows[0].id;
}

/** Fetch a real team from the seeded 30. `offset` picks a specific team. */
export async function getTestTeam(client: Client, offset = 0): Promise<string> {
  const r = await client.query<{ id: string }>(
    "SELECT id FROM public.team ORDER BY abbreviation ASC LIMIT 1 OFFSET $1",
    [offset],
  );
  if (!r.rows[0]) throw new Error("no teams seeded — migration 0000 should have inserted them");
  return r.rows[0].id;
}

/** Insert a synthetic player owned by a test's scenario. */
export type SeedPlayerArgs = {
  bdlPlayerId?: number;
  firstName?: string;
  lastName?: string;
  positions?: string[];
  isPitcher?: boolean;
  teamId?: string;
  designatedValueTier?: "star" | "starter" | "role" | "prospect";
};

export async function seedPlayer(client: Client, args: SeedPlayerArgs = {}): Promise<string> {
  const bdlPlayerId = args.bdlPlayerId ?? randomBdlId();
  const first = args.firstName ?? "Test";
  const last = args.lastName ?? `Player-${bdlPlayerId}`;
  const positions = args.positions ?? ["Outfielder"];
  const isPitcher = args.isPitcher ?? false;
  const teamId = args.teamId ?? (await getTestTeam(client));
  const tier = args.designatedValueTier ?? "role";
  const r = await client.query<{ id: string }>(
    `INSERT INTO public.player
       (bdl_player_id, first_name, last_name, full_name, positions, is_pitcher,
        team_id, designated_value_tier, is_active_40_man, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::player_value_tier, true, 'active')
     RETURNING id`,
    [bdlPlayerId, first, last, `${first} ${last}`, positions, isPitcher, teamId, tier],
  );
  return r.rows[0]?.id ?? unreachable("seedPlayer insert returned no row");
}

// ── User ──────────────────────────────────────────────────────

export type SeedUserArgs = {
  seasonId?: string;
  coins?: number;
};

export type SeedUserResult = {
  userId: string;
  seasonId: string;
};

/**
 * Create an auth.users row + profile + user_season_state +
 * manager_account. Returns the user_id and season_id so tests
 * can continue seeding owned rows.
 */
export async function seedUser(client: Client, args: SeedUserArgs = {}): Promise<SeedUserResult> {
  const userId = randomUUID();
  const seasonId = args.seasonId ?? (await getTestSeason(client));
  const coins = args.coins ?? 1_000;
  const email = `seed-${userId.slice(0, 8)}@test.local`;

  await client.query(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, raw_app_meta_data,
                             raw_user_meta_data, created_at, updated_at,
                             confirmation_sent_at, email_confirmed_at, last_sign_in_at,
                             encrypted_password, is_sso_user, is_anonymous)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, '{}'::jsonb, '{}'::jsonb, now(), now(), now(), now(), now(),
             '', false, false)`,
    [userId, email],
  );
  await client.query(
    `INSERT INTO public.profile (user_id, team_name, team_color_primary,
                                 team_color_secondary, team_logo_id)
     VALUES ($1, $2, '#000000', '#FFFFFF', 'logo_a')`,
    [userId, `team_${userId.slice(0, 8)}`],
  );
  await client.query(
    `INSERT INTO public.user_season_state (user_id, season_id, coins)
     VALUES ($1, $2, $3)`,
    [userId, seasonId, coins],
  );
  await client.query(`INSERT INTO public.manager_account (user_id, manager_xp) VALUES ($1, 0)`, [
    userId,
  ]);
  return { userId, seasonId };
}

/** CASCADE-wipe every owner-scoped row for this user. */
export async function cleanupUser(client: Client, userId: string): Promise<void> {
  await client.query("DELETE FROM auth.users WHERE id = $1", [userId]);
}

// ── Card ──────────────────────────────────────────────────────

export type SeedCardArgs = {
  userId: string;
  seasonId: string;
  playerId?: string;
  tier?: "bronze" | "silver" | "gold" | "diamond";
  careerFp?: number;
  contractPlaysRemaining?: number;
  isExpired?: boolean;
  isVaulted?: boolean;
  vaultSource?: "midseason" | "ceremony";
};

export async function seedCard(client: Client, args: SeedCardArgs): Promise<string> {
  const playerId = args.playerId ?? (await seedPlayer(client));
  const tier = args.tier ?? "bronze";
  const careerFp = args.careerFp ?? 0;
  const plays = args.contractPlaysRemaining ?? 15;
  const expired = args.isExpired ?? false;
  const vaulted = args.isVaulted ?? false;
  const vaultSource = args.vaultSource ?? null;
  const vaultedAt = vaulted ? "now()" : "NULL";

  // Can't parameterize "now()" / NULL together cleanly — inline.
  const r = await client.query<{ id: string }>(
    `INSERT INTO public.card
       (user_id, player_id, season_id, current_tier, career_fp_total,
        contract_plays_remaining, is_expired, is_vaulted, vaulted_at, vault_source)
     VALUES ($1, $2, $3, $4::card_tier, $5, $6, $7, $8, ${vaultedAt}, $9::vault_source)
     RETURNING id`,
    [args.userId, playerId, args.seasonId, tier, careerFp, plays, expired, vaulted, vaultSource],
  );
  return r.rows[0]?.id ?? unreachable("seedCard insert returned no row");
}

// ── Game ──────────────────────────────────────────────────────

export type SeedGameArgs = {
  seasonId: string;
  bdlGameId?: number;
  homeTeamId?: string;
  awayTeamId?: string;
  date?: string; // YYYY-MM-DD
  status?: "scheduled" | "live" | "final" | "postponed" | "suspended" | "canceled";
  homeRuns?: number;
  awayRuns?: number;
};

export async function seedGame(client: Client, args: SeedGameArgs): Promise<string> {
  const bdlGameId = args.bdlGameId ?? randomBdlId();
  const homeTeamId = args.homeTeamId ?? (await getTestTeam(client, 0));
  const awayTeamId = args.awayTeamId ?? (await getTestTeam(client, 1));
  const date = args.date ?? new Date().toISOString().slice(0, 10);
  const status = args.status ?? "scheduled";
  const r = await client.query<{ id: string }>(
    `INSERT INTO public.game
       (bdl_game_id, season_id, home_team_id, away_team_id, date, status, is_postseason,
        home_runs, away_runs)
     VALUES ($1, $2, $3, $4, $5::date, $6::game_status, false, $7, $8)
     RETURNING id`,
    [
      bdlGameId,
      args.seasonId,
      homeTeamId,
      awayTeamId,
      date,
      status,
      args.homeRuns ?? null,
      args.awayRuns ?? null,
    ],
  );
  return r.rows[0]?.id ?? unreachable("seedGame insert returned no row");
}

// ── Contest + entry + slots ──────────────────────────────────

export type SeedContestArgs = {
  seasonId: string;
  gameIds: string[];
  name?: string;
  /** Default: 4 hours from now. */
  lineupLocksAt?: Date;
  startsAt?: Date;
};

export async function seedContest(client: Client, args: SeedContestArgs): Promise<string> {
  const name = args.name ?? "Test Slate";
  const now = new Date();
  const locksAt = args.lineupLocksAt ?? new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const startsAt = args.startsAt ?? locksAt;
  const r = await client.query<{ id: string }>(
    `INSERT INTO public.contest
       (season_id, type, name, lineup_locks_at, starts_at, included_game_ids)
     VALUES ($1, 'daily_slate'::contest_type, $2, $3, $4, $5)
     RETURNING id`,
    [args.seasonId, name, locksAt, startsAt, args.gameIds],
  );
  return r.rows[0]?.id ?? unreachable("seedContest insert returned no row");
}

/**
 * 10 slot positions, matching LINEUP_POSITIONS in
 * src/lib/contracts/lineup.ts. Exposed so tests can iterate.
 */
export const LINEUP_POSITIONS = [
  "SP1",
  "SP2",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "OF1",
  "OF2",
  "OF3",
] as const;

export type LineupPosition = (typeof LINEUP_POSITIONS)[number];

export type SeedContestEntryArgs = {
  userId: string;
  contestId: string;
  seasonId: string;
  status?: "building" | "submitted" | "locked" | "live" | "final";
};

/** Insert a contest_entry + 10 empty contest_lineup_slot rows. */
export async function seedContestEntry(
  client: Client,
  args: SeedContestEntryArgs,
): Promise<string> {
  const status = args.status ?? "building";
  const r = await client.query<{ id: string }>(
    `INSERT INTO public.contest_entry (user_id, contest_id, season_id, status)
     VALUES ($1, $2, $3, $4::contest_entry_status)
     RETURNING id`,
    [args.userId, args.contestId, args.seasonId, status],
  );
  const entryId = r.rows[0]?.id ?? unreachable("seedContestEntry insert returned no row");
  for (const pos of LINEUP_POSITIONS) {
    await client.query(
      `INSERT INTO public.contest_lineup_slot (contest_entry_id, position)
       VALUES ($1, $2)`,
      [entryId, pos],
    );
  }
  return entryId;
}

/** Fill an existing slot with a card (and optionally an applied-token). */
export async function setLineupSlot(
  client: Client,
  args: {
    entryId: string;
    position: LineupPosition;
    cardId: string;
    tokenApplicationId?: string;
  },
): Promise<void> {
  await client.query(
    `UPDATE public.contest_lineup_slot
     SET starter_card_id = $1, token_application_id = $2
     WHERE contest_entry_id = $3 AND position = $4`,
    [args.cardId, args.tokenApplicationId ?? null, args.entryId, args.position],
  );
}

// ── Token + application ──────────────────────────────────────

export type SeedTokenArgs = {
  userId: string;
  seasonId: string;
  tokenType?:
    | "hr_bonus"
    | "multi_hit_bonus"
    | "sb_bonus"
    | "strikeout_bonus"
    | "quality_start_bonus";
  bonusFp?: number;
  appliedToCardId?: string;
  appliedToContestId?: string;
};

export async function seedToken(client: Client, args: SeedTokenArgs): Promise<string> {
  const tokenType = args.tokenType ?? "hr_bonus";
  const bonus = args.bonusFp ?? 5;
  // Constraint: applied_to_card_id and applied_to_contest_id must be
  // set or NULL together.
  const appliedCard = args.appliedToCardId ?? null;
  const appliedContest = args.appliedToContestId ?? null;
  if ((appliedCard === null) !== (appliedContest === null)) {
    throw new Error("seedToken: appliedToCardId + appliedToContestId must be set together");
  }
  const r = await client.query<{ id: string }>(
    `INSERT INTO public.token
       (user_id, season_id, token_type, bonus_fp, applied_to_card_id,
        applied_to_contest_id, acquired_source)
     VALUES ($1, $2, $3::token_type, $4, $5, $6, 'seed')
     RETURNING id`,
    [args.userId, args.seasonId, tokenType, bonus, appliedCard, appliedContest],
  );
  return r.rows[0]?.id ?? unreachable("seedToken insert returned no row");
}

export type SeedTokenApplicationArgs = {
  userId: string;
  tokenId: string;
  cardId: string;
  contestId: string;
};

export async function seedTokenApplication(
  client: Client,
  args: SeedTokenApplicationArgs,
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO public.token_application (user_id, token_id, card_id, contest_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [args.userId, args.tokenId, args.cardId, args.contestId],
  );
  return r.rows[0]?.id ?? unreachable("seedTokenApplication insert returned no row");
}

// ── Season status toggles ────────────────────────────────────

/**
 * Flip a season to 'offseason' for the duration of `fn`, then
 * restore the prior status. Ceremony tests use this because
 * commit_vault_selection requires offseason.
 */
export async function withOffseason<T>(
  client: Client,
  seasonId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const r = await client.query<{ status: string }>(
    "SELECT status FROM public.season WHERE id = $1",
    [seasonId],
  );
  const prior = r.rows[0]?.status;
  if (!prior) throw new Error(`withOffseason: season ${seasonId} not found`);
  await client.query("UPDATE public.season SET status = 'offseason'::season_status WHERE id = $1", [
    seasonId,
  ]);
  try {
    return await fn();
  } finally {
    await client.query("UPDATE public.season SET status = $1::season_status WHERE id = $2", [
      prior,
      seasonId,
    ]);
  }
}

// ── Internals ────────────────────────────────────────────────

function randomBdlId(): number {
  // Very low collision probability; bdl_player_id + bdl_game_id are
  // int4 in MLB reality (real ids are 4–7 digits). Testing uses
  // 9-digit random ids to avoid collisions with the seeded player
  // pool.
  return 100_000_000 + Math.floor(Math.random() * 900_000_000);
}

function unreachable(msg: string): never {
  throw new Error(msg);
}
