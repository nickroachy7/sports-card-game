import type { MLBPlayer } from "@balldontlie/sdk";
import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
import { asPgArray } from "@/lib/db/sql-helpers";
import { getMLBProvider } from "@/lib/mlb/provider";
import { type RosterAuditResult, runRosterAudit } from "@/lib/mlb/roster-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Daily roster sync — API spec §5.1, BDL integration §7.
 *
 * Polish spec §41 (Phase 17): switched from BDL's
 * `getActivePlayers` stream (narrow — excludes 60-day IL +
 * recently-optioned players) to `getPlayers({ team_ids: [N] })`
 * iterated per team. The earlier narrower path left a ~653-player
 * gap vs. MLB's actual 40-man (surfaced by Phase 16's audit).
 *
 * Polish spec §42: after the BDL upsert pass, run the MLB
 * roster-audit (from `@/lib/mlb/roster-audit`) to reconcile our
 * `is_active_40_man` + `team_id` flags. Audit failure is logged +
 * surfaced in the response but doesn't fail the cron.
 *
 * Idempotent. Designed to run at 04:00 ET daily via Vercel Cron.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);
    const db = getDb();
    const provider = getMLBProvider();

    // ── 1) Team reference data upsert. ──────────────────────────
    const teams = await provider.fetchTeams();
    for (const team of teams) {
      await db.execute(sql`
        INSERT INTO public.team (
          bdl_team_id, slug, abbreviation, display_name, short_display_name,
          name, location, league, division
        ) VALUES (
          ${team.id}, ${team.slug}, ${team.abbreviation}, ${team.display_name},
          ${team.short_display_name}, ${team.name}, ${team.location},
          ${team.league}::team_league, ${team.division}::team_division
        )
        ON CONFLICT (bdl_team_id) DO UPDATE SET
          slug = EXCLUDED.slug,
          abbreviation = EXCLUDED.abbreviation,
          display_name = EXCLUDED.display_name,
          short_display_name = EXCLUDED.short_display_name,
          name = EXCLUDED.name,
          location = EXCLUDED.location,
          league = EXCLUDED.league,
          division = EXCLUDED.division,
          updated_at = now()
      `);
    }

    // ── 2) Per-team player pull via `getPlayers`. ───────────────
    let upserts = 0;
    let skipped = 0;
    let teamsProcessed = 0;
    let bdlPlayersSeen = 0;

    for (const team of teams) {
      try {
        for await (const p of provider.fetchPlayersByTeam(team.id)) {
          bdlPlayersSeen += 1;
          try {
            await upsertPlayer(p);
            upserts += 1;
          } catch (err) {
            skipped += 1;
            console.error(
              "[bdl-roster-sync] skipping player",
              { bdl_player_id: p.id, name: p.full_name },
              err,
            );
          }
        }
        teamsProcessed += 1;
        // Polite delay between team fetches.
        await sleep(200);
      } catch (err) {
        console.error(
          "[bdl-roster-sync] team fetch failed",
          { team_id: team.id, abbr: team.abbreviation },
          err,
        );
      }
    }

    // ── 3) Chain the MLB roster audit (polish spec §42). ────────
    // Audit failure doesn't tank the sync; log + surface in response.
    let audit: RosterAuditResult | { error: string };
    try {
      audit = await runRosterAudit(db, { dryRun: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[bdl-roster-sync] audit step failed", message);
      audit = { error: message };
    }

    return cronOk({
      teams: teams.length,
      teams_processed: teamsProcessed,
      bdl_players_seen: bdlPlayersSeen,
      players_upserted: upserts,
      players_skipped: skipped,
      audit,
    });
  } catch (err) {
    return cronError(err);
  }
}

/** BDL returns dob as "DD/MM/YYYY" strings. Coerce to ISO YYYY-MM-DD or null. */
function parseDob(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

/** Empty string → null. BDL returns "" for unknown string fields. */
function nullIfEmpty(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

async function upsertPlayer(p: MLBPlayer): Promise<void> {
  const db = getDb();
  const positions = p.position ? [p.position] : [];
  // BDL position strings include "Pitcher", "Starting Pitcher", "Relief Pitcher".
  const isPitcher = /pitcher/i.test(p.position ?? "");
  const teamBdlId = p.team?.id ?? null;
  const positionsSql = asPgArray(positions, "text");

  await db.execute(sql`
    INSERT INTO public.player (
      bdl_player_id, first_name, last_name, full_name, jersey,
      positions, is_pitcher, bats_throws, debut_year, dob,
      birth_place, height, weight, college, draft,
      team_id, status, is_active_40_man
    ) VALUES (
      ${p.id}, ${p.first_name}, ${p.last_name}, ${p.full_name},
      ${nullIfEmpty(p.jersey)},
      ${positionsSql},
      ${isPitcher}, ${nullIfEmpty(p.bats_throws)}, ${intOrNull(p.debut_year)},
      ${parseDob(p.dob)},
      ${nullIfEmpty(p.birth_place)}, ${nullIfEmpty(p.height)}, ${nullIfEmpty(p.weight)},
      ${nullIfEmpty(p.college)}, ${nullIfEmpty(p.draft)},
      ${teamBdlId ? sql`(SELECT id FROM public.team WHERE bdl_team_id = ${teamBdlId})` : sql`NULL`},
      'active'::player_status, ${p.active ?? true}
    )
    ON CONFLICT (bdl_player_id) DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      full_name = EXCLUDED.full_name,
      jersey = EXCLUDED.jersey,
      positions = EXCLUDED.positions,
      is_pitcher = EXCLUDED.is_pitcher,
      bats_throws = EXCLUDED.bats_throws,
      debut_year = EXCLUDED.debut_year,
      dob = EXCLUDED.dob,
      birth_place = EXCLUDED.birth_place,
      height = EXCLUDED.height,
      weight = EXCLUDED.weight,
      college = EXCLUDED.college,
      draft = EXCLUDED.draft,
      team_id = EXCLUDED.team_id,
      is_active_40_man = EXCLUDED.is_active_40_man,
      updated_at = now()
  `);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
