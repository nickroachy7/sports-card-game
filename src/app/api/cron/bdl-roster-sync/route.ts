import type { MLBPlayer } from "@balldontlie/sdk";
import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
import { asPgArray } from "@/lib/db/sql-helpers";
import { getMLBProvider } from "@/lib/mlb/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Daily roster sync — API spec §5.1, BDL integration §7.
 *
 * Pulls every active MLB player from BDL and upserts into `player`.
 * Also ensures `team` reference data exists before player upserts land
 * (since player.team_id FKs to team.id).
 *
 * Idempotent. Designed to run at 04:00 ET daily via Vercel Cron.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);
    const db = getDb();
    const provider = getMLBProvider();

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

    let upserts = 0;
    let skipped = 0;
    for await (const p of provider.fetchActivePlayers()) {
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

    return cronOk({ teams: teams.length, players_upserted: upserts, players_skipped: skipped });
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
