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
   * Polish spec §184 (Phase 47). Count of BDL rows that arrived as
   * `final` for a today-or-future date and were overridden to
   * `scheduled` at ingest. Telemetry — non-zero values indicate BDL
   * is feeding sandbox finals or there's clock skew worth checking.
   */
  future_finals_overridden?: number;
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
        // Polish spec §184 (Phase 47). If BDL hands us a `final`
        // status for a game whose date is today or future (no
        // `scheduled_start` available at this stage — second pass
        // populates it), trust the calendar: today's games shouldn't
        // already be final at the time of the daily prefetch run.
        // This catches the sandbox-final case at ingest. Live
        // games that genuinely finished post-prefetch get marked
        // final via the webhook (which has the per-row
        // scheduled_start guard in webhook-handler.ts).
        if (status === "final") {
          const todayIso = new Date().toISOString().slice(0, 10);
          if (g.date && g.date.slice(0, 10) >= todayIso) {
            status = "scheduled";
            summary.future_finals_overridden = (summary.future_finals_overridden ?? 0) + 1;
          }
        }
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

    // Polish spec §52 (Phase 19) + §65 (Phase 22) — second pass:
    // populate `scheduled_start` + `game_number` from MLB Stats API.
    // BDL doesn't expose start times or DH numbering.
    //
    // Matching strategy for DH days: MLB Stats may return 2 entries
    // for a matchup (gameNumber 1 + 2). For each entry, UPDATE the
    // FIRST unclaimed row that belongs to this matchup (claimed =
    // game_number already set). For non-DH days (single entry) this
    // matches the one row with a single UPDATE.
    try {
      const schedule = await fetchMlbStatsSchedule(iso);
      // Process entries in gameNumber order so 1 lands before 2 and
      // we don't race for the same NULL row.
      const sorted = [...schedule].sort((a, b) => a.gameNumber - b.gameNumber);
      for (const entry of sorted) {
        const homeAbbr = teamAbbrByMlbStatsId.get(entry.homeMlbStatsTeamId);
        const awayAbbr = teamAbbrByMlbStatsId.get(entry.awayMlbStatsTeamId);
        if (!homeAbbr || !awayAbbr) continue;
        // Target the row that either has no game_number yet (fresh
        // BDL insert) OR already has this game_number (re-run). If a
        // different game_number is already set for this matchup we
        // leave it alone — prevents clobbering DH1's data when
        // processing a DH2 entry for the same matchup.
        // ORDER BY note: `(game_number = N)` returns NULL for rows with
        // game_number IS NULL, and `NULL DESC` lands BEFORE `true` in
        // Postgres (NULLS FIRST is the default for DESC). That would
        // pick an unclaimed NULL row even when a row already has the
        // matching game_number — and trying to UPDATE the NULL row to
        // N would then violate `game_matchup_number_uidx` because the
        // claimed row already owns N for this matchup. Using
        // `IS TRUE DESC` coerces NULL into `false`, so the claimed row
        // wins the sort and the outer IS-DISTINCT-FROM gate turns the
        // update into a no-op. Unclaimed NULL rows only get picked
        // when no claimed row exists.
        const res = await db.execute(sql`
          UPDATE public.game AS g
          SET scheduled_start = ${entry.scheduledStartIso}::timestamptz,
              game_number = ${entry.gameNumber}::smallint,
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
          AND (scheduled_start IS DISTINCT FROM ${entry.scheduledStartIso}::timestamptz
               OR game_number IS DISTINCT FROM ${entry.gameNumber}::smallint)
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
