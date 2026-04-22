import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { asPgArrayOrNull } from "@/lib/db/sql-helpers";
import { getMLBProvider } from "@/lib/mlb/provider";
import { withBdlRetry } from "@/lib/mlb/retry";

/**
 * Polish spec §14 — MLB schedule sync.
 *
 * Pulls today + N days ahead from BDL and upserts into
 * `public.game`. Keyed on `bdl_game_id`. Idempotent — safe to run
 * every 2h during the day.
 *
 * Two rules worth calling out:
 *
 *   1. No-regress on status. If the existing row is already `live`
 *      or `final`, sync leaves the status alone. Webhooks are the
 *      authoritative source for status transitions; a 2h cron
 *      seeing a stale "Scheduled" must not stomp the "live" that
 *      `mlb.game.started` wrote five minutes ago.
 *
 *   2. COALESCE on score fields. A BDL schedule response for a
 *      scheduled game returns null runs / hits / errors. Webhooks
 *      + the reconcile path may have populated those mid-game.
 *      The upsert keeps whatever's there unless BDL provides a
 *      non-null replacement.
 *
 * Missing upstream data (team not in `public.team`, season not in
 * `public.season`) is logged + skipped per game; doesn't fail the
 * whole sync.
 */

export type GameStatus = "scheduled" | "live" | "final" | "postponed" | "suspended" | "canceled";

export type SyncSummary = {
  /** Games we successfully upserted. */
  synced: number;
  /** Games skipped due to per-row errors (missing team, bad payload, etc). */
  skipped: number;
  /** Date strings (YYYY-MM-DD) covered in this run. */
  days: string[];
  /** Human-readable notes for observability. Bounded at 20 entries. */
  errors: string[];
};

const MAX_ERROR_LOG = 20;

/**
 * BDL status strings → our game_status enum. Substring-match is
 * tolerant of small vendor wording changes ("In Progress" vs
 * "In Progress - 3rd Inning"). Exported for unit tests.
 */
export function mapBdlStatus(raw: string | null | undefined): GameStatus {
  if (!raw) return "scheduled";
  const s = raw.toLowerCase();
  if (s.includes("final")) return "final";
  if (s.includes("live") || s.includes("progress")) return "live";
  if (s.includes("postpone")) return "postponed";
  if (s.includes("suspend") || s.includes("delay")) return "suspended";
  if (s.includes("cancel")) return "canceled";
  // Scheduled / Pre-Game / Warmup / unknown fall here.
  return "scheduled";
}

/**
 * Pull today + `daysAhead` days of scheduled games from BDL and
 * upsert them. Returns a summary for cron logging / observability.
 */
export async function syncScheduleHorizon(daysAhead = 2): Promise<SyncSummary> {
  const provider = getMLBProvider();
  const db = getDb();

  const summary: SyncSummary = { synced: 0, skipped: 0, days: [], errors: [] };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dates: Date[] = [];
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + i);
    dates.push(d);
  }

  for (const date of dates) {
    const iso = date.toISOString().slice(0, 10);
    summary.days.push(iso);
    let games: Awaited<ReturnType<typeof provider.fetchGamesByDate>>;
    try {
      games = await withBdlRetry(() => provider.fetchGamesByDate(date));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushError(summary, `fetch ${iso}: ${msg}`);
      continue;
    }

    for (const g of games) {
      try {
        const status = mapBdlStatus(g.status);
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
            ${asPgArrayOrNull(g.home_team_data?.inning_scores ?? null, "int")},
            ${asPgArrayOrNull(g.away_team_data?.inning_scores ?? null, "int")},
            ${g.attendance ?? null}
          )
          ON CONFLICT (bdl_game_id) DO UPDATE SET
            status = CASE
              WHEN public.game.status IN ('live', 'final')
                THEN public.game.status
              ELSE EXCLUDED.status
            END,
            is_postseason = EXCLUDED.is_postseason,
            venue = EXCLUDED.venue,
            home_runs = COALESCE(EXCLUDED.home_runs, public.game.home_runs),
            away_runs = COALESCE(EXCLUDED.away_runs, public.game.away_runs),
            home_hits = COALESCE(EXCLUDED.home_hits, public.game.home_hits),
            away_hits = COALESCE(EXCLUDED.away_hits, public.game.away_hits),
            home_errors = COALESCE(EXCLUDED.home_errors, public.game.home_errors),
            away_errors = COALESCE(EXCLUDED.away_errors, public.game.away_errors),
            home_inning_scores = COALESCE(EXCLUDED.home_inning_scores, public.game.home_inning_scores),
            away_inning_scores = COALESCE(EXCLUDED.away_inning_scores, public.game.away_inning_scores),
            attendance = COALESCE(EXCLUDED.attendance, public.game.attendance),
            updated_at = now()
        `);
        summary.synced += 1;
      } catch (err) {
        summary.skipped += 1;
        const msg = err instanceof Error ? err.message : String(err);
        const tag = `${g.away_team?.abbreviation ?? "???"}@${g.home_team?.abbreviation ?? "???"}`;
        pushError(summary, `game ${g.id} (${tag} on ${iso}): ${msg}`);
      }
    }
  }

  return summary;
}

function pushError(summary: SyncSummary, msg: string): void {
  if (summary.errors.length < MAX_ERROR_LOG) {
    summary.errors.push(msg);
  }
}
