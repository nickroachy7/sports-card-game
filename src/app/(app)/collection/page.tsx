import { redirect } from "next/navigation";

import { type CollectionCard, CollectionGrid } from "@/app/(app)/collection/collection-grid";
import type { CardTier, PlayerStatus, TokenType } from "@/lib/contracts/cards";
import { createServerClient } from "@/lib/db/supabase";
import { mlbamHeadshotUrl } from "@/lib/mlb/mlbam-headshot";
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
        mlbam_id: number | null;
        team: { abbreviation: string } | { abbreviation: string }[] | null;
      }
    | {
        full_name: string;
        positions: string[] | null;
        status: PlayerStatus;
        mlbam_id: number | null;
        team: unknown;
      }[]
    | null;
};

type AppliedTokenRow = {
  id: string;
  token_type: TokenType;
  bonus_fp: string | number;
  applied_to_card_id: string | null;
};

type AppliedRow = {
  id: string;
  token_id: string;
  card_id: string;
};

export default async function CollectionPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: cardRows }, cfgRes, { data: tokenRows }, { data: applicationRows }] =
    await Promise.all([
      supabase
        .from("card")
        .select(
          `id, career_fp_total, current_tier, contract_plays_remaining, is_expired,
         applied_token_id, acquired_at,
         player:player_id ( full_name, positions, status, mlbam_id, team:team_id ( abbreviation ) )`,
        )
        .eq("user_id", user.id)
        .eq("is_vaulted", false)
        .order("current_tier", { ascending: false })
        .order("career_fp_total", { ascending: false })
        .returns<RawRow[]>(),
      supabase.rpc("get_active_economy_config").single(),
      supabase
        .from("token")
        .select("id, token_type, bonus_fp, applied_to_card_id")
        .eq("user_id", user.id)
        .is("consumed_at", null)
        .not("applied_to_card_id", "is", null)
        .returns<AppliedTokenRow[]>(),
      supabase
        .from("token_application")
        .select("id, token_id, card_id")
        .eq("user_id", user.id)
        .returns<AppliedRow[]>(),
    ]);
  const cfg = cfgRes.data as { collection_cap?: number | string } | null;

  // Build a map: cardId -> applied token meta (type, bonus, applicationId).
  // token_application is owner-scoped; card_id is set to the most recent
  // applied card. We also match against token.applied_to_card_id for
  // currency (the field is kept in sync by apply_token / remove_token).
  const applicationsByCard = new Map<string, { id: string; tokenId: string }>();
  for (const a of applicationRows ?? []) {
    applicationsByCard.set(a.card_id, { id: a.id, tokenId: a.token_id });
  }
  const tokensById = new Map<string, AppliedTokenRow>();
  for (const t of tokenRows ?? []) tokensById.set(t.id, t);

  const cards: CollectionCard[] = (cardRows ?? []).map((row) => {
    const player = Array.isArray(row.player) ? row.player[0] : row.player;
    const team = player
      ? Array.isArray(player.team)
        ? player.team[0]
        : (player.team as { abbreviation: string } | null)
      : null;
    const positions = player?.positions ?? [];

    let appliedToken: CollectionCard["appliedToken"];
    if (row.applied_token_id) {
      const tok = tokensById.get(row.applied_token_id);
      const app = applicationsByCard.get(row.id);
      if (tok && app) {
        appliedToken = {
          tokenType: tok.token_type,
          bonusFp: Number(tok.bonus_fp ?? 0),
          applicationId: app.id,
        };
      }
    }

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
      appliedToken,
      photoUrl: player?.mlbam_id ? mlbamHeadshotUrl(player.mlbam_id, "medium") : null,
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
