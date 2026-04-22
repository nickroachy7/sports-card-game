"use server";

import { sql } from "drizzle-orm";

import type { CardViewModel } from "@/components/card/Card";
import type { CardTier, PlayerStatus } from "@/lib/contracts/cards";
import { getDb } from "@/lib/db/client";
import { createServerClient } from "@/lib/db/supabase";
import { mlbamHeadshotUrl } from "@/lib/mlb/mlbam-headshot";

export type PlayerValueTier = "star" | "starter" | "role" | "prospect";

/**
 * Revealed card carries CardViewModel + reveal-only metadata:
 *   - `playerValueTier`: drives the star-pull celebration variant.
 *   - `quickSellValue`: dollar value shown on the dupe panel CTAs.
 */
export type RevealedCard = CardViewModel & {
  playerValueTier: PlayerValueTier;
  quickSellValue: number;
};

/**
 * Return view-model rows for a set of just-opened cards so the pack
 * reveal modal can render them. Scoped to the caller's own cards.
 * When the reveal needs to display a dupe's existing-instance
 * counterpart, pass both the new card ids AND the existing ids in
 * one call — both come back as RevealedCard rows, paired up by the
 * caller from the pack's cardResults list.
 */
export async function fetchRevealedCards(cardIds: string[]): Promise<RevealedCard[]> {
  if (cardIds.length === 0) return [];
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  type Row = {
    id: string;
    current_tier: CardTier;
    career_fp_total: string | number;
    contract_plays_remaining: number;
    is_expired: boolean;
    applied_token_id: string | null;
    player_name: string;
    position: string | null;
    status: PlayerStatus;
    team_abbreviation: string | null;
    player_value_tier: PlayerValueTier | null;
    mlbam_id: number | null;
  };
  const db = getDb();
  const [res, cfgRes] = await Promise.all([
    db.execute<Row>(sql`
      SELECT c.id,
             c.current_tier,
             c.career_fp_total,
             c.contract_plays_remaining,
             c.is_expired,
             c.applied_token_id,
             p.full_name AS player_name,
             (p.positions)[1] AS position,
             p.status,
             p.designated_value_tier AS player_value_tier,
             p.mlbam_id,
             t.abbreviation AS team_abbreviation
      FROM public.card c
      JOIN public.player p ON p.id = c.player_id
      LEFT JOIN public.team t ON t.id = p.team_id
      WHERE c.user_id = ${user.id}::uuid
        AND c.id = ANY(${sql`ARRAY[${sql.join(
          cardIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}]::uuid[]`})
    `),
    supabase.rpc("get_active_economy_config").single(),
  ]);

  const cfg = (cfgRes.data ?? null) as {
    quick_sell_values?: Record<CardTier, number>;
  } | null;
  const qsValues = (cfg?.quick_sell_values ?? {}) as Record<CardTier, number>;

  // Preserve request order so the reveal sequence matches open_pack output.
  const byId = new Map<string, Row>();
  for (const row of res.rows) byId.set(row.id, row);
  return cardIds
    .map((id) => byId.get(id))
    .filter((r): r is Row => !!r)
    .map((r) => ({
      id: r.id,
      playerName: r.player_name,
      position: r.position,
      teamAbbreviation: r.team_abbreviation,
      tier: r.current_tier,
      careerFp: Number(r.career_fp_total ?? 0),
      contractPlays: r.contract_plays_remaining,
      contractMax: 15,
      playerStatus: r.status,
      isExpired: r.is_expired,
      hasAppliedToken: r.applied_token_id !== null,
      photoUrl: r.mlbam_id ? mlbamHeadshotUrl(r.mlbam_id, "large") : null,
      playerValueTier: (r.player_value_tier ?? "role") as PlayerValueTier,
      quickSellValue: qsValues[r.current_tier] ?? 0,
    }));
}
