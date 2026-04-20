import { BalldontlieAPI } from "@balldontlie/sdk";

let cached: BalldontlieAPI | null = null;

/**
 * Module-scoped singleton. One axios instance per server runtime.
 * Reads BDL_API_KEY at call time (not module load) so missing-key errors
 * surface at the endpoint, not at cold-start.
 */
export function getBdlClient(): BalldontlieAPI {
  if (cached) return cached;
  const apiKey = process.env.BDL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "BDL_API_KEY is not set. Configure it in .env.local (dev) or Vercel env (prod).",
    );
  }
  cached = new BalldontlieAPI({ apiKey });
  return cached;
}

/** Resets the cached client. For tests. */
export function resetBdlClient(): void {
  cached = null;
}
