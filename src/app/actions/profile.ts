"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { type OnboardingInput, onboardingSchema } from "@/lib/contracts/profile";
import { getDb } from "@/lib/db/client";
import { createServerClient } from "@/lib/db/supabase";

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * API spec §3.1 completeOnboarding. Single-call bootstrap:
 *   - profile + manager_account + user_season_state inserts
 *   - 10 starter Bronze cards (if players are seeded; M4 populates them)
 *   - 2 starter tokens + 500 coins + pack_opening audit row
 * Wraps the onboard_user(user_id, team_name, primary, secondary, logo_id)
 * SQL function defined in 0009_functions_onboarding.sql.
 */
export async function completeOnboarding(input: OnboardingInput): Promise<ActionResult<undefined>> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Invalid input.",
      },
    };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." } };
  }

  const { teamName, primaryColor, secondaryColor, logoId } = parsed.data;
  const db = getDb();

  try {
    await db.execute(sql`
      SELECT public.onboard_user(
        ${user.id}::uuid,
        ${teamName}::text,
        ${primaryColor}::text,
        ${secondaryColor}::text,
        ${logoId}::text
      )
    `);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "23505") {
      return {
        ok: false,
        error: {
          code: "CONFLICT",
          message: "Team name already taken or you're already onboarded.",
        },
      };
    }
    return {
      ok: false,
      error: { code: "INTERNAL", message: e.message ?? "Onboarding failed." },
    };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
