import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
import { captureServerEvent } from "@/lib/observability/action";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Opening Day cron — API spec §5.10, gameplay spec §11.5.
 *
 * When a season has status='pending' AND opening_day <= today, flip it
 * to 'active' and grant every profile the starter bundle via
 * grant_opening_day_bundle(user, season): 10 Bronze cards + 2 tokens +
 * 500 coins + audit pack_opening row.
 *
 * Scheduled daily at 10:00 UTC (06:00 ET). Idempotent — the SQL fn
 * skips users whose user_season_state already exists for that season.
 *
 * Batched 500 users per run to stay well inside Vercel's default
 * function timeout. If > 500 users in a single day's backlog, the
 * next day's run picks up the rest.
 */
const BATCH_SIZE = 500;

export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);

    const seasonsRes = await getDb().execute<{ id: string; year: number }>(sql`
      UPDATE public.season
      SET status = 'active', updated_at = now()
      WHERE status = 'pending'
        AND opening_day <= CURRENT_DATE
      RETURNING id, year
    `);

    const processed: Array<{
      seasonId: string;
      year: number;
      granted: number;
      skipped: number;
      failed: number;
    }> = [];

    for (const season of seasonsRes.rows) {
      const usersRes = await getDb().execute<{ user_id: string }>(sql`
        SELECT p.user_id
        FROM public.profile p
        WHERE NOT EXISTS (
          SELECT 1 FROM public.user_season_state uss
          WHERE uss.user_id = p.user_id AND uss.season_id = ${season.id}::uuid
        )
        ORDER BY p.created_at
        LIMIT ${BATCH_SIZE}
      `);

      let granted = 0;
      let skipped = 0;
      let failed = 0;

      for (const u of usersRes.rows) {
        try {
          const res = await getDb().execute<{ grant_opening_day_bundle: string | null }>(sql`
            SELECT public.grant_opening_day_bundle(
              ${u.user_id}::uuid,
              ${season.id}::uuid
            ) AS grant_opening_day_bundle
          `);
          const openingId = res.rows[0]?.grant_opening_day_bundle ?? null;
          if (openingId) {
            granted += 1;
            await captureServerEvent(u.user_id, "opening_day_bundle_granted", {
              season_id: season.id,
              year: season.year,
              pack_opening_id: openingId,
            });
          } else {
            skipped += 1;
          }
        } catch {
          failed += 1;
        }
      }

      processed.push({
        seasonId: season.id,
        year: Number(season.year),
        granted,
        skipped,
        failed,
      });
    }

    return cronOk(
      { seasons: processed },
      processed.length === 0
        ? { message: "No pending seasons at opening_day — no-op." }
        : undefined,
    );
  } catch (err) {
    return cronError(err);
  }
}
