import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";

/**
 * Polish spec §88 (Phase 30). Team summary block for the unified
 * sidebar. Four numbers describe a user's collection at a glance:
 *
 * - `teamName`          — from public.profile.team_name
 * - `totalCareerFp`     — from public.manager_account.lifetime_fp,
 *                         accumulated across seasons + all scoring
 *                         events. Can be 0 for brand-new users.
 * - `vaultedCardsCount` — UNION of ceremony-committed vault_entry
 *                         rows + midseason-vaulted card rows
 *                         (card.is_vaulted=true). During the active
 *                         season some cards sit in each table; we
 *                         count both.
 * - `vaultValueTotal`   — quick-sell value of everything in the
 *                         vault, at each card's FINAL/CURRENT tier.
 *                         Pulled from the active economy_config's
 *                         JSONB `quick_sell_values` map.
 *
 * Both pages in the unified sidebar read from this helper; it runs
 * per page load on server components.
 */
export type TeamSummary = {
  teamName: string;
  totalCareerFp: number;
  vaultedCardsCount: number;
  vaultValueTotal: number;
};

export async function getTeamSummary(userId: string): Promise<TeamSummary | null> {
  type Row = {
    team_name: string;
    lifetime_fp: number | string | null;
    vaulted_cards_count: number | string;
    vault_value_total: number | string;
  };

  const res = await getDb().execute<Row>(sql`
    WITH cfg AS (
      SELECT quick_sell_values FROM public.get_active_economy_config()
    ),
    ceremony AS (
      -- Ceremony-committed cards live in vault_entry with final_tier.
      -- Multiple seasons can contribute if the user has played
      -- through more than one season.
      SELECT
        COUNT(*) AS n,
        COALESCE(
          SUM(((SELECT quick_sell_values FROM cfg)->>ve.final_tier::text)::bigint),
          0
        ) AS value
      FROM public.vault_entry ve
      WHERE ve.user_id = ${userId}::uuid
    ),
    midseason AS (
      -- Pre-vaulted (midseason-vaulted) cards live in card with
      -- is_vaulted=true until ceremony. At current tier.
      SELECT
        COUNT(*) AS n,
        COALESCE(
          SUM(((SELECT quick_sell_values FROM cfg)->>c.current_tier::text)::bigint),
          0
        ) AS value
      FROM public.card c
      WHERE c.user_id = ${userId}::uuid
        AND c.is_vaulted = true
    )
    SELECT
      p.team_name,
      COALESCE(ma.lifetime_fp, 0) AS lifetime_fp,
      (ceremony.n + midseason.n) AS vaulted_cards_count,
      (ceremony.value + midseason.value) AS vault_value_total
    FROM public.profile p
    LEFT JOIN public.manager_account ma ON ma.user_id = p.user_id
    CROSS JOIN ceremony
    CROSS JOIN midseason
    WHERE p.user_id = ${userId}::uuid
  `);

  const row = res.rows[0];
  if (!row) return null;
  return {
    teamName: row.team_name,
    totalCareerFp: Number(row.lifetime_fp ?? 0),
    vaultedCardsCount: Number(row.vaulted_cards_count),
    vaultValueTotal: Number(row.vault_value_total),
  };
}
