import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Polish spec §163 (Phase 45). Rolling-365-day FP-based tier
 * classification for 26-man players.
 *
 * Targets (gameplay spec §6.3):
 *   Star    — top 50 hitters + top 30 pitchers by 365-day FP (≈80)
 *   Starter — next 200 (≈25% of pool)
 *   Role    — remainder of 26-man (≈65%)
 *   Prospect — unused in v1 (26-man filter already excludes fringe)
 *
 * Non-26-man players are reset to `role` so a player optioned to
 * AAA loses their star status over time. This doesn't affect gameplay
 * (open_pack filters on is_26_man), but keeps the column consistent
 * for future use.
 *
 * Runs daily at 04:15 ET (09:15 UTC), after the 26-man sync.
 * Idempotent. The SQL does all work server-side via a single CTE.
 */

const STAR_HITTER_LIMIT = 50;
const STAR_PITCHER_LIMIT = 30;
const STARTER_HITTER_LIMIT = 250; // cumulative rank
const STARTER_PITCHER_LIMIT = 130; // cumulative rank

export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);
    const db = getDb();

    // Ranking CTE: per-player 365-day FP via game_event aggregation.
    // FP is computed via the same scoring helpers the live pipeline
    // uses (_score_batter_event / _score_pitcher_event), so tier
    // classification matches real contest FP.
    //
    // Gate on fp > 0 via HAVING. If we left in 0-FP players (inner
    // join then COALESCE), they'd tie-rank at the floor and catch
    // star/starter assignments purely from positional rank. Instead:
    // only players with real performance qualify for star/starter;
    // everyone else (unplayed, sparse data, fresh season) stays role.
    //
    // ROW_NUMBER() deterministic tiebreak by id — avoids RANK()
    // ties that would skip past the limit band.
    const result = await db.execute<{
      stars: number;
      starters: number;
      roles: number;
    }>(sql`
      WITH hitter_fp AS (
        SELECT ge.batter_player_id AS player_id,
               SUM(public._score_batter_event(
                 ge.event_type, ge.play_type, ge.score_value
               )) AS fp
        FROM public.game_event ge
        WHERE ge.batter_player_id IS NOT NULL
          AND ge.event_at > (now() - INTERVAL '365 days')
        GROUP BY ge.batter_player_id
        HAVING SUM(public._score_batter_event(
          ge.event_type, ge.play_type, ge.score_value
        )) > 0
      ),
      pitcher_fp AS (
        SELECT ge.pitcher_player_id AS player_id,
               SUM(public._score_pitcher_event(
                 ge.event_type, ge.play_type
               )) AS fp
        FROM public.game_event ge
        WHERE ge.pitcher_player_id IS NOT NULL
          AND ge.event_at > (now() - INTERVAL '365 days')
        GROUP BY ge.pitcher_player_id
        HAVING SUM(public._score_pitcher_event(
          ge.event_type, ge.play_type
        )) > 0
      ),
      hitter_ranks AS (
        SELECT p.id AS player_id, h.fp,
               ROW_NUMBER() OVER (ORDER BY h.fp DESC, p.id) AS rnk
        FROM public.player p
        JOIN hitter_fp h ON h.player_id = p.id
        WHERE p.is_26_man = true AND p.is_pitcher = false
      ),
      pitcher_ranks AS (
        SELECT p.id AS player_id, pf.fp,
               ROW_NUMBER() OVER (ORDER BY pf.fp DESC, p.id) AS rnk
        FROM public.player p
        JOIN pitcher_fp pf ON pf.player_id = p.id
        WHERE p.is_26_man = true AND p.is_pitcher = true
      ),
      new_tiers AS (
        SELECT player_id,
               CASE
                 WHEN rnk <= ${STAR_HITTER_LIMIT} THEN 'star'
                 WHEN rnk <= ${STARTER_HITTER_LIMIT} THEN 'starter'
                 ELSE 'role'
               END::player_value_tier AS tier
        FROM hitter_ranks
        UNION ALL
        SELECT player_id,
               CASE
                 WHEN rnk <= ${STAR_PITCHER_LIMIT} THEN 'star'
                 WHEN rnk <= ${STARTER_PITCHER_LIMIT} THEN 'starter'
                 ELSE 'role'
               END::player_value_tier AS tier
        FROM pitcher_ranks
      ),
      applied AS (
        UPDATE public.player p
        SET designated_value_tier = nt.tier, updated_at = now()
        FROM new_tiers nt
        WHERE p.id = nt.player_id
          AND p.designated_value_tier IS DISTINCT FROM nt.tier
        RETURNING p.designated_value_tier
      )
      SELECT
        COUNT(*) FILTER (WHERE designated_value_tier = 'star')::int AS stars,
        COUNT(*) FILTER (WHERE designated_value_tier = 'starter')::int AS starters,
        COUNT(*) FILTER (WHERE designated_value_tier = 'role')::int AS roles
      FROM applied
    `);

    // Reset-to-role pass: catches two cases that the main classifier
    // (which only updates players with fp > 0) misses.
    //   1. Players no longer on 26-man but with a stale high tier —
    //      open_pack filters them out anyway, but the audit stays clean.
    //   2. 26-man players whose 365-day FP dropped to 0 as old games
    //      aged out of the window, AND were previously classified as
    //      star/starter. Without this pass they'd keep their stale tier
    //      forever (since the HAVING clause excludes them from the
    //      main classifier).
    const resetRes = await db.execute<{ n: number }>(sql`
      WITH upd AS (
        UPDATE public.player p
        SET designated_value_tier = 'role'::player_value_tier, updated_at = now()
        WHERE p.designated_value_tier <> 'role'
          AND (
            p.is_26_man = false
            OR (
              p.is_26_man = true
              AND NOT EXISTS (
                SELECT 1 FROM public.game_event ge
                WHERE (
                  (p.is_pitcher = false AND ge.batter_player_id = p.id AND
                   public._score_batter_event(ge.event_type, ge.play_type, ge.score_value) > 0)
                  OR
                  (p.is_pitcher = true AND ge.pitcher_player_id = p.id AND
                   public._score_pitcher_event(ge.event_type, ge.play_type) > 0)
                )
                AND ge.event_at > (now() - INTERVAL '365 days')
              )
            )
          )
        RETURNING 1
      )
      SELECT COUNT(*)::int AS n FROM upd
    `);

    // Final distribution across the 26-man for the response.
    const distRes = await db.execute<{
      tier: string;
      n: number;
    }>(sql`
      SELECT designated_value_tier::text AS tier, COUNT(*)::int AS n
      FROM public.player
      WHERE is_26_man = true
      GROUP BY designated_value_tier
      ORDER BY designated_value_tier
    `);

    return cronOk({
      flipped: {
        stars: result.rows[0]?.stars ?? 0,
        starters: result.rows[0]?.starters ?? 0,
        roles: result.rows[0]?.roles ?? 0,
      },
      reset_to_role: resetRes.rows[0]?.n ?? 0,
      current_distribution: distRes.rows.map((r) => ({ tier: r.tier, count: r.n })),
    });
  } catch (err) {
    return cronError(err);
  }
}
