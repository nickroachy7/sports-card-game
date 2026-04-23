import { redirect } from "next/navigation";

import { TeamSettingsForm } from "@/app/(app)/settings/team/team-settings-form";
import { LOGO_LIBRARY } from "@/lib/contracts/profile";
import { createServerClient } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

/**
 * Polish spec §85 (Phase 29). Team customization page. Linked from
 * the ProfileDrawer quick links. Lets users edit their team name,
 * primary/secondary colors, and logo after onboarding.
 *
 * The form itself is a client component so it can manage transient
 * state + call the updateTeamProfile server action. We fetch the
 * current values here so defaults render server-side.
 */
export default async function TeamSettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: profile } = await supabase
    .from("profile")
    .select("team_name, team_color_primary, team_color_secondary, team_logo_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const currentLogo = LOGO_LIBRARY.includes(profile.team_logo_id as (typeof LOGO_LIBRARY)[number])
    ? (profile.team_logo_id as (typeof LOGO_LIBRARY)[number])
    : LOGO_LIBRARY[0];

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">Settings</span>
        <h1 className="font-sans text-3xl font-bold tracking-tight">Team customization</h1>
        <p className="text-sm text-[var(--text-2)]">
          Change your team name, colors, and logo. Your team name must be unique across Draft Deck.
        </p>
      </header>

      <TeamSettingsForm
        initialTeamName={profile.team_name}
        initialPrimaryColor={profile.team_color_primary}
        initialSecondaryColor={profile.team_color_secondary}
        initialLogoId={currentLogo}
      />
    </section>
  );
}
