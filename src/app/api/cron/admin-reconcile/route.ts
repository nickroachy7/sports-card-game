import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { reconcileGame } from "@/lib/mlb/reconcile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Admin manual-reconcile endpoint. Takes one or more BDL game ids
 * and runs `reconcileGame` on each — the same path that fires
 * automatically on `mlb.game.ended` webhooks.
 *
 * Use cases:
 *   - A webhook was missed (dropped, signature window expired, bug
 *     in unhandled-game guard) and a finalized game needs its
 *     reconcile run after the fact.
 *   - A user-submitted lineup ran for a game that had already
 *     finalized before the lineup was submitted; reconcile needs
 *     to backfill their slots.
 *   - Dev smoke — forcing reconcile on a live/final game to
 *     validate the scoring path.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Query params:
 *   ?bdl_game_ids=5058120,5058122 (comma-separated)
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);

    const url = new URL(req.url);
    const raw = url.searchParams.get("bdl_game_ids");
    if (!raw) {
      return cronError(new Error("missing ?bdl_game_ids=<comma-separated>"));
    }
    const ids = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    if (ids.length === 0) {
      return cronError(new Error("no valid bdl_game_ids parsed"));
    }

    const results: Array<{
      bdl_game_id: number;
      ok: boolean;
      outcome?: Awaited<ReturnType<typeof reconcileGame>>;
      error?: string;
    }> = [];

    for (const id of ids) {
      try {
        const outcome = await reconcileGame(id);
        results.push({ bdl_game_id: id, ok: true, outcome });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ bdl_game_id: id, ok: false, error: msg });
      }
    }

    return cronOk({
      requested: ids.length,
      results,
    });
  } catch (err) {
    return cronError(err);
  }
}
