"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  type ApplyTokenInput,
  applyTokenInputSchema,
  type RemoveTokenInput,
  removeTokenInputSchema,
} from "@/lib/contracts/lineup";
import { getDb } from "@/lib/db/client";
import { createServerClient } from "@/lib/db/supabase";
import { captureServerEvent, wrapAction } from "@/lib/observability/action";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/** Polish spec §197 (Phase 49). Quick-sell a single token from inventory. */
const quickSellTokenInputSchema = z.object({
  tokenId: z.string().uuid(),
});
export type QuickSellTokenInput = z.infer<typeof quickSellTokenInputSchema>;
export type QuickSellTokenResult = {
  coinsEarned: number;
  balanceAfter: number;
  tokenType: string;
};

/**
 * Drizzle's execute wraps the underlying `pg.DatabaseError` — the PG
 * `code` (e.g. "23514", "P0002") often lives on `err.cause.code`
 * instead of the top-level. Check both so we don't fall through to
 * `INTERNAL` with a raw "Failed query: SELECT public..." toast.
 *
 * We also string-match the RAISE EXCEPTION messages as a belt-and-
 * suspenders: even when the code is missing, the human copy is
 * recognisable.
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

  if (code === "P0002" || combined.includes("application not found")) {
    return { code: "NOT_FOUND", message: "Token already removed." };
  }
  if (combined.includes("token already consumed")) {
    return { code: "TOKEN_ALREADY_RESOLVED", message: "Token has already been used." };
  }
  if (combined.includes("currently applied to a card")) {
    return {
      code: "TOKEN_APPLIED",
      message: "Remove the token from its card before quick-selling.",
    };
  }
  if (combined.includes("SLOT_LOCKED")) {
    return {
      code: "SLOT_LOCKED",
      message: "Game already started — this token is locked in place.",
    };
  }
  if (combined.includes("already resolved")) {
    return {
      code: "TOKEN_ALREADY_RESOLVED",
      message: "Token has already been used.",
    };
  }
  if (combined.includes("contest no longer pending") || combined.includes("contest locked")) {
    return {
      code: "CONTEST_LOCKED",
      message: "Contest is locked — tokens can't be changed now.",
    };
  }
  if (code === "23514") {
    if (combined.includes("token already applied")) {
      return { code: "TOKEN_ALREADY_APPLIED", message: "Token is already applied." };
    }
    if (combined.includes("card already has a token")) {
      return { code: "CONFLICT", message: "Card already has a token." };
    }
    if (combined.includes("pitcher token") || combined.includes("hitter token")) {
      return { code: "TOKEN_INELIGIBLE", message: combined.replace(/^.*: /, "").trim() };
    }
    if (combined.includes("card is expired")) {
      return { code: "CARD_EXPIRED", message: "Card's contract is expired." };
    }
    return { code: "CONFLICT", message: "Can't modify this token right now." };
  }
  // Fallback — still better than "Failed query: SELECT public...".
  return { code: "INTERNAL", message: causeMsg || topMsg || "Couldn't update the token." };
}

async function applyTokenImpl(
  input: ApplyTokenInput,
): Promise<ActionResult<{ applicationId: string }>> {
  const parsed = applyTokenInputSchema.safeParse(input);
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
    const res = await getDb().execute<{ apply_token: string }>(sql`
      SELECT public.apply_token(
        ${user.id}::uuid,
        ${parsed.data.tokenId}::uuid,
        ${parsed.data.cardId}::uuid,
        ${parsed.data.contestId}::uuid
      ) AS apply_token
    `);
    const applicationId = res.rows[0]?.apply_token;
    if (!applicationId) {
      return { ok: false, error: { code: "INTERNAL", message: "Empty result." } };
    }
    revalidatePath("/lineup");
    revalidatePath("/collection");
    await captureServerEvent(user.id, "token_applied", {
      application_id: applicationId,
      token_id: parsed.data.tokenId,
      card_id: parsed.data.cardId,
      contest_id: parsed.data.contestId,
    });
    return { ok: true, data: { applicationId } };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const applyToken = wrapAction(applyTokenImpl, { name: "applyToken" });

async function removeTokenImpl(input: RemoveTokenInput): Promise<ActionResult<undefined>> {
  const parsed = removeTokenInputSchema.safeParse(input);
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
    await getDb().execute(sql`
      SELECT public.remove_token(
        ${user.id}::uuid,
        ${parsed.data.tokenApplicationId}::uuid
      )
    `);
    revalidatePath("/lineup");
    revalidatePath("/collection");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const removeToken = wrapAction(removeTokenImpl, { name: "removeToken" });

/**
 * Polish spec §197 (Phase 49). Wraps `public.quicksell_token(uuid,uuid)`.
 * Mirrors `quickSellCard` shape — refund coins + revalidate the
 * surfaces that show inventory + balance.
 */
async function quickSellTokenImpl(
  input: QuickSellTokenInput,
): Promise<ActionResult<QuickSellTokenResult>> {
  const parsed = quickSellTokenInputSchema.safeParse(input);
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
      quicksell_token: { coins_earned: number; balance_after: number | string; token_type: string };
    }>(sql`
      SELECT public.quicksell_token(${user.id}::uuid, ${parsed.data.tokenId}::uuid)
        AS quicksell_token
    `);
    const raw = res.rows[0]?.quicksell_token;
    if (!raw) {
      return { ok: false, error: { code: "INTERNAL", message: "Empty result." } };
    }
    revalidatePath("/lineup", "layout");
    revalidatePath("/collection");
    const data: QuickSellTokenResult = {
      coinsEarned: Number(raw.coins_earned),
      balanceAfter: Number(raw.balance_after),
      tokenType: raw.token_type,
    };
    await captureServerEvent(user.id, "token_quick_sold", {
      token_id: parsed.data.tokenId,
      token_type: data.tokenType,
      coins_earned: data.coinsEarned,
      balance_after: data.balanceAfter,
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const quickSellToken = wrapAction(quickSellTokenImpl, { name: "quickSellToken" });

/**
 * Polish spec §201 (Phase 49 Wave 1.1). Bulk quick-sell wrapper for
 * tokens. Mirrors `quickSellCards`: iterates the per-token SQL fn
 * server-side; each token is independent, so partial failures are
 * reported rather than rolled back.
 */
export type BulkQuickSellTokensResult = {
  soldCount: number;
  totalCoinsEarned: number;
  balanceAfter: number;
  failures: { tokenId: string; code: string; message: string }[];
};

async function quickSellTokensImpl(input: {
  tokenIds: string[];
}): Promise<ActionResult<BulkQuickSellTokensResult>> {
  if (!Array.isArray(input.tokenIds) || input.tokenIds.length === 0) {
    return { ok: false, error: { code: "VALIDATION", message: "No tokens selected." } };
  }
  if (input.tokenIds.length > 100) {
    return { ok: false, error: { code: "VALIDATION", message: "Max 100 tokens per batch." } };
  }
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." } };

  const db = getDb();
  const failures: BulkQuickSellTokensResult["failures"] = [];
  let totalCoinsEarned = 0;
  let balanceAfter = 0;
  let soldCount = 0;

  for (const tokenId of input.tokenIds) {
    try {
      const res = await db.execute<{
        quicksell_token: {
          coins_earned: number;
          balance_after: number | string;
          token_type: string;
        };
      }>(sql`
        SELECT public.quicksell_token(${user.id}::uuid, ${tokenId}::uuid) AS quicksell_token
      `);
      const raw = res.rows[0]?.quicksell_token;
      if (!raw) {
        failures.push({ tokenId, code: "INTERNAL", message: "Empty result." });
        continue;
      }
      soldCount += 1;
      totalCoinsEarned += Number(raw.coins_earned);
      balanceAfter = Number(raw.balance_after);
      await captureServerEvent(user.id, "token_quick_sold", {
        token_id: tokenId,
        token_type: raw.token_type,
        coins_earned: Number(raw.coins_earned),
        balance_after: Number(raw.balance_after),
        batch: true,
      });
    } catch (err) {
      const mapped = mapDbError(err);
      failures.push({ tokenId, code: mapped.code, message: mapped.message });
    }
  }

  revalidatePath("/lineup", "layout");
  revalidatePath("/collection");
  return {
    ok: true,
    data: { soldCount, totalCoinsEarned, balanceAfter, failures },
  };
}

export const quickSellTokens = wrapAction(quickSellTokensImpl, { name: "quickSellTokens" });

/**
 * Polish spec §199 (Phase 49 Wave 2). Fetch full info for a list of
 * token ids so the pack reveal panel + TokenOverflowResolveModal
 * can render type / bonus FP / pending-flag without an extra round-
 * trip per token.
 *
 * Server-side filters on `user_id = current_user` for security; no
 * `is_pending` filter so the same fetch returns both active rolls
 * (rendered face-up in the reveal slot) and pending overflows
 * (handed to the resolve modal).
 */
const revealTokensInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});
export type RevealedToken = {
  id: string;
  tokenType: string;
  bonusFp: number;
  acquiredSource: string;
  isPending: boolean;
};

async function fetchRevealTokensImpl(
  input: z.infer<typeof revealTokensInputSchema>,
): Promise<ActionResult<RevealedToken[]>> {
  const parsed = revealTokensInputSchema.safeParse(input);
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
    const idsLiteral = parsed.data.ids;
    const res = await getDb().execute<{
      id: string;
      token_type: string;
      bonus_fp: string;
      acquired_source: string;
      is_pending: boolean;
    }>(sql`
      SELECT id, token_type, bonus_fp, acquired_source, is_pending
      FROM public.token
      WHERE user_id = ${user.id}::uuid
        AND id = ANY(${sql`ARRAY[${sql.join(
          idsLiteral.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}]::uuid[]`})
      ORDER BY acquired_at ASC
    `);
    return {
      ok: true,
      data: res.rows.map((r) => ({
        id: r.id,
        tokenType: r.token_type,
        bonusFp: Number(r.bonus_fp),
        acquiredSource: r.acquired_source,
        isPending: r.is_pending,
      })),
    };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const fetchRevealTokens = wrapAction(fetchRevealTokensImpl, {
  name: "fetchRevealTokens",
});

/**
 * Polish spec §199 (Phase 49 Wave 2). Resolve a single pending
 * token. Wraps `public.resolve_pending_token`. Two action codes:
 *   - keep_replace: quicksell `replacedTokenId`, flip pending → active.
 *   - quicksell_new: quicksell the pending one directly.
 * Returns coins_earned + balance_after for the toast.
 */
const resolvePendingTokenInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("keep_replace"),
    pendingTokenId: z.string().uuid(),
    replacedTokenId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("quicksell_new"),
    pendingTokenId: z.string().uuid(),
  }),
]);
export type ResolvePendingTokenInput = z.infer<typeof resolvePendingTokenInputSchema>;
export type ResolvePendingTokenResult = {
  action: "keep_replace" | "quicksell_new";
  coinsEarned: number;
  balanceAfter: number;
};

async function resolvePendingTokenImpl(
  input: ResolvePendingTokenInput,
): Promise<ActionResult<ResolvePendingTokenResult>> {
  const parsed = resolvePendingTokenInputSchema.safeParse(input);
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
    const replacedId = parsed.data.action === "keep_replace" ? parsed.data.replacedTokenId : null;
    const res = await getDb().execute<{
      resolve_pending_token: {
        action: "keep_replace" | "quicksell_new";
        coins_earned: number;
        balance_after: number | string;
      };
    }>(sql`
      SELECT public.resolve_pending_token(
        ${user.id}::uuid,
        ${parsed.data.pendingTokenId}::uuid,
        ${parsed.data.action}::text,
        ${replacedId}::uuid
      ) AS resolve_pending_token
    `);
    const raw = res.rows[0]?.resolve_pending_token;
    if (!raw) {
      return { ok: false, error: { code: "INTERNAL", message: "Empty result." } };
    }
    revalidatePath("/lineup", "layout");
    revalidatePath("/collection");
    const data: ResolvePendingTokenResult = {
      action: raw.action,
      coinsEarned: Number(raw.coins_earned),
      balanceAfter: Number(raw.balance_after),
    };
    await captureServerEvent(user.id, "token_overflow_resolved", {
      pending_token_id: parsed.data.pendingTokenId,
      action: data.action,
      coins_earned: data.coinsEarned,
      balance_after: data.balanceAfter,
      ...(parsed.data.action === "keep_replace" && {
        replaced_token_id: parsed.data.replacedTokenId,
      }),
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const resolvePendingToken = wrapAction(resolvePendingTokenImpl, {
  name: "resolvePendingToken",
});
