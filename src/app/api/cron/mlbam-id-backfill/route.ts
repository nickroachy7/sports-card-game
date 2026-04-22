import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
import { levenshtein, normalizeName } from "@/lib/mlb/name-match";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * MLBAM id backfill — polish spec §26, improved §28.
 *
 * BDL doesn't expose MLBAM ids. This endpoint iterates active 40-man
 * `player` rows with `mlbam_id IS NULL`, queries MLB Stats API's
 * public search endpoint for each name, and writes the matched id
 * back to `public.player.mlbam_id`.
 *
 * Match strategy (in order, first hit wins):
 *   1. `exact` — literal first+last equality
 *   2. `stripped` — after NFD-decompose + strip diacritics + strip
 *      Jr./Sr./II-V suffix
 *   3. `fuzzy` — Levenshtein ≤ 2 on both first AND last (normalized),
 *      single-candidate only
 *   4. `team_disambiguated` — multiple name matches, team-abbr
 *      matches via MLB Stats `hydrate=currentTeam`
 *
 * Idempotent — marks every attempted row with `photo_synced_at =
 * now()` so re-runs only touch un-seen players. Use
 * `?retry_failed=true` to bypass that filter and re-try every
 * unmatched row with the current matcher.
 *
 * Query params:
 *   ?limit=N                 Cap per invocation. Default 50, max 500.
 *   ?retry_failed=true       Ignore the skip-attempted filter so the
 *                             current matcher retries previously-
 *                             failed rows. Combine with `?limit=`
 *                             to paginate.
 *
 * Response:
 *   { attempted, matched, ambiguous, unmatched,
 *     unseen_remaining, unmatched_total, strategies }
 *   strategies: { exact, stripped, fuzzy, team_disambiguated }
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);

    const url = new URL(req.url);
    const rawLimit = url.searchParams.get("limit");
    const limit = Math.min(Math.max(Number.parseInt(rawLimit ?? "50", 10) || 50, 1), 500);
    const retryFailed = url.searchParams.get("retry_failed") === "true";

    const db = getDb();

    type Row = {
      id: string;
      first_name: string;
      last_name: string;
      full_name: string;
      team_abbr: string | null;
    };
    // Skip rows we've already attempted unless `?retry_failed=true`
    // — the hardened matcher in Phase 14 is worth one more shot at
    // the residuals Phase 13 couldn't resolve.
    const skipAttemptedClause = retryFailed ? sql`` : sql`AND p.photo_synced_at IS NULL`;
    const rows = await db.execute<Row>(sql`
      SELECT p.id, p.first_name, p.last_name, p.full_name, t.abbreviation AS team_abbr
      FROM public.player p
      LEFT JOIN public.team t ON t.id = p.team_id
      WHERE p.mlbam_id IS NULL
        AND p.is_active_40_man = true
        ${skipAttemptedClause}
      ORDER BY p.last_name ASC, p.first_name ASC
      LIMIT ${limit}
    `);

    let matched = 0;
    let ambiguous = 0;
    let unmatched = 0;
    const strategies: Record<MatchStrategy, number> = {
      exact: 0,
      stripped: 0,
      fuzzy: 0,
      team_disambiguated: 0,
    };

    for (const player of rows.rows) {
      let outcome: MatchOutcome = { kind: "unmatched" };
      try {
        outcome = await resolveMlbamId(player);
      } catch {
        // Network / parse error: count as unmatched + mark attempted.
      }

      if (outcome.kind === "match") {
        await db.execute(sql`
          UPDATE public.player
          SET mlbam_id = ${outcome.mlbamId}::int,
              photo_synced_at = now()
          WHERE id = ${player.id}::uuid
        `);
        matched += 1;
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
      attempted: rows.rows.length,
      matched,
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

type MatchStrategy = "exact" | "stripped" | "fuzzy" | "team_disambiguated";
type MatchOutcome =
  | { kind: "match"; mlbamId: number; strategy: MatchStrategy }
  | { kind: "ambiguous" }
  | { kind: "unmatched" };

/**
 * Try progressively looser strategies until one match. See function
 * header for the order. `hydrate=currentTeam` populates `currentTeam`
 * on every candidate so team-based disambiguation uses MLB's source
 * of truth rather than our cached BDL team (stale after mid-season
 * trades).
 */
async function resolveMlbamId(player: {
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

  // 1) Exact literal match.
  const firstRaw = player.first_name.trim().toLowerCase();
  const lastRaw = player.last_name.trim().toLowerCase();
  const exact = people.filter(
    (p) =>
      (p.firstName ?? "").trim().toLowerCase() === firstRaw &&
      (p.lastName ?? "").trim().toLowerCase() === lastRaw,
  );
  const exactResolved = resolveCandidates(exact, player.team_abbr, "exact");
  if (exactResolved.kind !== "unmatched") return exactResolved;

  // 2) Stripped match (diacritics + suffix stripped).
  const firstNorm = normalizeName(player.first_name);
  const lastNorm = normalizeName(player.last_name);
  const stripped = people.filter(
    (p) =>
      normalizeName(p.firstName ?? "") === firstNorm &&
      normalizeName(p.lastName ?? "") === lastNorm,
  );
  const strippedResolved = resolveCandidates(stripped, player.team_abbr, "stripped");
  if (strippedResolved.kind !== "unmatched") return strippedResolved;

  // 3) Fuzzy match — sum of Levenshtein(first) + Levenshtein(last) ≤ 2.
  //    Accept only single-candidate matches to minimize false positives
  //    on short names.
  const fuzzy = people.filter((p) => {
    const fDist = levenshtein(normalizeName(p.firstName ?? ""), firstNorm);
    const lDist = levenshtein(normalizeName(p.lastName ?? ""), lastNorm);
    return fDist + lDist <= 2;
  });
  if (fuzzy.length === 1 && typeof fuzzy[0]?.id === "number") {
    return { kind: "match", mlbamId: fuzzy[0].id, strategy: "fuzzy" };
  }
  if (fuzzy.length > 1) {
    // Fuzzy found multiple; try team disambiguation.
    const teamResolved = resolveCandidates(fuzzy, player.team_abbr, "team_disambiguated");
    if (teamResolved.kind !== "unmatched") return teamResolved;
    return { kind: "ambiguous" };
  }

  return { kind: "unmatched" };
}

/**
 * Given a pre-filtered candidate list, return a clean match if one
 * survives, or `ambiguous`/`unmatched` otherwise. Handles the
 * single-candidate, team-disambiguation, and active-fallback paths.
 * `strategy` reports where the match came from — if it's the
 * single-candidate path, we inherit the caller's strategy; team
 * disambiguation always reports `team_disambiguated` regardless of
 * the caller.
 */
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
  // Multiple candidates — try team abbr.
  if (teamAbbr) {
    const byTeam = candidates.find(
      (p) => p.currentTeam?.abbreviation?.toLowerCase() === teamAbbr.toLowerCase(),
    );
    if (byTeam?.id) {
      return { kind: "match", mlbamId: byTeam.id, strategy: "team_disambiguated" };
    }
  }
  // Fallback: one active, rest inactive → take the active.
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
