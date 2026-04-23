"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { CardDetailData } from "@/components/card/CardDetailView";
import {
  type CardTier,
  type ExtendContractInput,
  extendContractInputSchema,
  type PlayerStatus,
  type QuickSellInput,
  quickSellInputSchema,
} from "@/lib/contracts/cards";
import { getDb } from "@/lib/db/client";
import { createServerClient } from "@/lib/db/supabase";
import { mlbamHeadshotUrl } from "@/lib/mlb/mlbam-headshot";
import { captureServerEvent, wrapAction } from "@/lib/observability/action";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

type QuickSellResult = {
  coinsEarned: number;
  balanceAfter: number;
  tier: string;
};

type ExtendResult = {
  newPlaysRemaining: number;
  coinCost: number;
  extensionNumber: number;
  balanceAfter: number;
};

function mapDbError(err: unknown): { code: string; message: string } {
  const e = err as { code?: string; message?: string };
  const msg = e.message ?? "Unknown error";
  if (e.code === "P0002") return { code: "NOT_FOUND", message: "Card not found." };
  if (e.code === "23514") {
    if (msg.includes("vaulted")) return { code: "CONFLICT", message: "Card is vaulted." };
    if (msg.includes("applied token")) {
      return { code: "TOKEN_APPLIED", message: "Remove the token before quick-selling." };
    }
    if (msg.includes("insufficient balance")) {
      return { code: "INSUFFICIENT_COINS", message: "Not enough coins." };
    }
    return { code: "CONFLICT", message: msg };
  }
  if (e.code === "23505") return { code: "CONFLICT", message: msg };
  if (e.code === "53100") return { code: "COLLECTION_AT_CAP", message: "Collection is full." };
  return { code: "INTERNAL", message: msg };
}

/** API spec §3.3 quickSellCard. Wraps public.quick_sell_card(user_id, card_id). */
async function quickSellCardImpl(input: QuickSellInput): Promise<ActionResult<QuickSellResult>> {
  const parsed = quickSellInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." },
    };
  }
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." } };

  try {
    const res = await getDb().execute<{
      quick_sell_card: { coins_earned: number; balance_after: number | string; tier: string };
    }>(sql`
      SELECT public.quick_sell_card(${user.id}::uuid, ${parsed.data.cardId}::uuid) AS quick_sell_card
    `);
    const raw = res.rows[0]?.quick_sell_card;
    if (!raw) {
      return { ok: false, error: { code: "INTERNAL", message: "Empty result." } };
    }
    revalidatePath("/collection");
    revalidatePath("/lineup", "layout");
    const data: QuickSellResult = {
      coinsEarned: Number(raw.coins_earned),
      balanceAfter: Number(raw.balance_after),
      tier: raw.tier,
    };
    await captureServerEvent(user.id, "card_quick_sold", {
      card_id: parsed.data.cardId,
      tier: data.tier,
      coins_earned: data.coinsEarned,
      balance_after: data.balanceAfter,
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const quickSellCard = wrapAction(quickSellCardImpl, { name: "quickSellCard" });

/**
 * Polish spec §104 (Phase 35). Bulk quick-sell wrapper. Iterates the
 * per-card SQL fn server-side; each card is independent, so partial
 * failures are reported rather than rolled back. Returns per-card
 * results so the UI can toast "sold 4 / failed 1".
 */
export type BulkQuickSellResult = {
  soldCount: number;
  totalCoinsEarned: number;
  balanceAfter: number;
  failures: { cardId: string; code: string; message: string }[];
};

async function quickSellCardsImpl(input: {
  cardIds: string[];
}): Promise<ActionResult<BulkQuickSellResult>> {
  if (!Array.isArray(input.cardIds) || input.cardIds.length === 0) {
    return { ok: false, error: { code: "VALIDATION", message: "No cards selected." } };
  }
  if (input.cardIds.length > 100) {
    return { ok: false, error: { code: "VALIDATION", message: "Max 100 cards per batch." } };
  }
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." } };

  const db = getDb();
  const failures: BulkQuickSellResult["failures"] = [];
  let totalCoinsEarned = 0;
  let balanceAfter = 0;
  let soldCount = 0;

  for (const cardId of input.cardIds) {
    try {
      const res = await db.execute<{
        quick_sell_card: { coins_earned: number; balance_after: number | string; tier: string };
      }>(sql`
        SELECT public.quick_sell_card(${user.id}::uuid, ${cardId}::uuid) AS quick_sell_card
      `);
      const raw = res.rows[0]?.quick_sell_card;
      if (!raw) {
        failures.push({ cardId, code: "INTERNAL", message: "Empty result." });
        continue;
      }
      soldCount += 1;
      totalCoinsEarned += Number(raw.coins_earned);
      balanceAfter = Number(raw.balance_after);
      await captureServerEvent(user.id, "card_quick_sold", {
        card_id: cardId,
        tier: raw.tier,
        coins_earned: Number(raw.coins_earned),
        balance_after: Number(raw.balance_after),
        batch: true,
      });
    } catch (err) {
      const mapped = mapDbError(err);
      failures.push({ cardId, code: mapped.code, message: mapped.message });
    }
  }

  revalidatePath("/lineup", "layout");
  return {
    ok: true,
    data: { soldCount, totalCoinsEarned, balanceAfter, failures },
  };
}

export const quickSellCards = wrapAction(quickSellCardsImpl, { name: "quickSellCards" });

/** API spec §3.3 extendCardContract. Wraps public.extend_card(user_id, card_id, plays). */
async function extendCardContractImpl(
  input: ExtendContractInput,
): Promise<ActionResult<ExtendResult>> {
  const parsed = extendContractInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." },
    };
  }
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." } };

  try {
    const res = await getDb().execute<{
      extend_card: {
        new_plays_remaining: number;
        coin_cost: number | string;
        extension_number: number;
        balance_after: number | string;
      };
    }>(sql`
      SELECT public.extend_card(
        ${user.id}::uuid, ${parsed.data.cardId}::uuid, ${parsed.data.plays}::int
      ) AS extend_card
    `);
    const raw = res.rows[0]?.extend_card;
    if (!raw) {
      return { ok: false, error: { code: "INTERNAL", message: "Empty result." } };
    }
    revalidatePath("/collection");
    revalidatePath("/lineup", "layout");
    const data: ExtendResult = {
      newPlaysRemaining: Number(raw.new_plays_remaining),
      coinCost: Number(raw.coin_cost),
      extensionNumber: Number(raw.extension_number),
      balanceAfter: Number(raw.balance_after),
    };
    await captureServerEvent(user.id, "contract_extended", {
      card_id: parsed.data.cardId,
      plays: parsed.data.plays,
      coin_cost: data.coinCost,
      extension_number: data.extensionNumber,
      new_plays_remaining: data.newPlaysRemaining,
      balance_after: data.balanceAfter,
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const extendCardContract = wrapAction(extendCardContractImpl, {
  name: "extendCardContract",
});

/**
 * Fetches CardDetailData for the drawer opened from lineup / bench clicks.
 * Mirrors the SELECT in src/app/(app)/collection/[cardId]/page.tsx so the
 * drawer can render <CardDetailView> without navigating.
 */
async function getCardDetailImpl(cardId: string): Promise<ActionResult<CardDetailData>> {
  if (!cardId || typeof cardId !== "string") {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid card id." } };
  }
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." } };

  const { data: cardRow, error } = await supabase
    .from("card")
    .select(
      `id, career_fp_total, current_tier, contract_plays_remaining, extension_count,
       is_expired, applied_token_id, tokens_applied_count, tokens_triggered_count,
       acquired_at,
       player:player_id ( full_name, positions, status, mlbam_id, team:team_id ( abbreviation ) )`,
    )
    .eq("id", cardId)
    .eq("user_id", user.id)
    .eq("is_vaulted", false)
    .maybeSingle();
  if (error || !cardRow) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Card not found." } };
  }

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
  const mlbamId = (player as { mlbam_id?: number | null } | null)?.mlbam_id ?? null;
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
      photoUrl: mlbamId ? mlbamHeadshotUrl(mlbamId, "large") : null,
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

  return { ok: true, data };
}

export const getCardDetail = wrapAction(getCardDetailImpl, { name: "getCardDetail" });
