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

function mapDbError(err: unknown): { code: string; message: string } {
  const e = err as { code?: string; message?: string };
  const msg = e.message ?? "Unknown error";
  if (e.code === "P0002") return { code: "NOT_FOUND", message: msg };
  if (e.code === "23514") {
    // Polish spec §44 — slot lock check fires before the token
    // eligibility ones; surface it first.
    if (msg.includes("SLOT_LOCKED")) {
      return {
        code: "SLOT_LOCKED",
        message: msg.replace(/^.*SLOT_LOCKED:\s*/, ""),
      };
    }
    if (msg.includes("token already applied")) {
      return { code: "TOKEN_ALREADY_APPLIED", message: "Token is already applied." };
    }
    if (msg.includes("card already has a token")) {
      return { code: "CONFLICT", message: "Card already has a token." };
    }
    if (msg.includes("pitcher token") || msg.includes("hitter token")) {
      return { code: "TOKEN_INELIGIBLE", message: msg.replace(/^.*: /, "") };
    }
    if (msg.includes("contest locked")) {
      return { code: "CONTEST_LOCKED", message: "Lineup lock has passed." };
    }
    if (msg.includes("card is expired")) {
      return { code: "CARD_EXPIRED", message: "Card's contract is expired." };
    }
    return { code: "CONFLICT", message: msg };
  }
  return { code: "INTERNAL", message: msg };
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
