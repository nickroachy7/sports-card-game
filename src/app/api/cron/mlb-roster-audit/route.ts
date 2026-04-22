import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
import { mlbStatsTeamId } from "@/lib/mlb/mlb-stats-team-ids";
import { normalizeName } from "@/lib/mlb/name-match";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * MLB roster audit — polish spec §39 (Phase 16).
 *
 * Phase 15's ADR-0020 identified that BDL's `is_active_40_man`
 * flag is stale for ~130 players. The `mlbam-id-backfill` matcher
 * is correct; the input data is wrong. This endpoint fixes the
 * input by reconciling our `public.player.is_active_40_man` and
 * `team_id` columns against MLB Stats API's actual 40-man rosters.
 *
 * Strategy:
 *   1. Fetch all 30 team rosters from
 *      /api/v1/teams/{id}/roster?rosterType=40Man&hydrate=person.
 *   2. Build two indexes:
 *      - `mlbamIdSet: Set<number>` — every mlbam_id appearing
 *        in any roster.
 *      - `rosterByName: Map<"firstNorm|lastNorm", { mlbamId,
 *        teamAbbr, teamDbId }[]>` — keyed lookup for name-fallback.
 *   3. For every row in public.player, compute:
 *      - `inByMlbamId` — we have an mlbam_id and it's in the set.
 *      - `inByName` — our normalized name key hits the roster map.
 *      - `inRoster = inByMlbamId || inByName`.
 *   4. Apply changes:
 *      - flag-off if `is_active_40_man=true` and `!inRoster`.
 *      - flag-on if `is_active_40_man=false` and `inRoster`.
 *      - team-refresh if roster match belongs to a different
 *        team than the player's current `team_id`.
 *   5. Count + log `missing_from_our_db` — MLBAM ids in the
 *      rosters that don't resolve to any of our rows. Next
 *      `bdl-roster-sync` run will pick them up.
 *
 * Query params:
 *   ?dry_run=true  Compute deltas but don't mutate. Response
 *                   shape same shape as a real run.
 *
 * Response:
 *   { teams_processed, flagged_off, flagged_on,
 *     team_refreshed, missing_from_our_db, unchanged,
 *     dry_run }
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";

    const db = getDb();

    // ── 1) Load our team lookup (abbreviation → team uuid). ──
    type TeamRow = { id: string; abbreviation: string };
    const teamsRes = await db.execute<TeamRow>(sql`
      SELECT id, abbreviation FROM public.team ORDER BY abbreviation ASC
    `);
    const teamByAbbr = new Map<string, string>();
    for (const t of teamsRes.rows) {
      teamByAbbr.set(t.abbreviation.toUpperCase(), t.id);
    }

    // ── 2) Fetch all 30 rosters + build indexes. ──
    const mlbamIdSet = new Set<number>();
    const rosterByName = new Map<
      string,
      Array<{ mlbamId: number; teamAbbr: string; teamDbId: string | null }>
    >();
    let teamsProcessed = 0;

    for (const team of teamsRes.rows) {
      const mlbId = mlbStatsTeamId(team.abbreviation);
      if (mlbId === null) continue;
      try {
        const roster = await fetchRoster40Man(mlbId);
        for (const r of roster) {
          mlbamIdSet.add(r.mlbamId);
          const key = `${normalizeName(r.firstName)}|${normalizeName(r.lastName)}`;
          const list = rosterByName.get(key) ?? [];
          list.push({
            mlbamId: r.mlbamId,
            teamAbbr: team.abbreviation,
            teamDbId: team.id,
          });
          rosterByName.set(key, list);
        }
        teamsProcessed += 1;
        await sleep(500);
      } catch {
        // Skip this team on error.
      }
    }

    if (teamsProcessed === 0) {
      return cronError(new Error("mlb-roster-audit: no team rosters fetched"));
    }

    // ── 3) Scan our player table and compute deltas. ──
    type PlayerRow = {
      id: string;
      mlbam_id: number | null;
      first_name: string;
      last_name: string;
      team_id: string | null;
      is_active_40_man: boolean;
    };
    const playersRes = await db.execute<PlayerRow>(sql`
      SELECT id, mlbam_id, first_name, last_name, team_id, is_active_40_man
      FROM public.player
    `);

    type Delta =
      | { kind: "flag_off"; id: string }
      | { kind: "flag_on"; id: string; teamDbId: string | null }
      | { kind: "team_refresh"; id: string; teamDbId: string };

    const deltas: Delta[] = [];
    let unchanged = 0;
    const matchedMlbamIds = new Set<number>();

    for (const p of playersRes.rows) {
      const inByMlbamId = p.mlbam_id !== null && mlbamIdSet.has(p.mlbam_id);
      const nameKey = `${normalizeName(p.first_name)}|${normalizeName(p.last_name)}`;
      const nameCandidates = rosterByName.get(nameKey) ?? [];

      // Pick a single candidate for name-based resolution. If we
      // have an mlbam_id and it matches one of the candidates,
      // prefer that (reliable). Otherwise if there's exactly one
      // candidate, take it. If multiple, prefer one whose team
      // matches our current team_id; failing that, skip the name
      // path (ambiguous).
      let nameMatch: { mlbamId: number; teamAbbr: string; teamDbId: string | null } | null = null;
      if (nameCandidates.length === 1) {
        nameMatch = nameCandidates[0] ?? null;
      } else if (nameCandidates.length > 1) {
        const byId = p.mlbam_id
          ? (nameCandidates.find((c) => c.mlbamId === p.mlbam_id) ?? null)
          : null;
        if (byId) nameMatch = byId;
        else {
          const byTeam = p.team_id
            ? (nameCandidates.find((c) => c.teamDbId === p.team_id) ?? null)
            : null;
          nameMatch = byTeam; // may be null → ambiguous, skip name path
        }
      }

      const inByName = nameMatch !== null;
      const inRoster = inByMlbamId || inByName;

      // Record matched ids to compute missing_from_our_db.
      if (p.mlbam_id !== null && inByMlbamId) matchedMlbamIds.add(p.mlbam_id);
      if (nameMatch) matchedMlbamIds.add(nameMatch.mlbamId);

      // --- compute delta ---
      if (p.is_active_40_man && !inRoster) {
        deltas.push({ kind: "flag_off", id: p.id });
        continue;
      }
      if (!p.is_active_40_man && inRoster) {
        deltas.push({
          kind: "flag_on",
          id: p.id,
          teamDbId: nameMatch?.teamDbId ?? p.team_id,
        });
        continue;
      }
      // In-roster AND flag already correct — check team refresh.
      if (inRoster && nameMatch && nameMatch.teamDbId && nameMatch.teamDbId !== p.team_id) {
        deltas.push({
          kind: "team_refresh",
          id: p.id,
          teamDbId: nameMatch.teamDbId,
        });
        continue;
      }
      unchanged += 1;
    }

    // ── 4) Apply deltas (unless dry run). ──
    let flaggedOff = 0;
    let flaggedOn = 0;
    let teamRefreshed = 0;

    if (!dryRun) {
      for (const d of deltas) {
        if (d.kind === "flag_off") {
          await db.execute(sql`
            UPDATE public.player
            SET is_active_40_man = false,
                updated_at = now()
            WHERE id = ${d.id}::uuid
          `);
          flaggedOff += 1;
        } else if (d.kind === "flag_on") {
          if (d.teamDbId) {
            await db.execute(sql`
              UPDATE public.player
              SET is_active_40_man = true,
                  team_id = ${d.teamDbId}::uuid,
                  updated_at = now()
              WHERE id = ${d.id}::uuid
            `);
          } else {
            await db.execute(sql`
              UPDATE public.player
              SET is_active_40_man = true,
                  updated_at = now()
              WHERE id = ${d.id}::uuid
            `);
          }
          flaggedOn += 1;
        } else {
          await db.execute(sql`
            UPDATE public.player
            SET team_id = ${d.teamDbId}::uuid,
                updated_at = now()
            WHERE id = ${d.id}::uuid
          `);
          teamRefreshed += 1;
        }
      }
    } else {
      // Dry run: tally what we would have done.
      for (const d of deltas) {
        if (d.kind === "flag_off") flaggedOff += 1;
        else if (d.kind === "flag_on") flaggedOn += 1;
        else teamRefreshed += 1;
      }
    }

    // ── 5) Count missing-from-our-db. ──
    let missingFromOurDb = 0;
    for (const id of mlbamIdSet) {
      if (!matchedMlbamIds.has(id)) missingFromOurDb += 1;
    }

    return cronOk({
      teams_processed: teamsProcessed,
      roster_player_count: mlbamIdSet.size,
      flagged_off: flaggedOff,
      flagged_on: flaggedOn,
      team_refreshed: teamRefreshed,
      missing_from_our_db: missingFromOurDb,
      unchanged,
      dry_run: dryRun,
    });
  } catch (err) {
    return cronError(err);
  }
}

type RosterEntry = {
  mlbamId: number;
  firstName: string;
  lastName: string;
};

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

async function fetchRoster40Man(teamId: number): Promise<RosterEntry[]> {
  const resp = await fetch(
    `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=40Man&hydrate=person`,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
