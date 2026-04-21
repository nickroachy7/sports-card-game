import { NextResponse } from "next/server";

import { getPublicVaultByTeamName } from "@/lib/profile/queries";

export const runtime = "nodejs";
export const revalidate = 60;

/**
 * API spec §4.4 — public vault by team name, grouped by season.
 *
 * Returns { seasons: PublicVaultSeason[] }. 404 if team not found or
 * private.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ teamName: string }> },
): Promise<Response> {
  const { teamName } = await ctx.params;
  try {
    const seasons = await getPublicVaultByTeamName(decodeURIComponent(teamName));
    if (seasons === null) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Team not found or private." } },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { data: { seasons } },
      { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: { code: "INTERNAL", message: msg } }, { status: 500 });
  }
}
