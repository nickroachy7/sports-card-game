import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
import { runRosterAudit } from "@/lib/mlb/roster-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * MLB roster audit endpoint — polish spec §39, §42 (Phase 17
 * extracted the core to `src/lib/mlb/roster-audit.ts` so the daily
 * `bdl-roster-sync` cron can call the same logic automatically).
 *
 * Reconciles our `public.player.is_active_40_man` + `team_id`
 * columns against MLB Stats API's actual 40-man rosters. Running
 * this immediately before `mlbam-id-backfill` gives the backfill
 * clean input data; running it daily catches drift.
 *
 * Query params:
 *   ?dry_run=true  Compute deltas but don't mutate.
 *
 * Response: RosterAuditResult shape — see `roster-audit.ts`.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";
    const result = await runRosterAudit(getDb(), { dryRun });
    return cronOk(result);
  } catch (err) {
    return cronError(err);
  }
}
