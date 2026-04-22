import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
import { MLB_STATS_TEAM_IDS, mlbStatsTeamId } from "@/lib/mlb/mlb-stats-team-ids";
import { levenshtein, normalizeName } from "@/lib/mlb/name-match";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * MLBAM id backfill — polish spec §36 (Phase 15).
 *
 * Primary strategy: fetch each team's 40-man roster from MLB Stats
 * API at `/api/v1/sports/1/roster/40Man?teamId=N&hydrate=person` —
 * one call per team, 30 calls total. The roster endpoint returns
 * every 40-man player with their MLBAM id, including callups and
 * on-the-60-day-IL players that `/people/search` filters out. This
 * was the Phase 14 bottleneck (~23% of our 40-man couldn't be
 * resolved by search alone).
 *
 * For each team's roster, we match against our `player` rows where
 *   team_id = <our team uuid for this abbr>
 *   AND normalizeName(first_name) + normalizeName(last_name)
 *       equals (or fuzzy ≤ 2 from) the MLB Stats entry.
 * Team scoping by construction prevents same-name cross-team
 * collisions (e.g., two Jose Ramirez).
 *
 * Fallback: players not matched by any team's 40-man (released,
 * retired in-season, unusual name variants) fall through to the
 * Phase 14 `/people/search` matcher — single call per residual,
 * same fuzzy + strategies logic.
 *
 * Idempotent. Sets `photo_synced_at = now()` on every attempted
 * row so re-runs skip already-seen. `?retry_failed=true` bypasses.
 *
 * Query params:
 *   ?limit=N              Cap on residual-fallback players to
 *                          attempt. Default 50, max 500. Team
 *                          roster fetches always run (all 30) —
 *                          the limit only scopes the slower
 *                          search-based fallback.
 *   ?retry_failed=true    Ignores `photo_synced_at IS NOT NULL`
 *                          skip. Run once per matcher change.
 *   ?skip_roster=true     Skip the 40-man fetch, fallback-only.
 *                          Useful for iterating on the search
 *                          matcher without re-hitting every team.
 *
 * Response:
 *   { roster_matched, fallback_matched, ambiguous, unmatched,
 *     teams_processed, unseen_remaining, unmatched_total,
 *     strategies }
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);

    const url = new URL(req.url);
    const rawLimit = url.searchParams.get("limit");
    const limit = Math.min(Math.max(Number.parseInt(rawLimit ?? "50", 10) || 50, 1), 500);
    const retryFailed = url.searchParams.get("retry_failed") === "true";
    const skipRoster = url.searchParams.get("skip_roster") === "true";

    const db = getDb();
    let rosterMatched = 0;
    let fallbackMatched = 0;
    let ambiguous = 0;
    let unmatched = 0;
    let teamsProcessed = 0;
    const strategies: Record<MatchStrategy, number> = {
      exact: 0,
      stripped: 0,
      fuzzy: 0,
      team_disambiguated: 0,
      roster_exact: 0,
      roster_fuzzy: 0,
    };

    // ── 1) 40-man roster pass — the Phase 15 primary strategy. ───
    if (!skipRoster) {
      type TeamRow = { id: string; abbreviation: string };
      const teamsRes = await db.execute<TeamRow>(sql`
        SELECT id, abbreviation FROM public.team ORDER BY abbreviation ASC
      `);

      for (const team of teamsRes.rows) {
        const mlbId = mlbStatsTeamId(team.abbreviation);
        if (mlbId === null) continue;
        try {
          const roster = await fetchRoster40Man(mlbId);
          if (roster.length === 0) continue;

          // Pull our player rows on this team that still need an id.
          // photo_synced_at filter respects the retry_failed flag.
          const skipClause = retryFailed ? sql`` : sql`AND photo_synced_at IS NULL`;
          type PlayerRow = {
            id: string;
            first_name: string;
            last_name: string;
          };
          const ourPlayers = await db.execute<PlayerRow>(sql`
            SELECT id, first_name, last_name FROM public.player
            WHERE team_id = ${team.id}::uuid
              AND mlbam_id IS NULL
              ${skipClause}
          `);
          if (ourPlayers.rows.length === 0) continue;

          for (const p of ourPlayers.rows) {
            const firstNorm = normalizeName(p.first_name);
            const lastNorm = normalizeName(p.last_name);

            // Exact-normalized match against this team's 40-man.
            let match = roster.find(
              (r) =>
                normalizeName(r.firstName) === firstNorm && normalizeName(r.lastName) === lastNorm,
            );
            let strategy: MatchStrategy = "roster_exact";

            // Fuzzy fallback within the team (≤ 2 combined). Single-
            // candidate only to minimize false positives.
            if (!match) {
              const fuzzy = roster.filter(
                (r) =>
                  levenshtein(normalizeName(r.firstName), firstNorm) +
                    levenshtein(normalizeName(r.lastName), lastNorm) <=
                  2,
              );
              if (fuzzy.length === 1) {
                match = fuzzy[0];
                strategy = "roster_fuzzy";
              }
            }

            if (match) {
              await db.execute(sql`
                UPDATE public.player
                SET mlbam_id = ${match.mlbamId}::int,
                    photo_synced_at = now()
                WHERE id = ${p.id}::uuid
              `);
              rosterMatched += 1;
              strategies[strategy] += 1;
            }
            // Unmatched-against-this-team players just stay in the
            // pool; they'll get the search fallback below.
          }

          teamsProcessed += 1;
          // Polite delay between team fetches.
          await sleep(500);
        } catch {
          // Ignore this team on error; next team.
        }
      }
    }

    // ── 2) Search-based fallback for residuals. ──────────────────
    // Any row that's still mlbam_id=null + photo_synced_at=null (or
    // retry_failed=true → all mlbam_id=null) hits the Phase 14
    // search matcher. Up to `limit` per invocation.
    const skipAttemptedClause = retryFailed ? sql`` : sql`AND p.photo_synced_at IS NULL`;
    const residualsRes = await db.execute<{
      id: string;
      first_name: string;
      last_name: string;
      full_name: string;
      team_abbr: string | null;
    }>(sql`
      SELECT p.id, p.first_name, p.last_name, p.full_name, t.abbreviation AS team_abbr
      FROM public.player p
      LEFT JOIN public.team t ON t.id = p.team_id
      WHERE p.mlbam_id IS NULL
        AND p.is_active_40_man = true
        ${skipAttemptedClause}
      ORDER BY p.last_name ASC, p.first_name ASC
      LIMIT ${limit}
    `);

    for (const player of residualsRes.rows) {
      let outcome: MatchOutcome = { kind: "unmatched" };
      try {
        outcome = await resolveViaSearch(player);
      } catch {
        // Network/parse error — count as unmatched + mark attempted.
      }

      if (outcome.kind === "match") {
        await db.execute(sql`
          UPDATE public.player
          SET mlbam_id = ${outcome.mlbamId}::int,
              photo_synced_at = now()
          WHERE id = ${player.id}::uuid
        `);
        fallbackMatched += 1;
        strategies[outcome.strategy] += 1;
      } else {
        await db.execute(sql`
          UPDATE public.player
          SET photo_synced_at = now()
          WHERE id = ${player.id}::uuid
        `);
        if (outcome.kind === "ambiguous") ambiguous += 1;
        else unmatched += 1;
      }
      await sleep(200);
    }

    // Final counts for the response.
    const remainingRes = await db.execute<{
      unseen: string | number;
      unmatched_total: string | number;
    }>(sql`
      SELECT
        count(*) FILTER (WHERE photo_synced_at IS NULL) AS unseen,
        count(*) AS unmatched_total
      FROM public.player
      WHERE mlbam_id IS NULL AND is_active_40_man = true
    `);
    const unseen = Number(remainingRes.rows[0]?.unseen ?? 0);
    const unmatchedTotal = Number(remainingRes.rows[0]?.unmatched_total ?? 0);

    return cronOk({
      teams_processed: teamsProcessed,
      roster_matched: rosterMatched,
      fallback_matched: fallbackMatched,
      ambiguous,
      unmatched,
      unseen_remaining: unseen,
      unmatched_total: unmatchedTotal,
      strategies,
    });
  } catch (err) {
    return cronError(err);
  }
}

// ── Types ────────────────────────────────────────────────────────

type MatchStrategy =
  | "exact"
  | "stripped"
  | "fuzzy"
  | "team_disambiguated"
  | "roster_exact"
  | "roster_fuzzy";

type MatchOutcome =
  | { kind: "match"; mlbamId: number; strategy: MatchStrategy }
  | { kind: "ambiguous" }
  | { kind: "unmatched" };

type RosterEntry = {
  mlbamId: number;
  firstName: string;
  lastName: string;
};

type MlbStatsPerson = {
  id?: number;
  firstName?: string;
  lastName?: string;
  currentTeam?: { abbreviation?: string };
  active?: boolean;
};
type MlbStatsSearchResponse = {
  people?: MlbStatsPerson[];
};

// MLB Stats 40-man roster endpoint shape (partial).
type Roster40ManResponse = {
  roster?: Array<{
    person?: {
      id?: number;
      firstName?: string;
      lastName?: string;
      useName?: string;
      useLastName?: string;
    };
  }>;
};

// ── 40-man roster fetch ──────────────────────────────────────────

async function fetchRoster40Man(teamId: number): Promise<RosterEntry[]> {
  const resp = await fetch(
    `https://statsapi.mlb.com/api/v1/sports/1/roster/40Man?teamId=${teamId}&hydrate=person`,
    { cache: "no-store" },
  );
  if (!resp.ok) return [];
  const json = (await resp.json()) as Roster40ManResponse;
  const out: RosterEntry[] = [];
  for (const r of json.roster ?? []) {
    const p = r.person;
    const id = p?.id;
    const firstName = p?.firstName ?? p?.useName ?? "";
    const lastName = p?.lastName ?? p?.useLastName ?? "";
    if (typeof id === "number" && firstName && lastName) {
      out.push({ mlbamId: id, firstName, lastName });
    }
  }
  return out;
}

// ── Phase 14 search-based matcher (preserved as fallback) ────────

async function resolveViaSearch(player: {
  first_name: string;
  last_name: string;
  full_name: string;
  team_abbr: string | null;
}): Promise<MatchOutcome> {
  const q = encodeURIComponent(player.full_name);
  const resp = await fetch(
    `https://statsapi.mlb.com/api/v1/people/search?names=${q}&hydrate=currentTeam`,
    { cache: "no-store" },
  );
  if (!resp.ok) return { kind: "unmatched" };
  const json = (await resp.json()) as MlbStatsSearchResponse;
  const people = json.people ?? [];
  if (people.length === 0) return { kind: "unmatched" };

  const firstRaw = player.first_name.trim().toLowerCase();
  const lastRaw = player.last_name.trim().toLowerCase();
  const exact = people.filter(
    (p) =>
      (p.firstName ?? "").trim().toLowerCase() === firstRaw &&
      (p.lastName ?? "").trim().toLowerCase() === lastRaw,
  );
  const exactResolved = resolveCandidates(exact, player.team_abbr, "exact");
  if (exactResolved.kind !== "unmatched") return exactResolved;

  const firstNorm = normalizeName(player.first_name);
  const lastNorm = normalizeName(player.last_name);
  const stripped = people.filter(
    (p) =>
      normalizeName(p.firstName ?? "") === firstNorm &&
      normalizeName(p.lastName ?? "") === lastNorm,
  );
  const strippedResolved = resolveCandidates(stripped, player.team_abbr, "stripped");
  if (strippedResolved.kind !== "unmatched") return strippedResolved;

  const fuzzy = people.filter(
    (p) =>
      levenshtein(normalizeName(p.firstName ?? ""), firstNorm) +
        levenshtein(normalizeName(p.lastName ?? ""), lastNorm) <=
      2,
  );
  if (fuzzy.length === 1 && typeof fuzzy[0]?.id === "number") {
    return { kind: "match", mlbamId: fuzzy[0].id, strategy: "fuzzy" };
  }
  if (fuzzy.length > 1) {
    const teamResolved = resolveCandidates(fuzzy, player.team_abbr, "team_disambiguated");
    if (teamResolved.kind !== "unmatched") return teamResolved;
    return { kind: "ambiguous" };
  }

  return { kind: "unmatched" };
}

function resolveCandidates(
  candidates: MlbStatsPerson[],
  teamAbbr: string | null,
  strategy: MatchStrategy,
): MatchOutcome {
  if (candidates.length === 0) return { kind: "unmatched" };
  if (candidates.length === 1) {
    const id = candidates[0]?.id;
    return typeof id === "number"
      ? { kind: "match", mlbamId: id, strategy }
      : { kind: "unmatched" };
  }
  if (teamAbbr) {
    const byTeam = candidates.find(
      (p) => p.currentTeam?.abbreviation?.toLowerCase() === teamAbbr.toLowerCase(),
    );
    if (byTeam?.id) {
      return { kind: "match", mlbamId: byTeam.id, strategy: "team_disambiguated" };
    }
  }
  const active = candidates.filter((p) => p.active === true);
  if (active.length === 1 && active[0]?.id) {
    return { kind: "match", mlbamId: active[0].id, strategy };
  }
  return { kind: "ambiguous" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Suppress unused-export-checker for a referenced constant.
void MLB_STATS_TEAM_IDS;
