"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  type CreateEntryInput,
  createEntryInputSchema,
  type SetAutoSubModeInput,
  type SubmitLineupInput,
  setAutoSubModeInputSchema,
  submitLineupInputSchema,
  type UpdateSlotInput,
  updateSlotInputSchema,
} from "@/lib/contracts/lineup";
import { getDb } from "@/lib/db/client";
import { createServerClient } from "@/lib/db/supabase";
import { captureServerEvent, wrapAction } from "@/lib/observability/action";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * Postgres SQLSTATE → API error code mapping per lineup functions.
 * Drizzle wraps pg errors — SQLSTATE lives on `err.cause.code`. Check
 * both top-level and cause so we don't fall through to INTERNAL with
 * a raw "Failed query: ..." toast.
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
  const msg = topMsg || causeMsg || "Unknown error";
  const combined = `${topMsg} ${causeMsg}`;
  if (code === "P0002") return { code: "NOT_FOUND", message: msg };
  if (code === "23514") {
    // Polish spec §44 — per-slot lock takes precedence over the older
    // contest-level lock messaging so the toast tells the user which
    // slot is frozen.
    if (combined.includes("SLOT_LOCKED")) {
      return {
        code: "SLOT_LOCKED",
        message: combined.replace(/^.*SLOT_LOCKED:\s*/, "").trim(),
      };
    }
    if (combined.includes("contest locked") || combined.includes("contest not pending")) {
      return { code: "CONTEST_LOCKED", message: "Lineup lock has passed." };
    }
    if (combined.includes("empty slots")) {
      return { code: "VALIDATION", message: msg.replace(/^.*: /, "") };
    }
    if (combined.includes("expired")) {
      return { code: "CARD_EXPIRED", message: "Card's contract is expired." };
    }
    if (combined.includes("vaulted")) {
      return { code: "CONFLICT", message: "Card is vaulted." };
    }
    if (combined.includes("cannot fill")) {
      return { code: "CARD_INELIGIBLE", message: msg.replace(/^.*: /, "") };
    }
    if (combined.includes("insufficient balance")) {
      return { code: "INSUFFICIENT_COINS", message: "Not enough coins." };
    }
    return { code: "CONFLICT", message: msg };
  }
  return { code: "INTERNAL", message: msg };
}

/** Creates or returns the user's entry for a contest. Idempotent. */
async function createContestEntryImpl(
  input: CreateEntryInput,
): Promise<ActionResult<{ entryId: string }>> {
  const parsed = createEntryInputSchema.safeParse(input);
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
    const res = await getDb().execute<{ create_contest_entry: string }>(sql`
      SELECT public.create_contest_entry(
        ${user.id}::uuid, ${parsed.data.contestId}::uuid
      ) AS create_contest_entry
    `);
    const entryId = res.rows[0]?.create_contest_entry;
    if (!entryId) {
      return { ok: false, error: { code: "INTERNAL", message: "Empty result." } };
    }
    revalidatePath("/lineup");
    return { ok: true, data: { entryId } };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const createContestEntry = wrapAction(createContestEntryImpl, {
  name: "createContestEntry",
});

/** Drag-drop handler. Assigns or clears starter_card_id on one slot. */
async function updateLineupSlotImpl(input: UpdateSlotInput): Promise<ActionResult<undefined>> {
  const parsed = updateSlotInputSchema.safeParse(input);
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
      SELECT public.update_lineup_slot(
        ${user.id}::uuid,
        ${parsed.data.entryId}::uuid,
        ${parsed.data.position}::text,
        ${parsed.data.starterCardId ? sql`${parsed.data.starterCardId}::uuid` : sql`NULL::uuid`}
      )
    `);
    revalidatePath("/lineup");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const updateLineupSlot = wrapAction(updateLineupSlotImpl, {
  name: "updateLineupSlot",
});

/**
 * Polish spec §177 (Phase 46). Per-slot sticky toggle. Wraps
 * `public.update_slot_sticky` which guards against locked slots +
 * cross-user mutation.
 */
async function toggleSlotStickyImpl(input: {
  slotId: string;
  sticky: boolean;
}): Promise<ActionResult<{ slotId: string; sticky: boolean }>> {
  if (typeof input?.slotId !== "string" || !input.slotId) {
    return { ok: false, error: { code: "VALIDATION", message: "Missing slotId." } };
  }
  if (typeof input?.sticky !== "boolean") {
    return { ok: false, error: { code: "VALIDATION", message: "Missing sticky flag." } };
  }
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." } };

  try {
    await getDb().execute(sql`
      SELECT public.update_slot_sticky(
        ${user.id}::uuid,
        ${input.slotId}::uuid,
        ${input.sticky}::boolean
      )
    `);
    revalidatePath("/lineup", "layout");
    return { ok: true, data: { slotId: input.slotId, sticky: input.sticky } };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const toggleSlotSticky = wrapAction(toggleSlotStickyImpl, {
  name: "toggleSlotSticky",
});

/** Set auto-sub mode for an entry. */
async function setAutoSubModeImpl(input: SetAutoSubModeInput): Promise<ActionResult<undefined>> {
  const parsed = setAutoSubModeInputSchema.safeParse(input);
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
      SELECT public.set_auto_sub_mode(
        ${user.id}::uuid,
        ${parsed.data.entryId}::uuid,
        ${parsed.data.mode}::auto_sub_mode
      )
    `);
    revalidatePath("/lineup");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const setAutoSubMode = wrapAction(setAutoSubModeImpl, {
  name: "setAutoSubMode",
});

/** Validate + lock entry. Fires PostHog `lineup_submitted` on success. */
async function submitLineupImpl(
  input: SubmitLineupInput,
): Promise<ActionResult<{ entryCoinCost: number; balanceAfter: number }>> {
  const parsed = submitLineupInputSchema.safeParse(input);
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
      submit_lineup: { entry_coin_cost: number | string; balance_after: number | string };
    }>(sql`
      SELECT public.submit_lineup(
        ${user.id}::uuid, ${parsed.data.entryId}::uuid
      ) AS submit_lineup
    `);
    const raw = res.rows[0]?.submit_lineup;
    if (!raw) {
      return { ok: false, error: { code: "INTERNAL", message: "Empty result." } };
    }
    const data = {
      entryCoinCost: Number(raw.entry_coin_cost),
      balanceAfter: Number(raw.balance_after),
    };
    revalidatePath("/lineup");
    revalidatePath("/", "layout");
    await captureServerEvent(user.id, "lineup_submitted", {
      entry_id: parsed.data.entryId,
      entry_coin_cost: data.entryCoinCost,
      balance_after: data.balanceAfter,
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const submitLineup = wrapAction(submitLineupImpl, { name: "submitLineup" });

// ── Slot ↔ slot swap (polish spec §11.2) ─────────────────────────────

type SwapLineupSlotsInput = {
  entryId: string;
  positionA: string;
  positionB: string;
};

async function swapLineupSlotsImpl(input: SwapLineupSlotsInput): Promise<ActionResult<undefined>> {
  if (!input.entryId || !input.positionA || !input.positionB) {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid input." } };
  }
  if (input.positionA === input.positionB) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: "Source and target are identical." },
    };
  }
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." } };

  try {
    await getDb().execute(sql`
      SELECT public.swap_lineup_slots(
        ${user.id}::uuid,
        ${input.entryId}::uuid,
        ${input.positionA}::text,
        ${input.positionB}::text
      )
    `);
    revalidatePath("/lineup");
    await captureServerEvent(user.id, "lineup_slots_swapped", {
      entry_id: input.entryId,
      position_a: input.positionA,
      position_b: input.positionB,
    });
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const swapLineupSlots = wrapAction(swapLineupSlotsImpl, {
  name: "swapLineupSlots",
});
