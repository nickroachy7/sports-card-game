import { redirect } from "next/navigation";

import { type PackConfig, ShopClient } from "@/app/(app)/shop/shop-client";
import type { PackType } from "@/lib/contracts/cards";
import { createServerClient } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

const PACK_META: Record<PackType, { label: string; description: string }> = {
  daily: {
    label: "Daily Pack",
    description: "Free once per day. Smaller pack, weighted toward bench / role players.",
  },
  standard: {
    label: "Standard Pack",
    description: "Balanced draws across the MLB player pool.",
  },
  premium: {
    label: "Premium Pack",
    description: "Larger pack, weighted toward star players.",
  },
};

type EconCfg = {
  pack_prices_coins: Record<PackType, number>;
  pack_sizes: Record<PackType, number>;
};

export default async function ShopPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [cfgRes, { data: state }] = await Promise.all([
    supabase.rpc("get_active_economy_config").single(),
    supabase
      .from("user_season_state")
      .select("coins, daily_pack_claimed_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const cfg = (cfgRes.data ?? null) as EconCfg | null;
  const coins = Number(state?.coins ?? 0);
  const claimedAt = state?.daily_pack_claimed_at ? new Date(state.daily_pack_claimed_at) : null;
  const dailyReadyAt = claimedAt ? claimedAt.getTime() + 24 * 60 * 60 * 1000 : null; // null = never claimed → always ready

  const packs: PackConfig[] = (["daily", "standard", "premium"] as PackType[]).map((type) => ({
    type,
    label: PACK_META[type].label,
    description: PACK_META[type].description,
    cost: Number(cfg?.pack_prices_coins?.[type] ?? 0),
    size: Number(cfg?.pack_sizes?.[type] ?? 0),
  }));

  return <ShopClient coinBalance={coins} dailyReadyAtMs={dailyReadyAt} packs={packs} />;
}
