import { sql } from "drizzle-orm";

import type { CardTier } from "@/lib/contracts/cards";
import { getDb } from "@/lib/db/client";

export type PublicProfile = {
  teamName: string;
  teamColorPrimary: string;
  teamColorSecondary: string;
  teamLogoId: string;
  managerLevel: number;
  managerXp: number;
  lifetimeFp: number;
  lifetimeContestsWon: number;
  lifetimeDiamondCardsVaulted: number;
  lifetimeTokensTriggered: number;
  seasonsPlayed: number;
  currentSeason: {
    year: number;
    seasonFp: number;
    seasonContestsWon: number;
  } | null;
  vault: {
    total: number;
    diamondCount: number;
  };
};

export type PublicVaultSeason = {
  seasonId: string;
  year: number;
  cards: Array<{
    id: string;
    playerName: string;
    positions: string[] | null;
    finalTier: CardTier;
    finalFp: number;
    tokensAppliedCount: number;
    tokensTriggeredCount: number;
    createdAt: string;
  }>;
};

type ProfileRow = {
  user_id: string;
  team_name: string;
  team_color_primary: string;
  team_color_secondary: string;
  team_logo_id: string;
  is_public: boolean;
  manager_level: number | string | null;
  manager_xp: number | string | null;
  lifetime_fp: number | string | null;
  lifetime_contests_won: number | null;
  lifetime_diamond_cards_vaulted: number | null;
  lifetime_tokens_triggered: number | null;
  seasons_played: number | null;
};

export async function getPublicProfileByTeamName(teamName: string): Promise<PublicProfile | null> {
  const res = await getDb().execute<ProfileRow>(sql`
    SELECT p.user_id, p.team_name, p.team_color_primary, p.team_color_secondary,
           p.team_logo_id, p.is_public,
           ma.manager_level, ma.manager_xp, ma.lifetime_fp,
           ma.lifetime_contests_won, ma.lifetime_diamond_cards_vaulted,
           ma.lifetime_tokens_triggered, ma.seasons_played
    FROM public.profile p
    LEFT JOIN public.manager_account ma ON ma.user_id = p.user_id
    WHERE p.team_name = ${teamName}
      AND p.is_public = true
    LIMIT 1
  `);
  const row = res.rows[0];
  if (!row) return null;

  const currentSeasonRes = await getDb().execute<{
    year: number;
    season_fp: number | string;
    season_contests_won: number;
  }>(sql`
    SELECT s.year, uss.season_fp, uss.season_contests_won
    FROM public.user_season_state uss
    JOIN public.season s ON s.id = uss.season_id
    WHERE uss.user_id = ${row.user_id}::uuid
      AND s.status IN ('active', 'offseason')
    ORDER BY s.year DESC
    LIMIT 1
  `);
  const cs = currentSeasonRes.rows[0] ?? null;

  const vaultRes = await getDb().execute<{ total: number | string; diamonds: number | string }>(sql`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE final_tier = 'diamond') AS diamonds
    FROM public.vault_entry
    WHERE user_id = ${row.user_id}::uuid
  `);
  const vaultRow = vaultRes.rows[0];

  return {
    teamName: row.team_name,
    teamColorPrimary: row.team_color_primary,
    teamColorSecondary: row.team_color_secondary,
    teamLogoId: row.team_logo_id,
    managerLevel: Number(row.manager_level ?? 1),
    managerXp: Number(row.manager_xp ?? 0),
    lifetimeFp: Number(row.lifetime_fp ?? 0),
    lifetimeContestsWon: Number(row.lifetime_contests_won ?? 0),
    lifetimeDiamondCardsVaulted: Number(row.lifetime_diamond_cards_vaulted ?? 0),
    lifetimeTokensTriggered: Number(row.lifetime_tokens_triggered ?? 0),
    seasonsPlayed: Number(row.seasons_played ?? 0),
    currentSeason: cs
      ? {
          year: Number(cs.year),
          seasonFp: Number(cs.season_fp),
          seasonContestsWon: Number(cs.season_contests_won),
        }
      : null,
    vault: {
      total: Number(vaultRow?.total ?? 0),
      diamondCount: Number(vaultRow?.diamonds ?? 0),
    },
  };
}

export async function getPublicVaultByTeamName(
  teamName: string,
): Promise<PublicVaultSeason[] | null> {
  const ownerRes = await getDb().execute<{ user_id: string }>(sql`
    SELECT user_id FROM public.profile
    WHERE team_name = ${teamName} AND is_public = true
    LIMIT 1
  `);
  const owner = ownerRes.rows[0];
  if (!owner) return null;

  const rowsRes = await getDb().execute<{
    vault_id: string;
    season_id: string;
    year: number;
    player_name: string;
    positions: string[] | null;
    final_tier: CardTier;
    final_fp: number | string;
    tokens_applied_count: number;
    tokens_triggered_count: number;
    created_at: string;
  }>(sql`
    SELECT ve.id AS vault_id, ve.season_id, s.year,
           p.full_name AS player_name, p.positions,
           ve.final_tier, ve.final_fp,
           ve.tokens_applied_count, ve.tokens_triggered_count, ve.created_at
    FROM public.vault_entry ve
    JOIN public.season s ON s.id = ve.season_id
    JOIN public.player p ON p.id = ve.player_id
    WHERE ve.user_id = ${owner.user_id}::uuid
    ORDER BY s.year DESC, ve.created_at DESC
  `);

  const groups = new Map<string, PublicVaultSeason>();
  for (const r of rowsRes.rows) {
    let group = groups.get(r.season_id);
    if (!group) {
      group = { seasonId: r.season_id, year: Number(r.year), cards: [] };
      groups.set(r.season_id, group);
    }
    group.cards.push({
      id: r.vault_id,
      playerName: r.player_name,
      positions: r.positions,
      finalTier: r.final_tier,
      finalFp: Number(r.final_fp),
      tokensAppliedCount: Number(r.tokens_applied_count),
      tokensTriggeredCount: Number(r.tokens_triggered_count),
      createdAt: r.created_at,
    });
  }
  return [...groups.values()].sort((a, b) => b.year - a.year);
}
