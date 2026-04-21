import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
import { asPgArray } from "@/lib/db/sql-helpers";
import { captureServerEvent } from "@/lib/observability/action";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Grace-period vault auto-dissolve — API spec §5.11.
 *
 * For any season that has been in 'offseason' for ≥14 days,
 * commit an empty-array vault for every user who still has active
 * cards for that season but never ran the ceremony. That wipes
 * their cards, coins, and unused tokens, matching gameplay spec
 * §11.3's dissolve semantics. Once processed, the season flips to
 * 'closed' so the next daily run is a no-op.
 *
 * Scheduled daily at 11:00 UTC (07:00 ET), one hour after
 * season-close so the offseason window is coherent.
 *
 * Idempotent: seasons already in 'closed' are skipped. Users who
 * already committed (have vault_entry rows for that season) are
 * skipped. The per-user call is wrapped in its own begin/except
 * so one user's failure doesn't block the rest.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);

    const seasonsRes = await getDb().execute<{
      id: string;
      year: number;
      closed_at: string;
    }>(sql`
      SELECT id, year, closed_at
      FROM public.season
      WHERE status = 'offseason'
        AND closed_at IS NOT NULL
        AND closed_at + INTERVAL '14 days' <= now()
    `);

    const processed: Array<{
      seasonId: string;
      year: number;
      dissolvedUsers: number;
      failedUsers: number;
    }> = [];

    for (const season of seasonsRes.rows) {
      // Users who have non-vaulted cards for this season AND no
      // vault_entry yet for it. They're the ones who never ran the
      // ceremony.
      const usersRes = await getDb().execute<{ user_id: string }>(sql`
        SELECT DISTINCT c.user_id
        FROM public.card c
        WHERE c.season_id = ${season.id}::uuid
          AND c.is_vaulted = false
          AND NOT EXISTS (
            SELECT 1 FROM public.vault_entry ve
            WHERE ve.user_id = c.user_id
              AND ve.season_id = ${season.id}::uuid
          )
      `);

      let dissolved = 0;
      let failed = 0;

      for (const u of usersRes.rows) {
        try {
          await getDb().execute(sql`
            SELECT public.commit_vault_selection(
              ${u.user_id}::uuid,
              ${season.id}::uuid,
              ${asPgArray([], "uuid")}
            )
          `);
          dissolved += 1;
          await captureServerEvent(u.user_id, "vault_auto_dissolved", {
            season_id: season.id,
            year: season.year,
          });
        } catch {
          failed += 1;
        }
      }

      // Promote the season to 'closed' only if no user failed. A
      // failed batch leaves it in 'offseason' so tomorrow's run
      // retries the stragglers.
      if (failed === 0) {
        await getDb().execute(sql`
          UPDATE public.season
          SET status = 'closed', updated_at = now()
          WHERE id = ${season.id}::uuid
        `);
      }

      processed.push({
        seasonId: season.id,
        year: Number(season.year),
        dissolvedUsers: dissolved,
        failedUsers: failed,
      });
    }

    return cronOk(
      { seasons: processed },
      processed.length === 0
        ? { message: "No offseason seasons past the 14-day grace period." }
        : undefined,
    );
  } catch (err) {
    return cronError(err);
  }
}
