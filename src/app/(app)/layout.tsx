import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { createServerClient } from "@/lib/db/supabase";

type DailyWindowResult = { ready: boolean };

function isDailyPackReady(claimedAtIso: string | null): DailyWindowResult {
  if (!claimedAtIso) return { ready: true };
  const claimed = new Date(claimedAtIso).getTime();
  const now = Date.now();
  return { ready: now - claimed >= 24 * 60 * 60 * 1000 };
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: profile }, { data: manager }, { data: seasonState }] = await Promise.all([
    supabase
      .from("profile")
      .select("team_name, team_color_primary, team_color_secondary, team_logo_id")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("manager_account")
      .select(
        "manager_level, manager_xp, lifetime_fp, lifetime_contests_won, lifetime_diamond_cards_vaulted, lifetime_tokens_triggered",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("user_season_state")
      .select("coins, daily_pack_claimed_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!profile) redirect("/onboarding");

  const { ready: dailyPackReady } = isDailyPackReady(seasonState?.daily_pack_claimed_at ?? null);

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
      <Header
        teamName={profile.team_name}
        primaryColor={profile.team_color_primary}
        secondaryColor={profile.team_color_secondary}
        coins={Number(seasonState?.coins ?? 0)}
        dailyPackReady={dailyPackReady}
        managerLevel={manager?.manager_level ?? 1}
        managerXp={Number(manager?.manager_xp ?? 0)}
        careerFp={Number(manager?.lifetime_fp ?? 0)}
        lifetimeContestsWon={manager?.lifetime_contests_won ?? 0}
        lifetimeDiamondCardsVaulted={manager?.lifetime_diamond_cards_vaulted ?? 0}
        lifetimeTokensTriggered={manager?.lifetime_tokens_triggered ?? 0}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
