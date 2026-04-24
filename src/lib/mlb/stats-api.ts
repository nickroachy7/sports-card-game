/**
 * Polish spec §161 (Phase 45) — MLB Stats API provider.
 *
 * statsapi.mlb.com is MLB's official public stats API. Free, no auth,
 * no rate limits for the small-scale usage here. Used exclusively
 * for authoritative 26-man active-roster state — BDL (our primary
 * integration) doesn't distinguish 26-man from 40-man-optioned, and
 * every serious fantasy product (DK/FD/Topps Bunt) sources this
 * distinction from MLB directly.
 *
 * Usage pattern:
 *   1. fetchActiveTeams() → list of 30 MLB teams with statsapi IDs
 *   2. fetchActiveRoster(teamId) → 26-man mlbam_ids for one team
 *   3. fetchAllActiveRosters() → convenience: step 1 + 30× step 2
 *
 * Keep this module dep-free — no BDL types, no DB access. Pure HTTP.
 */

const BASE = "https://statsapi.mlb.com/api/v1";
const FETCH_TIMEOUT_MS = 10_000;

export type MlbStatsTeam = {
  id: number;
  name: string;
  abbreviation: string;
};

export type MlbStatsRosterEntry = {
  /** Stable MLBAM player id — joins to public.player.mlbam_id. */
  mlbamId: number;
  fullName: string;
  teamId: number;
};

/**
 * Fetches all 30 MLB teams. sportId=1 = MLB (Stats API covers minor
 * leagues too; we scope explicitly). Sorted-for-display output, but
 * callers shouldn't rely on order.
 */
export async function fetchActiveTeams(): Promise<MlbStatsTeam[]> {
  const res = await fetchWithTimeout(`${BASE}/teams?sportId=1`);
  if (!res.ok) {
    throw new Error(`MLB Stats /teams returned ${res.status}`);
  }
  const data = (await res.json()) as {
    teams: Array<{ id: number; name: string; abbreviation: string; active?: boolean }>;
  };
  // `active: true` filters out historical relocations (e.g. Montreal
  // Expos) that Stats API still returns.
  return data.teams
    .filter((t) => t.active !== false)
    .map((t) => ({ id: t.id, name: t.name, abbreviation: t.abbreviation }));
}

/**
 * Fetches the active (26-man) roster for one team. Response includes
 * `person.id` which is the canonical MLBAM id.
 */
export async function fetchActiveRoster(teamId: number): Promise<MlbStatsRosterEntry[]> {
  const res = await fetchWithTimeout(`${BASE}/teams/${teamId}/roster?rosterType=active`);
  if (!res.ok) {
    throw new Error(`MLB Stats /teams/${teamId}/roster returned ${res.status}`);
  }
  const data = (await res.json()) as {
    roster: Array<{ person: { id: number; fullName: string } }>;
  };
  return data.roster.map((r) => ({
    mlbamId: r.person.id,
    fullName: r.person.fullName,
    teamId,
  }));
}

/**
 * Convenience: pulls the full 30-team active-roster set. Runs the 30
 * per-team fetches in parallel so wall time is bounded by the slowest
 * single request, not 30× sequential. Partial failures are reported
 * but don't abort — a single bad team response shouldn't nuke the
 * whole sync.
 */
export async function fetchAllActiveRosters(): Promise<{
  teams: MlbStatsTeam[];
  roster: MlbStatsRosterEntry[];
  failures: { teamId: number; reason: string }[];
}> {
  const teams = await fetchActiveTeams();
  const failures: { teamId: number; reason: string }[] = [];

  const results = await Promise.all(
    teams.map(async (team) => {
      try {
        return await fetchActiveRoster(team.id);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "unknown";
        failures.push({ teamId: team.id, reason });
        return [] as MlbStatsRosterEntry[];
      }
    }),
  );

  return { teams, roster: results.flat(), failures };
}

/**
 * Thin fetch wrapper with a timeout. Stats API is usually fast (~200ms)
 * but occasionally stalls; a 10s ceiling keeps the cron bounded.
 */
async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}
