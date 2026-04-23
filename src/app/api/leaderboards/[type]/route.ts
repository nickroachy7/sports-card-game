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
 *   manager-level | season-fp | cards | vault-prestige.
 *
 * Response (discriminated on `kind`):
 *   {
 *     data: {
 *       type,
 *       kind: "user" | "card",
 *       seasonId,
 *       top:  [ <row shape per kind> ],
 *       you:  <same shape> | null
 *     }
 *   }
 *
 * User rows: `{ kind, rank, userId, teamName, managerLevel, metricValue }`.
 * Card rows: `{ kind, rank, cardId, playerName, tier, teamAbbreviation,
 *               careerFp, ownerUserId, ownerTeamName }`.
 *
 * The `cards` type (polish spec §83, Phase 29) ranks individual cards
 * across the community, replacing the old `card-prestige` user-based
 * ranking.
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
    const result = await getLeaderboard(type as LeaderboardType, {
      userId,
      limit,
    });

    return NextResponse.json(
      {
        data: {
          type,
          kind: result.kind,
          seasonId: result.seasonId,
          top: result.top,
          you: result.you,
        },
      },
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
