import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
import { fetchAllActiveRosters } from "@/lib/mlb/stats-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Polish spec §162 (Phase 45). Daily sync of `player.is_26_man`
 * from MLB Stats API (statsapi.mlb.com). BDL can't distinguish
 * 26-man from 40-man-optioned; Stats API is the authoritative
 * source — same data feed that DraftKings / FanDuel / Topps Bunt
 * rely on.
 *
 * Runs at 04:00 ET (09:00 UTC) daily via Vercel Cron. Idempotent:
 * single UPDATE on `public.player`, sets is_26_man based on whether
 * the player's mlbam_id appears in the union of today's 30 team
 * active rosters.
 *
 * Partial failures (single team's roster fetch 5xx) don't tank the
 * sync — unionset misses that team's players, which means they
 * lose is_26_man flag for one day. Not catastrophic. Logged.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);
    const db = getDb();

    const { teams, roster, failures } = await fetchAllActiveRosters();
    if (roster.length === 0) {
      // Total Stats API failure — don't flip every player to false,
      // keep yesterday's snapshot. Surfacing the failure is enough.
      return cronOk({
        teams: teams.length,
        mlbam_ids_active: 0,
        flips_up: 0,
        flips_down: 0,
        skipped_due_to_failure: true,
        failures,
      });
    }

    // Union of active-roster mlbam_ids across all teams. Deduped in
    // case Stats API ever returns a player on two rosters (shouldn't,
    // but defense-in-depth).
    const activeIds = Array.from(new Set(roster.map((r) => r.mlbamId)));

    // Single UPDATE: everyone in the set → true; everyone else → false.
    // Audit: how many flipped each way.
    const flipUp = await db.execute<{ n: number }>(sql`
      WITH upd AS (
        UPDATE public.player
        SET is_26_man = true, updated_at = now()
        WHERE mlbam_id = ANY(${activeIds}::int[])
          AND is_26_man = false
        RETURNING 1
      )
      SELECT COUNT(*)::int AS n FROM upd
    `);
    const flipDown = await db.execute<{ n: number }>(sql`
      WITH upd AS (
        UPDATE public.player
        SET is_26_man = false, updated_at = now()
        WHERE NOT (mlbam_id = ANY(${activeIds}::int[]))
          AND is_26_man = true
        RETURNING 1
      )
      SELECT COUNT(*)::int AS n FROM upd
    `);

    return cronOk({
      teams: teams.length,
      mlbam_ids_active: activeIds.length,
      flips_up: flipUp.rows[0]?.n ?? 0,
      flips_down: flipDown.rows[0]?.n ?? 0,
      failures,
    });
  } catch (err) {
    return cronError(err);
  }
}
