/**
 * MLB Stats schedule helper — polish spec §52 (Phase 19).
 *
 * BDL's `MLBGame` type doesn't expose game start times. We pull
 * from MLB Stats API's public `schedule` endpoint — same source
 * we already use for 40-man rosters (Phase 15) + player search
 * (Phase 14). Returns one entry per MLB game for the given date:
 *   - `homeMlbStatsTeamId` / `awayMlbStatsTeamId` (canonical MLB
 *     Stats ids; map to our `team.abbreviation` via
 *     `MLB_STATS_TEAM_IDS`)
 *   - `scheduledStartIso` (full UTC ISO timestamp)
 *
 * We don't rely on `gamePk` (MLB Stats' own game id) because our
 * `public.game` doesn't track it; we match by (date, home_team,
 * away_team) instead.
 */

export type MlbStatsScheduleEntry = {
  homeMlbStatsTeamId: number;
  awayMlbStatsTeamId: number;
  scheduledStartIso: string;
};

type RawResponse = {
  dates?: Array<{
    games?: Array<{
      gameDate?: string;
      teams?: {
        home?: { team?: { id?: number } };
        away?: { team?: { id?: number } };
      };
    }>;
  }>;
};

/**
 * Fetch the schedule for a single YYYY-MM-DD date. Returns the
 * list of games on that date with their scheduled start times,
 * keyed by MLB Stats teamIds.
 */
export async function fetchMlbStatsSchedule(date: string): Promise<MlbStatsScheduleEntry[]> {
  const resp = await fetch(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}`,
    { cache: "no-store" },
  );
  if (!resp.ok) return [];
  const json = (await resp.json()) as RawResponse;
  const out: MlbStatsScheduleEntry[] = [];
  for (const d of json.dates ?? []) {
    for (const g of d.games ?? []) {
      const homeId = g.teams?.home?.team?.id;
      const awayId = g.teams?.away?.team?.id;
      const gameDate = g.gameDate;
      if (
        typeof homeId === "number" &&
        typeof awayId === "number" &&
        typeof gameDate === "string"
      ) {
        out.push({
          homeMlbStatsTeamId: homeId,
          awayMlbStatsTeamId: awayId,
          scheduledStartIso: gameDate,
        });
      }
    }
  }
  return out;
}
