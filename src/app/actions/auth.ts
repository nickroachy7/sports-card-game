"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { signInSchema, signUpSchema } from "@/lib/contracts/auth";
import { createServerClient } from "@/lib/db/supabase";

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

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
