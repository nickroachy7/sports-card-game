import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
import { getMLBProvider } from "@/lib/mlb/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Daily injuries sync — API spec §5.2, BDL integration §7.
 *
 * Pulls the active injury list from BDL and flips player.status to 'il'
 * for anyone still on the list; resets anyone not on the list to 'active'
 * (unless they were manually marked 'dfa' or 'retired'). Scheduled 04:15 ET daily.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);
    const db = getDb();
    const provider = getMLBProvider();

    const injuries = await provider.fetchPlayerInjuries();
    const injuredBdlIds = new Set<number>();
    for (const inj of injuries) {
      const id = inj.player?.id;
      if (typeof id === "number") injuredBdlIds.add(id);
    }

    let marked_il = 0;
    let cleared_il = 0;

    if (injuredBdlIds.size > 0) {
      const ids = Array.from(injuredBdlIds);
      const res = await db.execute(sql`
        UPDATE public.player
        SET status = 'il'::player_status, updated_at = now()
        WHERE bdl_player_id = ANY(${ids}::int[])
          AND status = 'active'
      `);
      marked_il = res.rowCount ?? 0;

      const cleared = await db.execute(sql`
        UPDATE public.player
        SET status = 'active'::player_status, updated_at = now()
        WHERE status = 'il'
          AND bdl_player_id <> ALL(${ids}::int[])
      `);
      cleared_il = cleared.rowCount ?? 0;
    } else {
      const cleared = await db.execute(sql`
        UPDATE public.player
        SET status = 'active'::player_status, updated_at = now()
        WHERE status = 'il'
      `);
      cleared_il = cleared.rowCount ?? 0;
    }

    return cronOk({ injuries_reported: injuredBdlIds.size, marked_il, cleared_il });
  } catch (err) {
    return cronError(err);
  }
}
