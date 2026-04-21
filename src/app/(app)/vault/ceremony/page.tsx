import Link from "next/link";
import { redirect } from "next/navigation";
import { getVaultCeremonyPreview } from "@/app/actions/vault";
import { VaultCeremony } from "@/components/vault/VaultCeremony";
import { createServerClient } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

export default async function VaultCeremonyPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: season }, { data: profile }, { data: existingCommit }] = await Promise.all([
    supabase
      .from("season")
      .select("id, year, status")
      .in("status", ["offseason", "active"])
      .order("year", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profile")
      .select("team_name, team_color_primary, team_color_secondary")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("vault_entry").select("id").eq("user_id", user.id).limit(1),
  ]);

  if (!season || !profile) {
    return (
      <section className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
        <h1 className="font-sans text-3xl font-bold tracking-tight">Vault ceremony</h1>
        <p className="text-[var(--text-2)]">Onboarding not complete. Finish setup first.</p>
      </section>
    );
  }

  // Gate on ceremony window: only render if the active season is in
  // offseason AND the user has no vault_entry rows yet for any season
  // matching that season id. Simpler variant for launch: if the active
  // season is 'active', surface a "not open yet" notice.
  if (season.status !== "offseason") {
    return (
      <section className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
        <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
          {season.year} season
        </span>
        <h1 className="font-sans text-3xl font-bold tracking-tight">Ceremony not open yet</h1>
        <p className="text-sm text-[var(--text-2)]">
          The vault ceremony unlocks at season close. Keep building your team until then.
        </p>
        <Link
          href="/vault"
          className="self-start rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm hover:bg-[var(--surface-2)]"
        >
          ← back to vault
        </Link>
      </section>
    );
  }

  // Already committed? Send back to the vault.
  const already = (existingCommit ?? []).length > 0;
  if (already) {
    redirect("/vault");
  }

  const previewRes = await getVaultCeremonyPreview({ seasonId: season.id });
  if (!previewRes.ok) {
    return (
      <section className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
        <h1 className="font-sans text-3xl font-bold tracking-tight">Vault ceremony</h1>
        <p className="text-[var(--text-2)]">{previewRes.error.message}</p>
      </section>
    );
  }

  return (
    <VaultCeremony
      seasonId={season.id}
      seasonYear={season.year}
      teamName={profile.team_name}
      teamColorPrimary={profile.team_color_primary}
      teamColorSecondary={profile.team_color_secondary}
      preview={previewRes.data}
    />
  );
}
