"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signInSchema, signUpSchema } from "@/lib/contracts/auth";
import { createServerClient } from "@/lib/db/supabase";
import { captureServerEvent } from "@/lib/observability/action";

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * Polish spec §86 (Phase 29). Password change — current + new. We
 * re-verify the current password via signInWithPassword before
 * calling updateUser so stolen sessions can't reset the password.
 */
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters.")
      .max(72, "New password must be at most 72 characters."),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords don't match.",
    path: ["confirmPassword"],
  });

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ActionResult<undefined>> {
  const parsed = changePasswordSchema.safeParse(input);
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
  if (!user?.email) {
    return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." } };
  }

  // Re-authenticate to verify the current password. If this fails
  // the user typed it wrong — NOT a permissions issue.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError) {
    return {
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "Current password is incorrect." },
    };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (updateError) {
    return {
      ok: false,
      error: { code: "INTERNAL", message: updateError.message },
    };
  }

  await captureServerEvent(user.id, "password_changed", {});
  return { ok: true, data: undefined };
}

export async function signInWithPassword(
  formData: FormData,
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
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
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "Invalid email or password." },
    };
  }

  const redirectTo = (formData.get("redirectTo") as string | null) ?? "/lineup";
  revalidatePath("/", "layout");
  return { ok: true, data: { redirectTo } };
}

export async function signUpWithPassword(
  formData: FormData,
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
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
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) {
    const message = error.message.toLowerCase().includes("already")
      ? "An account with that email already exists."
      : error.message;
    return { ok: false, error: { code: "CONFLICT", message } };
  }

  if (!data.session) {
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message:
          "Account created but no session. Check Supabase Auth config (confirmations should be disabled).",
      },
    };
  }

  if (data.user) {
    await captureServerEvent(data.user.id, "signed_up", {
      provider: "email",
    });
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { redirectTo: "/onboarding" } };
}

export async function signOut(): Promise<never> {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/signin");
}

/**
 * Start an OAuth sign-in flow. The caller redirects to the returned URL,
 * Supabase handles the provider round-trip, and the user lands back at
 * /auth/callback which exchanges the code for a session.
 */
export async function signInWithOAuth(
  provider: "google" | "apple",
): Promise<ActionResult<{ url: string }>> {
  const supabase = await createServerClient();
  const site =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${site}/auth/callback`,
    },
  });
  if (error || !data.url) {
    return {
      ok: false,
      error: { code: "INTERNAL", message: error?.message ?? "OAuth init failed." },
    };
  }
  return { ok: true, data: { url: data.url } };
}
