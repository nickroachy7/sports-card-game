"use server";

import { sql } from "drizzle-orm";

import type { CardViewModel } from "@/components/card/Card";
import type { CardTier, PlayerStatus } from "@/lib/contracts/cards";
import { getDb } from "@/lib/db/client";
import { createServerClient } from "@/lib/db/supabase";

/**
 * Return view-model rows for a set of just-opened cards so the pack
 * reveal modal can render them. Scoped to the caller's own cards.
 */
export async function fetchRevealedCards(cardIds: string[]): Promise<CardViewModel[]> {
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
  };
  const db = getDb();
  const res = await db.execute<Row>(sql`
    SELECT c.id,
           c.current_tier,
           c.career_fp_total,
           c.contract_plays_remaining,
           c.is_expired,
           c.applied_token_id,
           p.full_name AS player_name,
           (p.positions)[1] AS position,
           p.status,
           t.abbreviation AS team_abbreviation
    FROM public.card c
    JOIN public.player p ON p.id = c.player_id
    LEFT JOIN public.team t ON t.id = p.team_id
    WHERE c.user_id = ${user.id}::uuid
      AND c.id = ANY(${sql`ARRAY[${sql.join(
        cardIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]::uuid[]`})
  `);

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
      photoUrl: null,
    }));
}
