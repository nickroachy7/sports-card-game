import { redirect } from "next/navigation";

import { type CollectionCard, CollectionGrid } from "@/app/(app)/collection/collection-grid";
import type { CardTier, PlayerStatus } from "@/lib/contracts/cards";
import { createServerClient } from "@/lib/db/supabase";
import { captureServerEvent } from "@/lib/observability/action";

export const dynamic = "force-dynamic";

type RawRow = {
  id: string;
  career_fp_total: string | number;
  current_tier: CardTier;
  contract_plays_remaining: number;
  is_expired: boolean;
  applied_token_id: string | null;
  acquired_at: string;
  player:
    | {
        full_name: string;
        positions: string[] | null;
        status: PlayerStatus;
        team: { abbreviation: string } | { abbreviation: string }[] | null;
      }
    | { full_name: string; positions: string[] | null; status: PlayerStatus; team: unknown }[]
    | null;
};

export default async function CollectionPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: cardRows }, cfgRes] = await Promise.all([
    supabase
      .from("card")
      .select(
        `id, career_fp_total, current_tier, contract_plays_remaining, is_expired,
         applied_token_id, acquired_at,
         player:player_id ( full_name, positions, status, team:team_id ( abbreviation ) )`,
      )
      .eq("user_id", user.id)
      .eq("is_vaulted", false)
      .order("current_tier", { ascending: false })
      .order("career_fp_total", { ascending: false })
      .returns<RawRow[]>(),
    supabase.rpc("get_active_economy_config").single(),
  ]);
  const cfg = cfgRes.data as { collection_cap?: number | string } | null;

  const cards: CollectionCard[] = (cardRows ?? []).map((row) => {
    const player = Array.isArray(row.player) ? row.player[0] : row.player;
    const team = player
      ? Array.isArray(player.team)
        ? player.team[0]
        : (player.team as { abbreviation: string } | null)
      : null;
    const positions = player?.positions ?? [];
    return {
      id: row.id,
      playerName: player?.full_name ?? "Unknown",
      position: positions[0] ?? null,
      positions,
      teamAbbreviation: team?.abbreviation ?? null,
      tier: row.current_tier,
      careerFp: Number(row.career_fp_total ?? 0),
      contractPlays: row.contract_plays_remaining,
      contractMax: 15,
      playerStatus: player?.status ?? "active",
      isExpired: row.is_expired,
      hasAppliedToken: row.applied_token_id !== null,
      photoUrl: null,
      acquiredAt: row.acquired_at,
    };
  });

  const collectionCap = Number(cfg?.collection_cap ?? 100);

  // Fire & forget — server-side page view. PostHog also auto-captures a
  // client $pageview from the provider, but this gives us a server-side
  // "collection_viewed" with card-count properties for funnel analysis.
  await captureServerEvent(user.id, "collection_viewed", {
    card_count: cards.length,
    collection_cap: collectionCap,
  });

  return <CollectionGrid cards={cards} collectionCap={collectionCap} />;
}
