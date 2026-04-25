import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
import { syncScheduleHorizon } from "@/lib/mlb/schedule-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * MLB schedule sync — polish spec §14, API spec §5.3.
 *
 * Pulls today + 2 days ahead from BDL and upserts `public.game`
 * via `syncScheduleHorizon()`. Also kicks `create_daily_contest`
 * (idempotent) so today's contest binds to the freshly-synced
 * games.
 *
 * Runs every 2h (see vercel.json). Safe to re-run; the upsert
 * honors the no-regress rule for status + COALESCE for in-game
 * score fields written by webhooks.
 *
 * Route name kept as `bdl-games-prefetch` for cron-config
 * compatibility — the module behind it is now
 * src/lib/mlb/schedule-sync.ts.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);
    const startedAt = Date.now();

    const summary = await syncScheduleHorizon(2);

    // Auto-create today's daily contest bound to these games.
    // Idempotent — returns the existing contest id if one already
    // exists, and (polish spec §51) refreshes included_game_ids for
    // the current set. Slate date driven by public.current_slate_date()
    // (4 AM ET pivot — polish spec §50).
    const db = getDb();
    let contestId: string | null = null;
    try {
      const res = await db.execute<{ create_daily_contest: string }>(sql`
        SELECT public.create_daily_contest() AS create_daily_contest
      `);
      contestId = res.rows[0]?.create_daily_contest ?? null;
    } catch (err) {
      console.error("[schedule-sync] create_daily_contest failed", err);
    }

    return cronOk({
      synced: summary.synced,
      skipped: summary.skipped,
      scheduled_starts_updated: summary.scheduled_starts_updated,
      days: summary.days,
      errors: summary.errors,
      future_finals_overridden: summary.future_finals_overridden ?? 0,
      contest_id: contestId,
      took_ms: Date.now() - startedAt,
    });
  } catch (err) {
    return cronError(err);
  }
}
