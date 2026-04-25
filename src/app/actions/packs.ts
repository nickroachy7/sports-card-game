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

export type PackCardResult = {
  cardId: string;
  /** True when the pulled player was already owned (pool exhaustion
   *  fallback). The reveal modal shows the keep-new vs keep-existing
   *  panel; user picks which instance to quick-sell. */
  isDupe: boolean;
  /** When isDupe is true, the user's lowest-FP existing instance of
   *  this player. Server default for the "Sell existing" CTA. Users
   *  with multiple instances of the same player can override from the
   *  reveal's picker (optional; scope'd out for the first slice). */
  existingCardId: string | null;
};

export type OpenPackResult = {
  openingId: string;
  cardIds: string[];
  cardResults: PackCardResult[];
  duplicateCount: number;
  coinsFromDupes: number;
  tokenIds: string[];
  /**
   * Polish spec §198 (Phase 49 Wave 2). Tokens granted while at cap.
   * INSERTed `is_pending=true` so they don't count toward inventory
   * yet. The reveal panel renders a token slot for these too; after
   * reveal the TokenOverflowResolveModal opens for the user to
   * keep+replace or quicksell each one.
   */
  pendingTokenIds: string[];
  coinCost: number;
  balanceAfter: number;
  packType: PackType;
};

/**
 * Drizzle's execute wraps the underlying `pg.DatabaseError` — the PG
 * SQLSTATE (e.g. "53100", "23514") often lives on `err.cause.code`
 * instead of the top-level. Check both so we don't fall through to
 * `INTERNAL` with a raw "Failed query: SELECT public.open_pack..."
 * toast for well-understood error paths.
 */
function mapDbError(err: unknown): { code: string; message: string } {
  const e = err as {
    code?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };
  const topMsg = e.message ?? "";
  const causeMsg = e.cause?.message ?? "";
  const code = e.code ?? e.cause?.code;
  const combined = `${topMsg} ${causeMsg}`;

  if (code === "53100" || combined.includes("collection at cap")) {
    return {
      code: "COLLECTION_AT_CAP",
      message: "Collection is full — quick-sell some cards first.",
    };
  }
  if (code === "23505" || combined.includes("daily pack already claimed")) {
    return {
      code: "CONFLICT",
      message: "Daily pack already claimed — come back in 24 hours.",
    };
  }
  if (code === "23514" && combined.includes("insufficient balance")) {
    return { code: "INSUFFICIENT_COINS", message: "Not enough coins." };
  }
  return { code: "INTERNAL", message: topMsg || causeMsg || "Unknown error" };
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
    type RawCardResult = {
      card_id: string;
      is_dupe: boolean;
      existing_card_id: string | null;
    };
    const raw = res.rows[0]?.open_pack as
      | {
          opening_id: string;
          card_ids: string[];
          card_results: RawCardResult[] | null;
          duplicate_count: number | null;
          coins_from_dupes: number | string;
          token_ids: string[];
          pending_token_ids?: string[] | null;
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
    const data: OpenPackResult = {
      openingId: raw.opening_id,
      cardIds: raw.card_ids ?? [],
      cardResults: (raw.card_results ?? []).map((r) => ({
        cardId: r.card_id,
        isDupe: r.is_dupe,
        existingCardId: r.existing_card_id,
      })),
      duplicateCount: raw.duplicate_count ?? 0,
      coinsFromDupes: Number(raw.coins_from_dupes),
      tokenIds: raw.token_ids ?? [],
      pendingTokenIds: raw.pending_token_ids ?? [],
      coinCost: Number(raw.coin_cost),
      balanceAfter: Number(raw.balance_after),
      packType: parsed.data.packType,
    };
    await captureServerEvent(user.id, "pack_opened", {
      pack_type: data.packType,
      cards_granted: data.cardIds.length,
      duplicates: data.duplicateCount,
      tokens_granted: data.tokenIds.length,
      tokens_pending: data.pendingTokenIds.length,
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

/**
 * Polish spec §110 (Phase 36). Bulk-open wrapper. Loops the
 * existing `open_pack` SQL fn up to 10× server-side and aggregates
 * the result. Matches the P35 bulk-quick-sell pattern — partial
 * failures are reported; the loop stops at the first failure so
 * users don't get surprise half-charges past the point of error.
 *
 * Daily packs are forced to quantity 1 (SQL already enforces one
 * claim per 24h; batching would trip the constraint).
 */
export type OpenPacksBatchResult = {
  openings: OpenPackResult[];
  totalCoinCost: number;
  totalCardsGranted: number;
  balanceAfter: number;
  failures: { index: number; code: string; message: string }[];
};

async function openPacksBatchImpl(input: {
  packType: PackType;
  quantity: 1 | 5 | 10;
}): Promise<ActionResult<OpenPacksBatchResult>> {
  const packType = input.packType;
  const quantity = input.quantity;
  if (!packType || !["daily", "standard", "premium"].includes(packType)) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: "Invalid pack type." },
    };
  }
  if (![1, 5, 10].includes(quantity)) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: "Quantity must be 1, 5, or 10." },
    };
  }
  if (packType === "daily" && quantity !== 1) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: "Daily pack is one-at-a-time." },
    };
  }
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." } };

  const db = getDb();
  const openings: OpenPackResult[] = [];
  const failures: OpenPacksBatchResult["failures"] = [];
  let balanceAfter = 0;
  let totalCoinCost = 0;
  let totalCardsGranted = 0;

  for (let i = 0; i < quantity; i++) {
    try {
      const res = await db.execute<{ open_pack: unknown }>(sql`
        SELECT public.open_pack(${user.id}::uuid, ${packType}::pack_type) AS open_pack
      `);
      type RawCardResult = {
        card_id: string;
        is_dupe: boolean;
        existing_card_id: string | null;
      };
      const raw = res.rows[0]?.open_pack as
        | {
            opening_id: string;
            card_ids: string[];
            card_results: RawCardResult[] | null;
            duplicate_count: number | null;
            coins_from_dupes: number | string;
            token_ids: string[];
            pending_token_ids?: string[] | null;
            coin_cost: number | string;
            balance_after: number | string;
          }
        | undefined;
      if (!raw) {
        failures.push({ index: i, code: "INTERNAL", message: "Empty result." });
        break;
      }
      const opening: OpenPackResult = {
        openingId: raw.opening_id,
        cardIds: raw.card_ids ?? [],
        cardResults: (raw.card_results ?? []).map((r) => ({
          cardId: r.card_id,
          isDupe: r.is_dupe,
          existingCardId: r.existing_card_id,
        })),
        duplicateCount: raw.duplicate_count ?? 0,
        coinsFromDupes: Number(raw.coins_from_dupes),
        tokenIds: raw.token_ids ?? [],
        pendingTokenIds: raw.pending_token_ids ?? [],
        coinCost: Number(raw.coin_cost),
        balanceAfter: Number(raw.balance_after),
        packType,
      };
      openings.push(opening);
      balanceAfter = opening.balanceAfter;
      totalCoinCost += opening.coinCost;
      totalCardsGranted += opening.cardIds.length;
      await captureServerEvent(user.id, "pack_opened", {
        pack_type: packType,
        cards_granted: opening.cardIds.length,
        duplicates: opening.duplicateCount,
        tokens_granted: opening.tokenIds.length,
        tokens_pending: opening.pendingTokenIds.length,
        coin_cost: opening.coinCost,
        coins_from_dupes: opening.coinsFromDupes,
        balance_after: opening.balanceAfter,
        batch: true,
        batch_index: i,
      });
    } catch (err) {
      const mapped = mapDbError(err);
      failures.push({ index: i, code: mapped.code, message: mapped.message });
      // Stop after first failure — don't keep charging if something went wrong.
      break;
    }
  }

  revalidatePath("/lineup", "layout");
  return {
    ok: true,
    data: { openings, totalCoinCost, totalCardsGranted, balanceAfter, failures },
  };
}

export const openPacksBatch = wrapAction(openPacksBatchImpl, { name: "openPacksBatch" });
