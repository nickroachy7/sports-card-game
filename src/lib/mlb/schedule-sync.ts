import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { asPgArrayOrNull } from "@/lib/db/sql-helpers";
import { fetchMlbStatsSchedule } from "@/lib/mlb/mlb-stats-schedule";
import { MLB_STATS_TEAM_IDS } from "@/lib/mlb/mlb-stats-team-ids";
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
  /**
   * Game rows that got `scheduled_start` populated/refreshed from the
   * MLB Stats API second-pass (polish spec §52).
   */
  scheduled_starts_updated: number;
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

  const summary: SyncSummary = {
    synced: 0,
    skipped: 0,
    scheduled_starts_updated: 0,
    days: [],
    errors: [],
  };

  // Reverse map: MLB Stats teamId → our team.abbreviation. Built once
  // and used to look up our team uuid in the scheduled_start UPDATE
  // below. Handles BDL/our abbreviation aliases (OAK/ATH, CWS/CHW).
  const teamAbbrByMlbStatsId = new Map<number, string>();
  for (const [abbr, mlbId] of Object.entries(MLB_STATS_TEAM_IDS)) {
    // Prefer the first-registered abbr for a given teamId (aliases
    // come second in the const map). Won't fully matter since both
    // abbreviations resolve to the same team in public.team via
    // abbreviation lookup below.
    if (!teamAbbrByMlbStatsId.has(mlbId)) teamAbbrByMlbStatsId.set(mlbId, abbr);
  }

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

    // Polish spec §52 — second pass: populate `scheduled_start` from
    // MLB Stats API. BDL doesn't expose start times, so we'd be stuck
    // with `scheduled_start IS NULL` forever without this.
    try {
      const schedule = await fetchMlbStatsSchedule(iso);
      for (const entry of schedule) {
        const homeAbbr = teamAbbrByMlbStatsId.get(entry.homeMlbStatsTeamId);
        const awayAbbr = teamAbbrByMlbStatsId.get(entry.awayMlbStatsTeamId);
        if (!homeAbbr || !awayAbbr) continue;
        const res = await db.execute(sql`
          UPDATE public.game
          SET scheduled_start = ${entry.scheduledStartIso}::timestamptz,
              updated_at = now()
          WHERE date = ${iso}::date
            AND home_team_id = (SELECT id FROM public.team WHERE abbreviation = ${homeAbbr})
            AND away_team_id = (SELECT id FROM public.team WHERE abbreviation = ${awayAbbr})
            AND (scheduled_start IS NULL
                 OR scheduled_start IS DISTINCT FROM ${entry.scheduledStartIso}::timestamptz)
        `);
        summary.scheduled_starts_updated += res.rowCount ?? 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushError(summary, `mlb-stats schedule ${iso}: ${msg}`);
    }
  }

  return summary;
}

function pushError(summary: SyncSummary, msg: string): void {
  if (summary.errors.length < MAX_ERROR_LOG) {
    summary.errors.push(msg);
  }
}
