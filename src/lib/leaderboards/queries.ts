import { sql } from "drizzle-orm";

import type { CardTier } from "@/lib/contracts/cards";
import { getDb } from "@/lib/db/client";

export const LEADERBOARD_TYPES = ["manager-level", "season-fp", "cards", "vault-prestige"] as const;

export type LeaderboardType = (typeof LEADERBOARD_TYPES)[number];

/**
 * Row shapes are discriminated by `kind`. User leaderboards (manager-
 * level, season-fp, vault-prestige) rank users; the Cards leaderboard
 * ranks individual cards across the community (introduced in polish
 * spec §83, Phase 29). The page + API switch on `kind` to render the
 * right template.
 */
export type UserLeaderboardRow = {
  kind: "user";
  rank: number;
  userId: string;
  teamName: string;
  managerLevel: number;
  metricValue: number;
};

export type CardLeaderboardRow = {
  kind: "card";
  rank: number;
  cardId: string;
  playerName: string;
  tier: CardTier;
  teamAbbreviation: string | null;
  careerFp: number;
  ownerUserId: string;
  ownerTeamName: string;
};

export type LeaderboardRow = UserLeaderboardRow | CardLeaderboardRow;

export type LeaderboardResult =
  | {
      kind: "user";
      seasonId: string | null;
      top: UserLeaderboardRow[];
      you: UserLeaderboardRow | null;
    }
  | {
      kind: "card";
      seasonId: string | null;
      top: CardLeaderboardRow[];
      you: CardLeaderboardRow | null;
    };

/** True if the type ranks users (3 of 4 boards). */
export function isUserLeaderboardType(
  type: LeaderboardType,
): type is "manager-level" | "season-fp" | "vault-prestige" {
  return type === "manager-level" || type === "season-fp" || type === "vault-prestige";
}

/** Active season for season-scoped boards. */
async function getActiveSeasonId(): Promise<string | null> {
  const res = await getDb().execute<{ id: string }>(sql`
    SELECT id FROM public.season
    WHERE status IN ('active', 'offseason')
    ORDER BY year DESC
    LIMIT 1
  `);
  return res.rows[0]?.id ?? null;
}

/**
 * Top N + the caller's row (if outside top N). API spec §4.2.
 * Caller passes userId or null for anon.
 *
 * For user boards, `you` is the caller's ranked row. For the cards
 * board, `you` is the caller's highest-FP card's global rank (since
 * users don't have a single card rank).
 */
export async function getLeaderboard(
  type: LeaderboardType,
  opts: { userId: string | null; limit?: number },
): Promise<LeaderboardResult> {
  const limit = opts.limit ?? 100;
  const seasonId = await getActiveSeasonId();

  if (type === "cards") {
    return getCardLeaderboard(opts.userId, limit);
  }

  let rankedCte: ReturnType<typeof sql>;

  switch (type) {
    case "manager-level":
      rankedCte = sql`
        WITH ranked AS (
          SELECT
            ma.user_id,
            p.team_name,
            ma.manager_level,
            ma.manager_xp AS metric_value,
            RANK() OVER (ORDER BY ma.manager_level DESC, ma.manager_xp DESC) AS rank
          FROM public.manager_account ma
          JOIN public.profile p ON p.user_id = ma.user_id AND p.is_public = true
        )
      `;
      break;

    case "season-fp":
      if (!seasonId) {
        return { kind: "user", seasonId: null, top: [], you: null };
      }
      rankedCte = sql`
        WITH ranked AS (
          SELECT
            uss.user_id,
            p.team_name,
            COALESCE(ma.manager_level, 1) AS manager_level,
            uss.season_fp AS metric_value,
            RANK() OVER (ORDER BY uss.season_fp DESC) AS rank
          FROM public.user_season_state uss
          JOIN public.profile p ON p.user_id = uss.user_id AND p.is_public = true
          LEFT JOIN public.manager_account ma ON ma.user_id = uss.user_id
          WHERE uss.season_id = ${seasonId}::uuid
        )
      `;
      break;

    case "vault-prestige":
      rankedCte = sql`
        WITH agg AS (
          SELECT ve.user_id, COUNT(*) AS metric_value
          FROM public.vault_entry ve
          WHERE ve.final_tier = 'diamond'
          GROUP BY ve.user_id
        ),
        ranked AS (
          SELECT
            agg.user_id,
            p.team_name,
            COALESCE(ma.manager_level, 1) AS manager_level,
            agg.metric_value,
            RANK() OVER (ORDER BY agg.metric_value DESC) AS rank
          FROM agg
          JOIN public.profile p ON p.user_id = agg.user_id AND p.is_public = true
          LEFT JOIN public.manager_account ma ON ma.user_id = agg.user_id
        )
      `;
      break;

    default:
      return { kind: "user", seasonId, top: [], you: null };
  }

  type RawUserRow = {
    rank: number | string;
    user_id: string;
    team_name: string;
    manager_level: number | string;
    metric_value: number | string;
  };

  const topRes = await getDb().execute<RawUserRow>(sql`
    ${rankedCte}
    SELECT rank, user_id, team_name, manager_level, metric_value
    FROM ranked
    ORDER BY rank
    LIMIT ${limit}
  `);

  const top: UserLeaderboardRow[] = topRes.rows.map((r) => ({
    kind: "user",
    rank: Number(r.rank),
    userId: r.user_id,
    teamName: r.team_name,
    managerLevel: Number(r.manager_level),
    metricValue: Number(r.metric_value),
  }));

  let you: UserLeaderboardRow | null = null;
  if (opts.userId) {
    const inTop = top.find((r) => r.userId === opts.userId) ?? null;
    if (inTop) {
      you = inTop;
    } else {
      const youRes = await getDb().execute<RawUserRow>(sql`
        ${rankedCte}
        SELECT rank, user_id, team_name, manager_level, metric_value
        FROM ranked
        WHERE user_id = ${opts.userId}::uuid
        LIMIT 1
      `);
      const row = youRes.rows[0];
      if (row) {
        you = {
          kind: "user",
          rank: Number(row.rank),
          userId: row.user_id,
          teamName: row.team_name,
          managerLevel: Number(row.manager_level),
          metricValue: Number(row.metric_value),
        };
      }
    }
  }

  return { kind: "user", seasonId, top, you };
}

/**
 * Polish spec §83 (Phase 29). Card-ranking leaderboard. Ranks
 * individual cards across the community by career_fp so users can
 * see which cards are performing best — regardless of who owns them.
 *
 * Includes vaulted + unvaulted cards (any tier). The ceremony-
 * committed cards that live in `vault_entry` (not `card`) are not
 * included in this phase; adding them would need a UNION with a
 * different row shape since vault_entry doesn't have a card_id
 * after the underlying card is deleted in commit_vault_selection.
 * Deferred — virtually all career FP for this phase lives on
 * in-table cards anyway.
 *
 * Filters career_fp > 0 so the list is meaningfully populated (we
 * don't want to rank 1000 zero-FP rookies).
 */
async function getCardLeaderboard(
  userId: string | null,
  limit: number,
): Promise<Extract<LeaderboardResult, { kind: "card" }>> {
  type RawCardRow = {
    rank: number | string;
    card_id: string;
    player_name: string;
    tier: CardTier;
    team_abbreviation: string | null;
    career_fp: number | string;
    owner_user_id: string;
    owner_team_name: string;
  };

  const rankedCte = sql`
    WITH ranked AS (
      SELECT
        c.id AS card_id,
        p.full_name AS player_name,
        c.current_tier AS tier,
        t.abbreviation AS team_abbreviation,
        c.career_fp_total AS career_fp,
        c.user_id AS owner_user_id,
        prof.team_name AS owner_team_name,
        RANK() OVER (ORDER BY c.career_fp_total DESC) AS rank
      FROM public.card c
      JOIN public.player p ON p.id = c.player_id
      LEFT JOIN public.team t ON t.id = p.team_id
      JOIN public.profile prof
        ON prof.user_id = c.user_id AND prof.is_public = true
      WHERE c.career_fp_total > 0
    )
  `;

  const topRes = await getDb().execute<RawCardRow>(sql`
    ${rankedCte}
    SELECT rank, card_id, player_name, tier, team_abbreviation,
           career_fp, owner_user_id, owner_team_name
    FROM ranked
    ORDER BY rank
    LIMIT ${limit}
  `);

  const top: CardLeaderboardRow[] = topRes.rows.map((r) => ({
    kind: "card",
    rank: Number(r.rank),
    cardId: r.card_id,
    playerName: r.player_name,
    tier: r.tier,
    teamAbbreviation: r.team_abbreviation,
    careerFp: Number(r.career_fp),
    ownerUserId: r.owner_user_id,
    ownerTeamName: r.owner_team_name,
  }));

  // For "your rank" on the cards board, surface the user's highest-FP
  // card and its global rank. If they have multiple cards ranked, the
  // top one anchors the "you" row.
  let you: CardLeaderboardRow | null = null;
  if (userId) {
    const inTop = top.find((r) => r.ownerUserId === userId) ?? null;
    if (inTop) {
      you = inTop;
    } else {
      const youRes = await getDb().execute<RawCardRow>(sql`
        ${rankedCte}
        SELECT rank, card_id, player_name, tier, team_abbreviation,
               career_fp, owner_user_id, owner_team_name
        FROM ranked
        WHERE owner_user_id = ${userId}::uuid
        ORDER BY rank
        LIMIT 1
      `);
      const row = youRes.rows[0];
      if (row) {
        you = {
          kind: "card",
          rank: Number(row.rank),
          cardId: row.card_id,
          playerName: row.player_name,
          tier: row.tier,
          teamAbbreviation: row.team_abbreviation,
          careerFp: Number(row.career_fp),
          ownerUserId: row.owner_user_id,
          ownerTeamName: row.owner_team_name,
        };
      }
    }
  }

  return { kind: "card", seasonId: null, top, you };
}

export const LEADERBOARD_LABEL: Record<LeaderboardType, string> = {
  "manager-level": "Manager Lvl",
  "season-fp": "Season FP",
  cards: "Cards",
  "vault-prestige": "Vault Prestige",
};

export const LEADERBOARD_METRIC_LABEL: Record<LeaderboardType, string> = {
  "manager-level": "XP",
  "season-fp": "FP",
  cards: "FP",
  "vault-prestige": "Diamonds",
};
