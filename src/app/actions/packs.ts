"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { type OpenPackInput, openPackInputSchema, type PackType } from "@/lib/contracts/cards";
import { getDb } from "@/lib/db/client";
import { createServerClient } from "@/lib/db/supabase";
import { captureServerEvent, wrapAction } from "@/lib/observability/action";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export type OpenPackResult = {
  openingId: string;
  cardIds: string[];
  duplicateCount: number;
  coinsFromDupes: number;
  tokenIds: string[];
  coinCost: number;
  balanceAfter: number;
  packType: PackType;
};

function mapDbError(err: unknown): { code: string; message: string } {
  const e = err as { code?: string; message?: string };
  const msg = e.message ?? "Unknown error";
  if (e.code === "23514" && msg.includes("insufficient balance")) {
    return { code: "INSUFFICIENT_COINS", message: "Not enough coins." };
  }
  if (e.code === "23505" && msg.includes("daily pack already claimed")) {
    return {
      code: "CONFLICT",
      message: "Daily pack already claimed — come back in 24 hours.",
    };
  }
  if (e.code === "53100") {
    return {
      code: "COLLECTION_AT_CAP",
      message: "Collection is full — quick-sell some cards first.",
    };
  }
  return { code: "INTERNAL", message: msg };
}

/**
 * API spec §3.2 openPack. Wraps public.open_pack(user_id, pack_type).
 *
 * Simplified vs spec §3.2 for M5: collection-cap overflow is a pre-check
 * (rejects the pack entirely) rather than the pending-pack / resolveCapOverflow
 * two-phase flow. The user must free space before pulling. TODO for Phase 2:
 * stage the pending pack and expose resolveCapOverflow to let the user
 * pick which card to drop.
 */
async function openPackImpl(input: OpenPackInput): Promise<ActionResult<OpenPackResult>> {
  const parsed = openPackInputSchema.safeParse(input);
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
    const res = await getDb().execute<{ open_pack: unknown }>(sql`
      SELECT public.open_pack(${user.id}::uuid, ${parsed.data.packType}::pack_type) AS open_pack
    `);
    const raw = res.rows[0]?.open_pack as
      | {
          opening_id: string;
          card_ids: string[];
          duplicate_count: number | null;
          coins_from_dupes: number | string;
          token_ids: string[];
          coin_cost: number | string;
          balance_after: number | string;
        }
      | undefined;
    if (!raw) {
      return { ok: false, error: { code: "INTERNAL", message: "Empty result." } };
    }
    revalidatePath("/shop");
    revalidatePath("/collection");
    revalidatePath("/lineup", "layout");
    const data = {
      openingId: raw.opening_id,
      cardIds: raw.card_ids ?? [],
      duplicateCount: raw.duplicate_count ?? 0,
      coinsFromDupes: Number(raw.coins_from_dupes),
      tokenIds: raw.token_ids ?? [],
      coinCost: Number(raw.coin_cost),
      balanceAfter: Number(raw.balance_after),
      packType: parsed.data.packType,
    };
    await captureServerEvent(user.id, "pack_opened", {
      pack_type: data.packType,
      cards_granted: data.cardIds.length,
      duplicates: data.duplicateCount,
      tokens_granted: data.tokenIds.length,
      coin_cost: data.coinCost,
      coins_from_dupes: data.coinsFromDupes,
      balance_after: data.balanceAfter,
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

/** Public entrypoint — Sentry-wrapped. */
export const openPack = wrapAction(openPackImpl, { name: "openPack" });
