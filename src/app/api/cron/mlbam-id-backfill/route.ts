import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * MLBAM id backfill — polish spec §26.
 *
 * BDL doesn't expose MLBAM ids. This endpoint iterates active 40-man
 * `player` rows with `mlbam_id IS NULL`, queries MLB Stats API's
 * public search endpoint for each name, and writes the matched id
 * back to `public.player.mlbam_id`. Card rendering derives the photo
 * URL from `mlbam_id` via `mlbamHeadshotUrl()` — no separate CDN
 * fetch needed at display time.
 *
 * Manual trigger only (no schedule). Re-run after roster syncs pick
 * up new players. Idempotent — marks every attempted row with
 * `photo_synced_at = now()` (even on miss) so re-runs only touch
 * genuinely-unseen players. To retry previously-failed rows, run
 * `UPDATE public.player SET photo_synced_at = NULL WHERE mlbam_id
 * IS NULL;` first.
 *
 * Query params:
 *   ?limit=N              Cap on how many players to attempt this run.
 *                          Default 50, max 500. Keeps each invocation
 *                          under the Vercel serverless timeout while
 *                          letting you resume where it left off via
 *                          re-runs.
 *
 * Response:
 *   { matched: N, ambiguous: N, unmatched: N, remaining: N }
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);

    const url = new URL(req.url);
    const rawLimit = url.searchParams.get("limit");
    const limit = Math.min(Math.max(Number.parseInt(rawLimit ?? "50", 10) || 50, 1), 500);

    const db = getDb();

    type Row = {
      id: string;
      first_name: string;
      last_name: string;
      full_name: string;
      team_abbr: string | null;
    };
    // Skip rows we've already attempted (photo_synced_at IS NOT NULL)
    // so re-runs chew through un-tried players first. Set the
    // timestamp on both hit and miss below — treats it as "lookup
    // attempted" rather than strictly "photo synced".
    const rows = await db.execute<Row>(sql`
      SELECT p.id, p.first_name, p.last_name, p.full_name, t.abbreviation AS team_abbr
      FROM public.player p
      LEFT JOIN public.team t ON t.id = p.team_id
      WHERE p.mlbam_id IS NULL
        AND p.photo_synced_at IS NULL
        AND p.is_active_40_man = true
      ORDER BY p.last_name ASC, p.first_name ASC
      LIMIT ${limit}
    `);

    let matched = 0;
    let ambiguous = 0;
    let unmatched = 0;

    for (const player of rows.rows) {
      let result: number | "ambiguous" | null = null;
      try {
        result = await resolveMlbamId(player);
      } catch {
        // Network / parse error: mark attempted so we skip next
        // run; subsequent runs can retry by resetting photo_synced_at.
      }

      if (typeof result === "number") {
        await db.execute(sql`
          UPDATE public.player
          SET mlbam_id = ${result}::int,
              photo_synced_at = now()
          WHERE id = ${player.id}::uuid
        `);
        matched += 1;
      } else {
        // Unmatched or ambiguous — mark attempted so re-runs skip.
        await db.execute(sql`
          UPDATE public.player
          SET photo_synced_at = now()
          WHERE id = ${player.id}::uuid
        `);
        if (result === "ambiguous") ambiguous += 1;
        else unmatched += 1;
      }

      // Polite delay between calls — MLB Stats API is free +
      // generous, but no reason to hammer it.
      await sleep(200);
    }

    // How many active rows still need an attempt (genuinely unseen).
    // Separate count for total-without-mlbam so we can see the gap
    // between "tried but failed" and "not yet touched."
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
    });
  } catch (err) {
    return cronError(err);
  }
}

type MlbStatsSearchResponse = {
  people?: Array<{
    id?: number;
    firstName?: string;
    lastName?: string;
    currentTeam?: { abbreviation?: string };
    active?: boolean;
  }>;
};

/**
 * Search MLB Stats API by full name; disambiguate by first+last exact
 * match + team abbreviation when provided. Returns:
 *   - the mlbam id on clean match
 *   - 'ambiguous' when multiple candidates match the name but team
 *     can't disambiguate
 *   - null when no candidates match
 */
async function resolveMlbamId(player: {
  first_name: string;
  last_name: string;
  full_name: string;
  team_abbr: string | null;
}): Promise<number | "ambiguous" | null> {
  const q = encodeURIComponent(player.full_name);
  const resp = await fetch(`https://statsapi.mlb.com/api/v1/people/search?names=${q}`, {
    // Static export + serverless; no revalidation.
    cache: "no-store",
  });
  if (!resp.ok) return null;
  const json = (await resp.json()) as MlbStatsSearchResponse;
  const people = json.people ?? [];
  if (people.length === 0) return null;

  // Normalize both sides before comparing. BDL strips accents while
  // MLB Stats keeps them ("Acuna" vs "Acuña"). BDL also includes
  // suffixes in last_name ("Acuna Jr.") while MLB Stats splits them
  // out ("Acuña"). Normalize to strip diacritics + suffixes + lower.
  const first = normalize(player.first_name);
  const last = normalize(player.last_name);
  const nameMatches = people.filter(
    (p) => normalize(p.firstName ?? "") === first && normalize(p.lastName ?? "") === last,
  );

  if (nameMatches.length === 0) return null;
  if (nameMatches.length === 1) {
    return nameMatches[0]?.id ?? null;
  }

  // Multiple people share the name — disambiguate by team.
  if (player.team_abbr) {
    const teamMatch = nameMatches.find(
      (p) => p.currentTeam?.abbreviation?.toLowerCase() === player.team_abbr?.toLowerCase(),
    );
    if (teamMatch?.id) return teamMatch.id;
  }

  // Fallback: pick the active one (if exactly one).
  const active = nameMatches.filter((p) => p.active === true);
  if (active.length === 1 && active[0]?.id) return active[0].id;

  return "ambiguous";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Strip accents + trailing suffixes (Jr./Sr./II/III/IV/V) + lower-
 * case. BDL/our DB and MLB Stats API disagree on both conventions;
 * normalize before comparing first/last names.
 */
function normalize(s: string): string {
  // NFD decomposes "ñ" into "n" + combining tilde; strip the combining
  // marks (Unicode category Mn) to collapse back to ASCII.
  const withoutAccents = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Strip common suffixes from the tail.
  const withoutSuffix = withoutAccents.replace(/\s+(jr\.?|sr\.?|ii+|iv|v)$/i, "");
  return withoutSuffix.trim().toLowerCase();
}
