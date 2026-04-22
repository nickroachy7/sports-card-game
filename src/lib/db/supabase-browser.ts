import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client. Split from `./supabase` so it can be
 * imported from `"use client"` modules without dragging in
 * `next/headers` (server-only) through the same file.
 */
export function createBrowserClient(): SupabaseClient {
  return createSsrBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
}
