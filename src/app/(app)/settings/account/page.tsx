import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/app/(app)/settings/account/change-password-form";
import { createServerClient } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

/**
 * Polish spec §86 (Phase 29). Account settings page. V1 scope:
 * show the auth email (read-only) + let the user change password.
 * Email change, OAuth link management, and account deletion are
 * out of scope for v1.
 */
export default async function AccountSettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">Settings</span>
        <h1 className="font-sans text-3xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-[var(--text-2)]">Manage your sign-in credentials.</p>
      </header>

      <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-xs uppercase tracking-wider text-[var(--text-3)]">Email</h2>
        <p className="font-mono text-sm text-[var(--text)]">{user.email ?? "—"}</p>
        <p className="text-xs text-[var(--text-3)]">
          Email changes are not supported in this release.
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-xs uppercase tracking-wider text-[var(--text-3)]">Change password</h2>
        <ChangePasswordForm />
      </section>
    </section>
  );
}
