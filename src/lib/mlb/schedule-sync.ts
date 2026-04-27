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
  /**
   * Polish spec §194 (Phase 48). Count of BDL `final` rows that
   * failed the trust gates we can apply at ingest time (see §192)
   * and got overridden to `scheduled`. Telemetry — non-zero values
   * indicate BDL data quality issues worth checking. Subsumes the
   * P47 `future_finals_overridden` counter; the new name reflects
   * the broader predicate.
   */
  untrustworthy_finals_overridden?: number;
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
        let status = mapBdlStatus(g.status);
        // Polish spec §192 (Phase 48). Apply the trust gates we can
        // evaluate at ingest time. `scheduled_start` isn't populated
        // at this stage (second pass below), so we substitute the
        // BDL `g.date` calendar check for the time-only gate; we
        // also check the score sanity portion of the predicate
        // directly here using BDL's payload.
        //
        // Catches:
        //   - Future-dated finals (BDL sandbox / pre-published)
        //   - 0-0 finals (impossible in 2026 MLB; ghost-runner rule)
        //   - Final + null scores (unsupportable)
        //
        // Live games that genuinely finish post-prefetch get marked
        // final via the webhook (which uses
        // `public.final_passes_time_check()` directly — §192).
        if (status === "final") {
          const todayIso = new Date().toISOString().slice(0, 10);
          const homeRuns = g.home_team_data?.runs ?? null;
          const awayRuns = g.away_team_data?.runs ?? null;
          const isFutureDated = !!(g.date && g.date.slice(0, 10) >= todayIso);
          const isZeroZero = homeRuns === 0 && awayRuns === 0;
          const hasNullScores = homeRuns === null || awayRuns === null;
          if (isFutureDated || isZeroZero || hasNullScores) {
            status = "scheduled";
            summary.untrustworthy_finals_overridden =
              (summary.untrustworthy_finals_overridden ?? 0) + 1;
          }
        }
        // Polish spec §218 (Phase 54). BDL's `g.date` field is the
        // game's start time as a UTC ISO timestamp. We use it as the
        // authoritative `scheduled_start` directly, and convert to
        // an ET-pivoted slate date for `game.date` so it matches the
        // 4 AM ET pivot semantics in `current_slate_date()`. Pre-P54
        // we stored the raw UTC date slice for `game.date` and let
        // MLB Stats populate `scheduled_start` in a second pass —
        // that combination introduced an off-by-1-day bug for
        // evening-ET games (whose UTC timestamp crosses midnight),
        // because MLB Stats organizes by ET date and we were querying
        // by UTC date.
        const startTsIso = g.date ?? null;
        await db.execute(sql`
          INSERT INTO public.game (
            bdl_game_id, season_id, home_team_id, away_team_id,
            date, scheduled_start, status, is_postseason, venue,
            home_runs, away_runs, home_hits, away_hits,
            home_errors, away_errors,
            home_inning_scores, away_inning_scores, attendance
          ) VALUES (
            ${g.id},
            (SELECT id FROM public.season WHERE year = ${g.season}),
            (SELECT id FROM public.team WHERE bdl_team_id = ${g.home_team.id}),
            (SELECT id FROM public.team WHERE bdl_team_id = ${g.away_team.id}),
            ${
              startTsIso
                ? sql`((${startTsIso}::timestamptz AT TIME ZONE 'America/New_York' - INTERVAL '4 hours')::date)`
                : sql`NULL`
            },
            ${startTsIso ? sql`${startTsIso}::timestamptz` : sql`NULL`},
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
            -- §218: trust BDL's date as canonical for date + start.
            -- Schedule changes (rain delays, postponements) propagate.
            date = EXCLUDED.date,
            scheduled_start = EXCLUDED.scheduled_start,
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

    // Polish spec §218 (Phase 54). Second pass scope narrowed: only
    // populates `game_number` for DH disambiguation. `scheduled_start`
    // is now set authoritatively from BDL's `g.date` field in the
    // first pass — see §218 header on the INSERT block. Leaving the
    // MLB Stats matching here in case it's the wrong game (because
    // we now use ET-pivoted `date` to match), it'd at worst no-op
    // since the only column we can update is game_number.
    //
    // Matching strategy for DH days: MLB Stats may return 2 entries
    // for a matchup (gameNumber 1 + 2). For each entry, UPDATE the
    // FIRST unclaimed row that belongs to this matchup. ORDER BY
    // `IS TRUE DESC` coerces NULL `(game_number = N)` results into
    // `false`, so claimed rows win the sort and the outer IS-DISTINCT-
    // FROM gate turns the update into a no-op. Unclaimed NULL rows
    // only get picked when no claimed row exists.
    try {
      const schedule = await fetchMlbStatsSchedule(iso);
      const sorted = [...schedule].sort((a, b) => a.gameNumber - b.gameNumber);
      for (const entry of sorted) {
        const homeAbbr = teamAbbrByMlbStatsId.get(entry.homeMlbStatsTeamId);
        const awayAbbr = teamAbbrByMlbStatsId.get(entry.awayMlbStatsTeamId);
        if (!homeAbbr || !awayAbbr) continue;
        const res = await db.execute(sql`
          UPDATE public.game AS g
          SET game_number = ${entry.gameNumber}::smallint,
              updated_at = now()
          WHERE g.id = (
            SELECT id FROM public.game
            WHERE date = ${iso}::date
              AND home_team_id = (SELECT id FROM public.team WHERE abbreviation = ${homeAbbr})
              AND away_team_id = (SELECT id FROM public.team WHERE abbreviation = ${awayAbbr})
              AND (game_number IS NULL OR game_number = ${entry.gameNumber}::smallint)
            ORDER BY
              (game_number = ${entry.gameNumber}::smallint) IS TRUE DESC,
              created_at ASC
            LIMIT 1
          )
          AND game_number IS DISTINCT FROM ${entry.gameNumber}::smallint
        `);
        summary.scheduled_starts_updated += res.rowCount ?? 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushError(summary, `mlb-stats schedule ${iso}: ${msg}`);
    }

    // Polish spec §65 (Phase 22) self-healing dedup. BDL occasionally
    // emits the same game under two bdl_game_ids; the INSERT ON
    // CONFLICT (bdl_game_id) clause doesn't catch it and a second row
    // lands with game_number IS NULL. Migration 0035's dedup backfill
    // was one-shot; without this step, every BDL dupe would stick
    // around until the next migration. Only deletes NULL-game_number
    // rows that have zero game_events and share a matchup-date with a
    // claimed sibling — guaranteed-safe to drop.
    try {
      const dedupRes = await db.execute(sql`
        DELETE FROM public.game g
        WHERE g.date = ${iso}::date
          AND g.game_number IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.game_event ge WHERE ge.game_id = g.id
          )
          AND EXISTS (
            SELECT 1 FROM public.game g2
            WHERE g2.date = g.date
              AND g2.home_team_id = g.home_team_id
              AND g2.away_team_id = g.away_team_id
              AND g2.id <> g.id
              AND g2.game_number IS NOT NULL
          )
      `);
      const dropped = dedupRes.rowCount ?? 0;
      if (dropped > 0) {
        pushError(summary, `dedup ${iso}: dropped ${dropped} orphan BDL dupe row(s)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushError(summary, `dedup ${iso}: ${msg}`);
    }
  }

  return summary;
}

function pushError(summary: SyncSummary, msg: string): void {
  if (summary.errors.length < MAX_ERROR_LOG) {
    summary.errors.push(msg);
  }
}
