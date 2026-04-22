import { sql } from "drizzle-orm";

import type { getDb } from "@/lib/db/client";
import { mlbStatsTeamId } from "@/lib/mlb/mlb-stats-team-ids";
import { normalizeName } from "@/lib/mlb/name-match";

/**
 * MLB roster audit core — polish spec §39 / §42.
 *
 * Shared between `/api/cron/mlb-roster-audit` (manual trigger) and
 * `/api/cron/bdl-roster-sync` (daily cron). Reconciles our
 * `public.player.is_active_40_man` + `team_id` columns against MLB
 * Stats API's actual 40-man rosters.
 *
 * Returns counts; doesn't mutate when `dryRun` is true.
 */

export type RosterAuditResult = {
  teams_processed: number;
  roster_player_count: number;
  flagged_off: number;
  flagged_on: number;
  team_refreshed: number;
  missing_from_our_db: number;
  unchanged: number;
  dry_run: boolean;
};

type Db = ReturnType<typeof getDb>;

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

export async function runRosterAudit(
  db: Db,
  opts: { dryRun: boolean },
): Promise<RosterAuditResult> {
  const { dryRun } = opts;

  // ── 1) Load our team lookup. ──
  type TeamRow = { id: string; abbreviation: string };
  const teamsRes = await db.execute<TeamRow>(sql`
    SELECT id, abbreviation FROM public.team ORDER BY abbreviation ASC
  `);

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
    throw new Error("roster-audit: no team rosters fetched");
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

    let nameMatch: { mlbamId: number; teamAbbr: string; teamDbId: string | null } | null = null;
    if (nameCandidates.length === 1) {
      nameMatch = nameCandidates[0] ?? null;
    } else if (nameCandidates.length > 1) {
      const byId = p.mlbam_id
        ? (nameCandidates.find((c) => c.mlbamId === p.mlbam_id) ?? null)
        : null;
      if (byId) {
        nameMatch = byId;
      } else {
        const byTeam = p.team_id
          ? (nameCandidates.find((c) => c.teamDbId === p.team_id) ?? null)
          : null;
        nameMatch = byTeam;
      }
    }

    const inByName = nameMatch !== null;
    const inRoster = inByMlbamId || inByName;

    if (p.mlbam_id !== null && inByMlbamId) matchedMlbamIds.add(p.mlbam_id);
    if (nameMatch) matchedMlbamIds.add(nameMatch.mlbamId);

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

  return {
    teams_processed: teamsProcessed,
    roster_player_count: mlbamIdSet.size,
    flagged_off: flaggedOff,
    flagged_on: flaggedOn,
    team_refreshed: teamRefreshed,
    missing_from_our_db: missingFromOurDb,
    unchanged,
    dry_run: dryRun,
  };
}

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
