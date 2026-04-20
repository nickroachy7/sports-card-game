import type { MLBPlayer } from "@balldontlie/sdk";
import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
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

async function upsertPlayer(p: MLBPlayer): Promise<void> {
  const db = getDb();
  const positions = p.position ? [p.position] : [];
  const isPitcher = /^P|SP|RP$/i.test(p.position ?? "");
  const teamBdlId = p.team?.id ?? null;

  await db.execute(sql`
    INSERT INTO public.player (
      bdl_player_id, first_name, last_name, full_name, jersey,
      positions, is_pitcher, bats_throws, debut_year, dob,
      birth_place, height, weight, college, draft,
      team_id, status, is_active_40_man
    ) VALUES (
      ${p.id}, ${p.first_name}, ${p.last_name}, ${p.full_name},
      ${p.jersey ?? null},
      ${positions}::text[],
      ${isPitcher}, ${p.bats_throws ?? null}, ${p.debut_year ?? null},
      ${p.dob ? p.dob.slice(0, 10) : null},
      ${p.birth_place ?? null}, ${p.height ?? null}, ${p.weight ?? null},
      ${p.college ?? null}, ${p.draft ?? null},
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
