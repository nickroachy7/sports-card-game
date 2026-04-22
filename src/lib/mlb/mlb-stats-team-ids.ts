/**
 * Polish spec §36 — MLB Stats API `teamId` ↔ our team abbreviation.
 *
 * BDL + our internal `team.abbreviation` column (e.g., "LAD",
 * "NYY") don't map 1:1 to MLB Stats API's `/sports/1/teams` ids.
 * The ids below come from a one-time call to
 * `https://statsapi.mlb.com/api/v1/teams?sportId=1` + hand-
 * transcribed.
 *
 * Values are stable across seasons (the canonical id never
 * changes once assigned). If MLB rotates an id — rare — update
 * here and re-run the backfill.
 */
export const MLB_STATS_TEAM_IDS: Record<string, number> = {
  LAA: 108,
  ARI: 109,
  BAL: 110,
  BOS: 111,
  CHC: 112,
  CIN: 113,
  CLE: 114,
  COL: 115,
  DET: 116,
  HOU: 117,
  KC: 118,
  LAD: 119,
  WSH: 120,
  NYM: 121,
  OAK: 133,
  ATH: 133, // OAK moved — some sources use ATH. Alias for safety.
  PIT: 134,
  SD: 135,
  SEA: 136,
  SF: 137,
  STL: 138,
  TB: 139,
  TEX: 140,
  TOR: 141,
  MIN: 142,
  PHI: 143,
  ATL: 144,
  CWS: 145,
  CHW: 145, // Alias (some sources use CHW).
  MIA: 146,
  NYY: 147,
  MIL: 158,
};

/** Return the MLB Stats teamId for an abbreviation, or null if unknown. */
export function mlbStatsTeamId(abbreviation: string | null | undefined): number | null {
  if (!abbreviation) return null;
  return MLB_STATS_TEAM_IDS[abbreviation.toUpperCase()] ?? null;
}
