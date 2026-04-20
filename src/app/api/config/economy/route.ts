import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";
export const revalidate = 300;

/**
 * API spec §4.1 — public economy config.
 *
 * Returns the active economy_config trimmed to client-relevant fields.
 * Cache 5 minutes at the edge with 60s stale-while-revalidate.
 */
export async function GET(): Promise<Response> {
  try {
    const res = await getDb().execute<{
      collection_cap: number | string;
      contract_default_plays: number | string;
      tier_fp_thresholds: Record<string, number>;
      quick_sell_values: Record<string, number>;
      extension_cost_per_play: Record<string, number>;
      extension_escalator: number | string;
      pack_prices_coins: Record<string, number>;
      pack_sizes: Record<string, number>;
      token_bonus_fp: Record<string, number>;
      milestone_tiers: Record<string, number[]>;
    }>(sql`
      SELECT collection_cap, contract_default_plays,
             tier_fp_thresholds, quick_sell_values,
             extension_cost_per_play, extension_escalator,
             pack_prices_coins, pack_sizes, token_bonus_fp,
             milestone_tiers
      FROM public.get_active_economy_config()
    `);

    const row = res.rows[0];
    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "No active economy config." } },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        data: {
          collectionCap: Number(row.collection_cap),
          contractDefaultPlays: Number(row.contract_default_plays),
          tierFpThresholds: row.tier_fp_thresholds,
          quickSellValues: row.quick_sell_values,
          extensionCostPerPlay: row.extension_cost_per_play,
          extensionEscalator: Number(row.extension_escalator),
          packPricesCoins: row.pack_prices_coins,
          packSizes: row.pack_sizes,
          tokenBonusFp: row.token_bonus_fp,
          milestoneTiers: row.milestone_tiers,
        },
      },
      {
        headers: {
          "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: { code: "INTERNAL", message: msg } }, { status: 500 });
  }
}
