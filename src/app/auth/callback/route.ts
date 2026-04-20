import { type NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@/lib/db/supabase";

/**
 * OAuth + magic-link callback. Supabase redirects here with a `code`
 * search param; we exchange it for a session and drop the user into the
 * app. `next` is an optional destination (defaults to /lineup).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/lineup";

  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      url.pathname = "/signin";
      url.searchParams.set("error", "oauth_exchange_failed");
      return NextResponse.redirect(url);
    }
  }

  url.pathname = next;
  url.search = "";
  return NextResponse.redirect(url);
}
