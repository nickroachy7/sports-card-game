import { type NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@/lib/db/supabase";
import {
  getLeaderboard,
  LEADERBOARD_TYPES,
  type LeaderboardType,
} from "@/lib/leaderboards/queries";

export const runtime = "nodejs";
export const revalidate = 60;

/**
 * API spec §4.2 — public leaderboard endpoint.
 *
 * GET /api/leaderboards/[type] where type ∈
 *   manager-level | season-fp | card-prestige | vault-prestige.
 *
 * Response:
 *   {
 *     data: {
 *       type,
 *       seasonId,      // null for non-seasonal boards
 *       top:  [ { rank, userId, teamName, managerLevel, metricValue } ],
 *       you:  <same shape> | null
 *     }
 *   }
 *
 * Cache: s-maxage=60, stale-while-revalidate=30 per spec.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ type: string }> },
): Promise<Response> {
  const { type } = await ctx.params;
  if (!LEADERBOARD_TYPES.includes(type as LeaderboardType)) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: `Unknown leaderboard type '${type}'.` } },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("per_page");
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10), 1), 100) : 100;

  // Caller identity (optional). If authenticated, the response includes
  // their rank — either inlined if within top N, or as the `you` field.
  let userId: string | null = null;
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Route is public — anon callers are fine.
  }

  try {
    const { seasonId, top, you } = await getLeaderboard(type as LeaderboardType, {
      userId,
      limit,
    });

    return NextResponse.json(
      { data: { type, seasonId, top, you } },
      {
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
        },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: { code: "INTERNAL", message: msg } }, { status: 500 });
  }
}
