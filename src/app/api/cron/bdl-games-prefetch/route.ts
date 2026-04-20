import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
import { getMLBProvider } from "@/lib/mlb/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Daily games pre-fetch — API spec §5.3, BDL integration §7.
 *
 * Pulls today's MLB schedule and upserts rows into `game`. Idempotent;
 * safe to run repeatedly. Scheduled at 06:00 ET daily.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);
    const db = getDb();
    const provider = getMLBProvider();

    const today = new Date();
    const games = await provider.fetchGamesByDate(today);

    let upserts = 0;
    let skipped = 0;

    for (const g of games) {
      try {
        const status = mapGameStatus(g.status);
        await db.execute(sql`
          INSERT INTO public.game (
            bdl_game_id, season_id, home_team_id, away_team_id,
            date, status, is_postseason, venue,
            home_runs, away_runs, home_hits, away_hits,
            home_errors, away_errors,
            home_inning_scores, away_inning_scores, attendance
          ) VALUES (
            ${g.id},
            (SELECT id FROM public.season WHERE year = ${g.season}),
            (SELECT id FROM public.team WHERE bdl_team_id = ${g.home_team.id}),
            (SELECT id FROM public.team WHERE bdl_team_id = ${g.away_team.id}),
            ${g.date ? g.date.slice(0, 10) : null},
            ${status}::game_status,
            ${g.postseason ?? false},
            ${g.venue ?? null},
            ${g.home_team_data?.runs ?? null},
            ${g.away_team_data?.runs ?? null},
            ${g.home_team_data?.hits ?? null},
            ${g.away_team_data?.hits ?? null},
            ${g.home_team_data?.errors ?? null},
            ${g.away_team_data?.errors ?? null},
            ${g.home_team_data?.inning_scores ?? null}::int[],
            ${g.away_team_data?.inning_scores ?? null}::int[],
            ${g.attendance ?? null}
          )
          ON CONFLICT (bdl_game_id) DO UPDATE SET
            status = EXCLUDED.status,
            is_postseason = EXCLUDED.is_postseason,
            venue = EXCLUDED.venue,
            home_runs = EXCLUDED.home_runs,
            away_runs = EXCLUDED.away_runs,
            home_hits = EXCLUDED.home_hits,
            away_hits = EXCLUDED.away_hits,
            home_errors = EXCLUDED.home_errors,
            away_errors = EXCLUDED.away_errors,
            home_inning_scores = EXCLUDED.home_inning_scores,
            away_inning_scores = EXCLUDED.away_inning_scores,
            attendance = EXCLUDED.attendance,
            updated_at = now()
        `);
        upserts += 1;
      } catch (err) {
        skipped += 1;
        console.error(
          "[bdl-games-prefetch] skipping game",
          { bdl_game_id: g.id, home: g.home_team?.abbreviation, away: g.away_team?.abbreviation },
          err,
        );
      }
    }

    return cronOk({ date: today.toISOString().slice(0, 10), upserts, skipped });
  } catch (err) {
    return cronError(err);
  }
}

/** BDL's status strings → our game_status enum. */
function mapGameStatus(raw: string | null | undefined): string {
  if (!raw) return "scheduled";
  const s = raw.toLowerCase();
  if (s.includes("final")) return "final";
  if (s.includes("live") || s.includes("in progress") || s.includes("progress")) return "live";
  if (s.includes("postpone")) return "postponed";
  if (s.includes("suspend")) return "suspended";
  if (s.includes("cancel")) return "canceled";
  return "scheduled";
}
