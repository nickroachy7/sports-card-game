import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getServerEnv } from "@/lib/env";

// Browser client lives in `./supabase-browser` so importing it from a
// "use client" module doesn't drag in `next/headers` (server-only).

/**
 * Server-side Supabase client for Server Components, Server Actions, and
 * Route Handlers. Reads + refreshes the session cookie on each request.
 *
 * Note: mutating cookies from a Server Component is not allowed by Next.js
 * in stable App Router. We swallow the setAll error in that case — the
 * middleware (src/middleware.ts) is the canonical place the session cookie
 * is actually rotated. This fallback pattern is the Supabase-recommended
 * shape for Next 15 App Router.
 */
export async function createServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getServerEnv();

  return createSsrServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Ignored: set() is not permitted from Server Components.
          // Middleware handles cookie rotation for the request lifecycle.
        }
      },
    },
  });
}

/**
 * Server-side Supabase client using the service role key. Bypasses RLS.
 * ONLY use from trusted code paths (cron endpoints, webhook receivers,
 * admin actions that have their own auth check). Never expose to the
 * browser and never call from a route that serves user-driven input
 * without an explicit authorization check first.
 */
export function createServiceRoleClient(): SupabaseClient {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
  return createSsrServerClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    cookies: {
      getAll: () => [],
      setAll: () => undefined,
    },
  });
}

/** Returns the current auth user or null. Server-only. */
export async function getCurrentUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
