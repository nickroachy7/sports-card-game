"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  type CommitVaultSelectionInput,
  type CommitVaultSelectionResult,
  commitVaultSelectionInputSchema,
  type GetVaultCeremonyPreviewInput,
  getVaultCeremonyPreviewInputSchema,
  type VaultCeremonyPreview,
} from "@/lib/contracts/vault";
import { getDb } from "@/lib/db/client";
import { asPgArray } from "@/lib/db/sql-helpers";
import { createServerClient } from "@/lib/db/supabase";
import { captureServerEvent, wrapAction } from "@/lib/observability/action";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

function mapDbError(err: unknown): { code: string; message: string } {
  const e = err as { code?: string; message?: string };
  const msg = e.message ?? "Unknown error";
  if (e.code === "22023") {
    return { code: "VALIDATION", message: msg.replace(/^.*: /, "") };
  }
  if (e.code === "P0002") {
    return { code: "NOT_FOUND", message: msg.replace(/^.*: /, "") };
  }
  if (e.code === "23514") {
    if (msg.includes("already committed")) {
      return { code: "CONFLICT", message: "Vault already committed for this season." };
    }
    if (msg.includes("season not in offseason")) {
      return { code: "CONFLICT", message: "Vault ceremony is not open yet." };
    }
    if (msg.includes("already vaulted")) {
      return { code: "VAULT_CARD_ALREADY_VAULTED", message: "Card is already in the vault." };
    }
    if (msg.includes("vault at cap")) {
      return {
        code: "VAULT_CAP_FULL",
        message: "Vault is full (10). Destroy a vaulted card to free a slot.",
      };
    }
    if (msg.includes("locked in a submitted lineup")) {
      return {
        code: "VAULT_CARD_LOCKED_IN_LINEUP",
        message: "Card is in a locked lineup. Vault it after today's contest scores.",
      };
    }
    if (msg.includes("not vaulted")) {
      return { code: "VAULT_CARD_NOT_VAULTED", message: "Card is not in the vault." };
    }
    return { code: "CONFLICT", message: msg };
  }
  return { code: "INTERNAL", message: msg };
}

/** API spec §3.6 getVaultCeremonyPreview. Read-side recap + eligible list. */
async function getVaultCeremonyPreviewImpl(
  input: GetVaultCeremonyPreviewInput,
): Promise<ActionResult<VaultCeremonyPreview>> {
  const parsed = getVaultCeremonyPreviewInputSchema.safeParse(input);
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
    const res = await getDb().execute<{ get_vault_ceremony_preview: VaultCeremonyPreview }>(sql`
      SELECT public.get_vault_ceremony_preview(
        ${user.id}::uuid, ${parsed.data.seasonId}::uuid
      ) AS get_vault_ceremony_preview
    `);
    const payload = res.rows[0]?.get_vault_ceremony_preview;
    if (!payload) {
      return { ok: false, error: { code: "INTERNAL", message: "Empty result." } };
    }
    return { ok: true, data: payload };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const getVaultCeremonyPreview = wrapAction(getVaultCeremonyPreviewImpl, {
  name: "getVaultCeremonyPreview",
});

/** API spec §3.6 commitVaultSelection. Wraps commit_vault_selection SQL fn. */
async function commitVaultSelectionImpl(
  input: CommitVaultSelectionInput,
): Promise<ActionResult<CommitVaultSelectionResult>> {
  const parsed = commitVaultSelectionInputSchema.safeParse(input);
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
      commit_vault_selection: {
        vaulted_count: number;
        dissolved_count: number;
        diamond_count: number;
      };
    }>(sql`
      SELECT public.commit_vault_selection(
        ${user.id}::uuid,
        ${parsed.data.seasonId}::uuid,
        ${asPgArray(parsed.data.cardIds, "uuid")}
      ) AS commit_vault_selection
    `);
    const raw = res.rows[0]?.commit_vault_selection;
    if (!raw) {
      return { ok: false, error: { code: "INTERNAL", message: "Empty result." } };
    }
    const data: CommitVaultSelectionResult = {
      vaultedCount: raw.vaulted_count,
      dissolvedCount: raw.dissolved_count,
      diamondCount: raw.diamond_count,
    };
    revalidatePath("/vault");
    revalidatePath("/", "layout");
    await captureServerEvent(user.id, "vault_committed", {
      season_id: parsed.data.seasonId,
      vaulted_count: data.vaultedCount,
      dissolved_count: data.dissolvedCount,
      diamond_count: data.diamondCount,
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const commitVaultSelection = wrapAction(commitVaultSelectionImpl, {
  name: "commitVaultSelection",
});

// ── Mid-season vault (polish spec §7) ──────────────────────────────────

type VaultCardMidseasonResult = {
  cardId: string;
  vaultCount: number;
  vaultSource: "midseason";
};

async function vaultCardMidseasonImpl(input: {
  cardId: string;
}): Promise<ActionResult<VaultCardMidseasonResult>> {
  if (!input.cardId || typeof input.cardId !== "string") {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid card id." } };
  }
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." } };

  try {
    const res = await getDb().execute<{
      vault_card_midseason: { card_id: string; vault_count: number; vault_source: "midseason" };
    }>(sql`
      SELECT public.vault_card_midseason(
        ${user.id}::uuid, ${input.cardId}::uuid
      ) AS vault_card_midseason
    `);
    const raw = res.rows[0]?.vault_card_midseason;
    if (!raw) return { ok: false, error: { code: "INTERNAL", message: "Empty result." } };
    revalidatePath("/lineup");
    revalidatePath("/collection");
    revalidatePath("/vault");
    await captureServerEvent(user.id, "card_vaulted_midseason", {
      card_id: raw.card_id,
      vault_count: raw.vault_count,
    });
    return {
      ok: true,
      data: {
        cardId: raw.card_id,
        vaultCount: raw.vault_count,
        vaultSource: raw.vault_source,
      },
    };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const vaultCardMidseason = wrapAction(vaultCardMidseasonImpl, {
  name: "vaultCardMidseason",
});

/**
 * Polish spec §104 (Phase 35). Bulk mid-season vault wrapper. Loops
 * the per-card SQL fn; returns per-card results. If the 10-slot cap
 * is hit mid-batch, subsequent cards fail with VAULT_CAP_FULL while
 * the earlier successes stick.
 */
export type BulkVaultResult = {
  vaultedCount: number;
  vaultCountAfter: number;
  failures: { cardId: string; code: string; message: string }[];
};

async function vaultCardsMidseasonImpl(input: {
  cardIds: string[];
}): Promise<ActionResult<BulkVaultResult>> {
  if (!Array.isArray(input.cardIds) || input.cardIds.length === 0) {
    return { ok: false, error: { code: "VALIDATION", message: "No cards selected." } };
  }
  if (input.cardIds.length > 10) {
    return { ok: false, error: { code: "VALIDATION", message: "Max 10 cards per vault batch." } };
  }
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." } };

  const db = getDb();
  const failures: BulkVaultResult["failures"] = [];
  let vaultedCount = 0;
  let vaultCountAfter = 0;

  for (const cardId of input.cardIds) {
    try {
      const res = await db.execute<{
        vault_card_midseason: {
          card_id: string;
          vault_count: number;
          vault_source: "midseason";
        };
      }>(sql`
        SELECT public.vault_card_midseason(
          ${user.id}::uuid, ${cardId}::uuid
        ) AS vault_card_midseason
      `);
      const raw = res.rows[0]?.vault_card_midseason;
      if (!raw) {
        failures.push({ cardId, code: "INTERNAL", message: "Empty result." });
        continue;
      }
      vaultedCount += 1;
      vaultCountAfter = raw.vault_count;
      await captureServerEvent(user.id, "card_vaulted_midseason", {
        card_id: raw.card_id,
        vault_count: raw.vault_count,
        batch: true,
      });
    } catch (err) {
      const mapped = mapDbError(err);
      failures.push({ cardId, code: mapped.code, message: mapped.message });
    }
  }

  revalidatePath("/lineup", "layout");
  revalidatePath("/vault");
  return {
    ok: true,
    data: { vaultedCount, vaultCountAfter, failures },
  };
}

export const vaultCardsMidseason = wrapAction(vaultCardsMidseasonImpl, {
  name: "vaultCardsMidseason",
});

type DestroyVaultedCardResult = {
  cardId: string;
  tier: string;
  refundCoins: number;
  vaultSource: string;
  balanceAfter: number;
};

async function destroyVaultedCardImpl(input: {
  cardId: string;
}): Promise<ActionResult<DestroyVaultedCardResult>> {
  if (!input.cardId || typeof input.cardId !== "string") {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid card id." } };
  }
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." } };

  try {
    const res = await getDb().execute<{
      destroy_vaulted_card: {
        card_id: string;
        tier: string;
        refund_coins: number | string;
        vault_source: string;
        balance_after: number | string;
      };
    }>(sql`
      SELECT public.destroy_vaulted_card(
        ${user.id}::uuid, ${input.cardId}::uuid
      ) AS destroy_vaulted_card
    `);
    const raw = res.rows[0]?.destroy_vaulted_card;
    if (!raw) return { ok: false, error: { code: "INTERNAL", message: "Empty result." } };
    revalidatePath("/vault");
    revalidatePath("/", "layout");
    const data: DestroyVaultedCardResult = {
      cardId: raw.card_id,
      tier: raw.tier,
      refundCoins: Number(raw.refund_coins),
      vaultSource: raw.vault_source,
      balanceAfter: Number(raw.balance_after),
    };
    await captureServerEvent(user.id, "vaulted_card_destroyed", {
      card_id: data.cardId,
      tier: data.tier,
      refund_coins: data.refundCoins,
      vault_source: data.vaultSource,
      balance_after: data.balanceAfter,
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export const destroyVaultedCard = wrapAction(destroyVaultedCardImpl, {
  name: "destroyVaultedCard",
});
