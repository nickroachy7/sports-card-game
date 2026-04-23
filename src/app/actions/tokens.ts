"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
