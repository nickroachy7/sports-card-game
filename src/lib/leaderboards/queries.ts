import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";

export const LEADERBOARD_TYPES = [
  "manager-level",
  "season-fp",
  "card-prestige",
  "vault-prestige",
] as const;

export type LeaderboardType = (typeof LEADERBOARD_TYPES)[number];

export type LeaderboardRow = {
  rank: number;
  userId: string;
  teamName: string;
  managerLevel: number;
  metricValue: number;
};

type RawRow = {
  rank: number | string;
  user_id: string;
  team_name: string;
  manager_level: number | string;
  metric_value: number | string;
};

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
 */
export async function getLeaderboard(
  type: LeaderboardType,
  opts: { userId: string | null; limit?: number },
): Promise<{
  seasonId: string | null;
  top: LeaderboardRow[];
  you: LeaderboardRow | null;
}> {
  const limit = opts.limit ?? 100;
  const seasonId = await getActiveSeasonId();

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
        return { seasonId: null, top: [], you: null };
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

    case "card-prestige":
      if (!seasonId) {
        return { seasonId: null, top: [], you: null };
      }
      rankedCte = sql`
        WITH agg AS (
          SELECT c.user_id, COUNT(*) AS metric_value
          FROM public.card c
          WHERE c.current_tier = 'diamond'
            AND c.is_vaulted = false
            AND c.season_id = ${seasonId}::uuid
          GROUP BY c.user_id
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
  }

  const topRes = await getDb().execute<RawRow>(sql`
    ${rankedCte}
    SELECT rank, user_id, team_name, manager_level, metric_value
    FROM ranked
    ORDER BY rank
    LIMIT ${limit}
  `);

  const top: LeaderboardRow[] = topRes.rows.map((r) => ({
    rank: Number(r.rank),
    userId: r.user_id,
    teamName: r.team_name,
    managerLevel: Number(r.manager_level),
    metricValue: Number(r.metric_value),
  }));

  let you: LeaderboardRow | null = null;
  if (opts.userId) {
    const inTop = top.find((r) => r.userId === opts.userId) ?? null;
    if (inTop) {
      you = inTop;
    } else {
      const youRes = await getDb().execute<RawRow>(sql`
        ${rankedCte}
        SELECT rank, user_id, team_name, manager_level, metric_value
        FROM ranked
        WHERE user_id = ${opts.userId}::uuid
        LIMIT 1
      `);
      const row = youRes.rows[0];
      if (row) {
        you = {
          rank: Number(row.rank),
          userId: row.user_id,
          teamName: row.team_name,
          managerLevel: Number(row.manager_level),
          metricValue: Number(row.metric_value),
        };
      }
    }
  }

  return { seasonId, top, you };
}

export const LEADERBOARD_LABEL: Record<LeaderboardType, string> = {
  "manager-level": "Manager Lvl",
  "season-fp": "Season FP",
  "card-prestige": "Card Prestige",
  "vault-prestige": "Vault Prestige",
};

export const LEADERBOARD_METRIC_LABEL: Record<LeaderboardType, string> = {
  "manager-level": "XP",
  "season-fp": "FP",
  "card-prestige": "Diamonds",
  "vault-prestige": "Diamonds",
};
