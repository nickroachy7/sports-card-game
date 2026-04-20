import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/app/(auth)/onboarding/onboarding-form";
import { createServerClient } from "@/lib/db/supabase";

export const metadata: Metadata = {
  title: "Set up your team · Draft Deck",
};

export default async function OnboardingPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: profile } = await supabase
    .from("profile")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile) redirect("/lineup");

  return <OnboardingForm />;
}
