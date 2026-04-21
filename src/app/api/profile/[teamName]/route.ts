import { NextResponse } from "next/server";

import { getPublicProfileByTeamName } from "@/lib/profile/queries";

export const runtime = "nodejs";
export const revalidate = 60;

/**
 * API spec §4.3 — public profile by team name.
 *
 * Returns { profile, managerAccount, currentSeasonStats, vaultSummary }
 * collapsed into a single payload. is_public must be true (default).
 * Cache: s-maxage=60.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ teamName: string }> },
): Promise<Response> {
  const { teamName } = await ctx.params;
  try {
    const profile = await getPublicProfileByTeamName(decodeURIComponent(teamName));
    if (!profile) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Team not found or private." } },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { data: profile },
      { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: { code: "INTERNAL", message: msg } }, { status: 500 });
  }
}
