"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  type OnboardingInput,
  onboardingSchema,
  type UpdateTeamProfileInput,
  updateTeamProfileSchema,
} from "@/lib/contracts/profile";
import { getDb } from "@/lib/db/client";
import { createServerClient } from "@/lib/db/supabase";
import { captureServerEvent, wrapAction } from "@/lib/observability/action";

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
async function completeOnboardingImpl(input: OnboardingInput): Promise<ActionResult<undefined>> {
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
  await captureServerEvent(user.id, "completed_onboarding", {
    team_name: teamName,
    logo_id: logoId,
  });
  return { ok: true, data: undefined };
}

export const completeOnboarding = wrapAction(completeOnboardingImpl, {
  name: "completeOnboarding",
});

/**
 * Polish spec §85 (Phase 29). Update team profile post-onboarding.
 * Edits team_name / colors / logo on public.profile. Team name
 * uniqueness is enforced by the DB's unique constraint — we catch
 * 23505 and surface a CONFLICT error.
 */
async function updateTeamProfileImpl(
  input: UpdateTeamProfileInput,
): Promise<ActionResult<undefined>> {
  const parsed = updateTeamProfileSchema.safeParse(input);
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
      UPDATE public.profile
      SET team_name = ${teamName}::text,
          team_color_primary = ${primaryColor}::text,
          team_color_secondary = ${secondaryColor}::text,
          team_logo_id = ${logoId}::text,
          updated_at = now()
      WHERE user_id = ${user.id}::uuid
    `);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "23505") {
      return {
        ok: false,
        error: { code: "CONFLICT", message: "That team name is already taken." },
      };
    }
    return {
      ok: false,
      error: { code: "INTERNAL", message: e.message ?? "Update failed." },
    };
  }

  revalidatePath("/", "layout");
  await captureServerEvent(user.id, "team_profile_updated", {
    team_name: teamName,
    logo_id: logoId,
  });
  return { ok: true, data: undefined };
}

export const updateTeamProfile = wrapAction(updateTeamProfileImpl, {
  name: "updateTeamProfile",
});
