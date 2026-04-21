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
