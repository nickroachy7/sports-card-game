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
 * up new players. Idempotent — only touches rows with `mlbam_id
 * IS NULL`, so re-runs only retry un-matched players.
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
    const rows = await db.execute<Row>(sql`
      SELECT p.id, p.first_name, p.last_name, p.full_name, t.abbreviation AS team_abbr
      FROM public.player p
      LEFT JOIN public.team t ON t.id = p.team_id
      WHERE p.mlbam_id IS NULL
        AND p.is_active_40_man = true
      ORDER BY p.last_name ASC, p.first_name ASC
      LIMIT ${limit}
    `);

    let matched = 0;
    let ambiguous = 0;
    let unmatched = 0;

    for (const player of rows.rows) {
      try {
        const mlbamId = await resolveMlbamId(player);
        if (mlbamId === null) {
          unmatched += 1;
          continue;
        }
        if (mlbamId === "ambiguous") {
          ambiguous += 1;
          continue;
        }
        await db.execute(sql`
          UPDATE public.player
          SET mlbam_id = ${mlbamId}::int,
              photo_synced_at = now()
          WHERE id = ${player.id}::uuid
        `);
        matched += 1;
      } catch {
        // Network / parse errors: skip + try next. Re-run the
        // endpoint to retry.
        unmatched += 1;
      }
      // Polite delay between calls — MLB Stats API is free +
      // generous, but no reason to hammer it.
      await sleep(200);
    }

    // How many active rows still need an id after this batch.
    const remainingRes = await db.execute<{ count: string | number }>(sql`
      SELECT count(*) AS count FROM public.player
      WHERE mlbam_id IS NULL AND is_active_40_man = true
    `);
    const remaining = Number(remainingRes.rows[0]?.count ?? 0);

    return cronOk({
      attempted: rows.rows.length,
      matched,
      ambiguous,
      unmatched,
      remaining,
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

  // Filter to exact first+last matches (case-insensitive, trimmed).
  const first = player.first_name.trim().toLowerCase();
  const last = player.last_name.trim().toLowerCase();
  const nameMatches = people.filter(
    (p) =>
      (p.firstName ?? "").trim().toLowerCase() === first &&
      (p.lastName ?? "").trim().toLowerCase() === last,
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
