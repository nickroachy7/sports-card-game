"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  type ExtendContractInput,
  extendContractInputSchema,
  type QuickSellInput,
  quickSellInputSchema,
} from "@/lib/contracts/cards";
import { getDb } from "@/lib/db/client";
import { createServerClient } from "@/lib/db/supabase";
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
