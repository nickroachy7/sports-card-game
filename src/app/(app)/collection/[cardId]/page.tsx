import { notFound, redirect } from "next/navigation";

import { type CardDetailData, CardDetailView } from "@/components/card/CardDetailView";
import type { CardTier, PlayerStatus } from "@/lib/contracts/cards";
import { createServerClient } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

export default async function CardDetailPage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  // Load card + joined player info.
  const { data: cardRow, error } = await supabase
    .from("card")
    .select(
      `id, career_fp_total, current_tier, contract_plays_remaining, extension_count,
       is_expired, applied_token_id, tokens_applied_count, tokens_triggered_count,
       acquired_at,
       player:player_id ( full_name, positions, status, team:team_id ( abbreviation ) )`,
    )
    .eq("id", cardId)
    .eq("user_id", user.id)
    .eq("is_vaulted", false)
    .maybeSingle();

  // Missing card → silently route back to the collection. Covers the
  // mid-quick-sell race where revalidatePath refreshes this segment
  // after the card row is already deleted (P6.3 dissolve flow keeps
  // the user on the detail page for ~600ms before router.push fires).
  if (error || !cardRow) redirect("/collection");

  // Economy config for extension cost + quick-sell values + tier thresholds.
  type EconCfg = {
    quick_sell_values: Record<CardTier, number>;
    extension_cost_per_play: Record<CardTier, number>;
    tier_fp_thresholds: Record<CardTier, number>;
    extension_escalator: number | string;
    collection_cap: number | string;
  };
  const cfgRes = await supabase.rpc("get_active_economy_config").single();
  const cfg = (cfgRes.data ?? null) as EconCfg | null;
  const { data: state } = await supabase
    .from("user_season_state")
    .select("coins")
    .eq("user_id", user.id)
    .maybeSingle();

  const player = Array.isArray(cardRow.player) ? cardRow.player[0] : cardRow.player;
  const team = player ? (Array.isArray(player.team) ? player.team[0] : player.team) : null;
  const tier = cardRow.current_tier as CardTier;
  const quickSellValues = (cfg?.quick_sell_values ?? {}) as Record<CardTier, number>;
  const extensionCostPerPlay = (cfg?.extension_cost_per_play ?? {}) as Record<CardTier, number>;
  const tierFpThresholds = (cfg?.tier_fp_thresholds ?? {}) as Record<CardTier, number>;
  const position =
    player?.positions && Array.isArray(player.positions) ? (player.positions[0] ?? null) : null;

  const data: CardDetailData = {
    card: {
      id: cardRow.id,
      playerName: player?.full_name ?? "Unknown",
      position,
      teamAbbreviation: team?.abbreviation ?? null,
      tier,
      careerFp: Number(cardRow.career_fp_total ?? 0),
      contractPlays: cardRow.contract_plays_remaining,
      contractMax: 15,
      playerStatus: (player?.status ?? "active") as PlayerStatus,
      isExpired: cardRow.is_expired,
      hasAppliedToken: cardRow.applied_token_id !== null,
      photoUrl: null,
      quickSellValue: quickSellValues[tier] ?? 0,
      extensionCount: cardRow.extension_count,
      tokensApplied: cardRow.tokens_applied_count,
      tokensTriggered: cardRow.tokens_triggered_count,
      acquiredAt: cardRow.acquired_at,
      tierFpThresholds,
    },
    coinBalance: Number(state?.coins ?? 0),
    extensionCostPerPlay,
    extensionEscalator: Number(cfg?.extension_escalator ?? 1.5),
  };

  return <CardDetailView data={data} />;
}
