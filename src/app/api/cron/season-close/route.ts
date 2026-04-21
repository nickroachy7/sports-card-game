import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
import { captureServerEvent } from "@/lib/observability/action";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Season-close cron — API spec §5.11, gameplay spec §11.3–11.4.
 *
 * Runs daily (06:00 ET = 10:00 UTC, after the games prefetch). For any
 * active season whose `world_series_end` is in the past (or today),
 * flips status → 'offseason' and stamps closed_at. Users see the vault
 * ceremony banner on next /vault visit; the 14-day auto-dissolve cron
 * (P5.2) handles stragglers.
 *
 * Idempotent: if no season matches (the typical daily run during the
 * regular season), the route is a no-op and returns { closed: 0 }.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);

    const res = await getDb().execute<{ id: string; year: number }>(sql`
      UPDATE public.season
      SET status    = 'offseason',
          closed_at = COALESCE(closed_at, now()),
          updated_at = now()
      WHERE status = 'active'
        AND world_series_end IS NOT NULL
        AND world_series_end <= CURRENT_DATE
      RETURNING id, year
    `);

    const closed = res.rows.map((r) => ({ seasonId: r.id, year: Number(r.year) }));

    for (const s of closed) {
      await captureServerEvent("system", "season_closed", {
        season_id: s.seasonId,
        year: s.year,
      });
    }

    return cronOk(
      { closed: closed.length, seasons: closed },
      closed.length === 0
        ? { message: "No seasons past world_series_end — regular-season no-op." }
        : undefined,
    );
  } catch (err) {
    return cronError(err);
  }
}
