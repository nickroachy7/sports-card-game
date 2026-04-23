import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { type CollectionCard, CollectionGrid } from "@/app/(app)/collection/collection-grid";
import type { CardTier, PlayerStatus, TokenType } from "@/lib/contracts/cards";
import { getDb } from "@/lib/db/client";
import { createServerClient } from "@/lib/db/supabase";
import { fetchSlotGameByCardId } from "@/lib/lineup/fetch-slot-games";
import type { SlotGameInfo } from "@/lib/lineup/types";
import { mlbamHeadshotUrl } from "@/lib/mlb/mlbam-headshot";
import { captureServerEvent } from "@/lib/observability/action";
import { getTeamSummary } from "@/lib/profile/team-summary";

export const dynamic = "force-dynamic";

type RawRow = {
  id: string;
  career_fp_total: string | number;
  current_tier: CardTier;
  contract_plays_remaining: number;
  is_expired: boolean;
  applied_token_id: string | null;
  acquired_at: string;
  player:
    | {
        full_name: string;
        positions: string[] | null;
        status: PlayerStatus;
        mlbam_id: number | null;
        team: { id: string; abbreviation: string } | { id: string; abbreviation: string }[] | null;
      }
    | {
        full_name: string;
        positions: string[] | null;
        status: PlayerStatus;
        mlbam_id: number | null;
        team: unknown;
      }[]
    | null;
};

type AppliedTokenRow = {
  id: string;
  token_type: TokenType;
  bonus_fp: string | number;
  applied_to_card_id: string | null;
};

type AppliedRow = {
  id: string;
  token_id: string;
  card_id: string;
};

export default async function CollectionPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: cardRows }, cfgRes, { data: tokenRows }, { data: applicationRows }] =
    await Promise.all([
      supabase
        .from("card")
        .select(
          `id, career_fp_total, current_tier, contract_plays_remaining, is_expired,
         applied_token_id, acquired_at,
         player:player_id ( full_name, positions, status, mlbam_id, team:team_id ( id, abbreviation ) )`,
        )
        .eq("user_id", user.id)
        .eq("is_vaulted", false)
        .order("current_tier", { ascending: false })
        .order("career_fp_total", { ascending: false })
        .returns<RawRow[]>(),
      supabase.rpc("get_active_economy_config").single(),
      supabase
        .from("token")
        .select("id, token_type, bonus_fp, applied_to_card_id")
        .eq("user_id", user.id)
        .is("consumed_at", null)
        .not("applied_to_card_id", "is", null)
        .returns<AppliedTokenRow[]>(),
      supabase
        .from("token_application")
        .select("id, token_id, card_id")
        .eq("user_id", user.id)
        .returns<AppliedRow[]>(),
    ]);
  const cfg = cfgRes.data as { collection_cap?: number | string } | null;

  // Build a map: cardId -> applied token meta (type, bonus, applicationId).
  // token_application is owner-scoped; card_id is set to the most recent
  // applied card. We also match against token.applied_to_card_id for
  // currency (the field is kept in sync by apply_token / remove_token).
  const applicationsByCard = new Map<string, { id: string; tokenId: string }>();
  for (const a of applicationRows ?? []) {
    applicationsByCard.set(a.card_id, { id: a.id, tokenId: a.token_id });
  }
  const tokensById = new Map<string, AppliedTokenRow>();
  for (const t of tokenRows ?? []) tokensById.set(t.id, t);

  const cards: CollectionCard[] = (cardRows ?? []).map((row) => {
    const player = Array.isArray(row.player) ? row.player[0] : row.player;
    const team = player
      ? Array.isArray(player.team)
        ? player.team[0]
        : (player.team as { id: string; abbreviation: string } | null)
      : null;
    const positions = player?.positions ?? [];

    let appliedToken: CollectionCard["appliedToken"];
    if (row.applied_token_id) {
      const tok = tokensById.get(row.applied_token_id);
      const app = applicationsByCard.get(row.id);
      if (tok && app) {
        appliedToken = {
          tokenType: tok.token_type,
          bonusFp: Number(tok.bonus_fp ?? 0),
          applicationId: app.id,
        };
      }
    }

    return {
      id: row.id,
      playerName: player?.full_name ?? "Unknown",
      position: positions[0] ?? null,
      positions,
      teamId: team?.id ?? null,
      teamAbbreviation: team?.abbreviation ?? null,
      tier: row.current_tier,
      careerFp: Number(row.career_fp_total ?? 0),
      contractPlays: row.contract_plays_remaining,
      contractMax: 15,
      playerStatus: player?.status ?? "active",
      isExpired: row.is_expired,
      hasAppliedToken: row.applied_token_id !== null,
      appliedToken,
      photoUrl: player?.mlbam_id ? mlbamHeadshotUrl(player.mlbam_id, "medium") : null,
      acquiredAt: row.acquired_at,
    };
  });

  // Polish spec §63 (Phase 22) — per-card today's-game info for the
  // collection's game-state filter chips. Same helper the lineup page
  // uses; scoped to today's contest slate (create_daily_contest is
  // idempotent + cheap). We skip this if the user has no cards at
  // all to avoid a pointless round-trip.
  let slotGameByCardId: Record<string, SlotGameInfo> = {};
  if (cards.length > 0) {
    const db = getDb();
    type ContestRow = { id: string; included_game_ids: string[] | null };
    const contestRes = await db.execute<{ create_daily_contest: string }>(sql`
      SELECT public.create_daily_contest() AS create_daily_contest
    `);
    const contestId = contestRes.rows[0]?.create_daily_contest;
    if (contestId) {
      const contestMeta = await db.execute<ContestRow>(sql`
        SELECT id, included_game_ids FROM public.contest WHERE id = ${contestId}::uuid
      `);
      const gameIds = contestMeta.rows[0]?.included_game_ids ?? [];
      slotGameByCardId = await fetchSlotGameByCardId(
        gameIds,
        cards.map((c) => ({ id: c.id, teamId: c.teamId })),
      );
    }
  }

  const collectionCap = Number(cfg?.collection_cap ?? 100);

  // Polish spec §88 (Phase 30). Fetch team summary + active-contest
  // snapshot so the unified AppSidebar renders on /collection with
  // the same top block as /lineup. If the user has no entry today
  // the sidebar shows a "no active contest" placeholder.
  const [teamSummary, contestSnapshot] = await Promise.all([
    getTeamSummary(user.id).then(
      (s) =>
        s ?? {
          teamName: "",
          totalCareerFp: 0,
          vaultedCardsCount: 0,
          vaultValueTotal: 0,
        },
    ),
    fetchActiveContestSnapshot(user.id),
  ]);

  // Fire & forget — server-side page view. PostHog also auto-captures a
  // client $pageview from the provider, but this gives us a server-side
  // "collection_viewed" with card-count properties for funnel analysis.
  await captureServerEvent(user.id, "collection_viewed", {
    card_count: cards.length,
    collection_cap: collectionCap,
  });

  return (
    <CollectionGrid
      cards={cards}
      collectionCap={collectionCap}
      slotGameByCardId={slotGameByCardId}
      teamSummary={teamSummary}
      contestSnapshot={contestSnapshot}
    />
  );
}

/**
 * Polish spec §88 (Phase 30). Minimal read-only snapshot of the
 * user's current contest entry for the collection-page sidebar.
 * Returns null if no active contest or no entry today. The sidebar
 * falls back to a "no active contest" placeholder when null.
 */
async function fetchActiveContestSnapshot(userId: string): Promise<{
  contestName: string;
  entryStatus: "building" | "submitted" | "live" | "final";
  lockCountdown: string;
  liveScore: number;
  finalScore: number;
} | null> {
  type Row = {
    contest_name: string;
    lineup_locks_at: string;
    entry_status: "building" | "submitted" | "live" | "final";
    live_score: string | number;
    final_score: string | number;
  };
  const res = await getDb().execute<Row>(sql`
    SELECT
      c.name AS contest_name,
      c.lineup_locks_at,
      ce.status AS entry_status,
      ce.live_score,
      ce.final_score
    FROM public.contest_entry ce
    JOIN public.contest c ON c.id = ce.contest_id
    WHERE ce.user_id = ${userId}::uuid
      AND c.date = public.current_slate_date()
    ORDER BY c.created_at DESC
    LIMIT 1
  `);
  const row = res.rows[0];
  if (!row) return null;
  return {
    contestName: row.contest_name,
    entryStatus: row.entry_status,
    lockCountdown: formatLockCountdown(row.lineup_locks_at),
    liveScore: Number(row.live_score),
    finalScore: Number(row.final_score),
  };
}

/** Minimal countdown formatter shared with LineupView's useLockCountdown. */
function formatLockCountdown(lockIso: string): string {
  const delta = new Date(lockIso).getTime() - Date.now();
  if (delta <= 0) return "past lock time";
  const hours = Math.floor(delta / 3_600_000);
  const mins = Math.floor((delta % 3_600_000) / 60_000);
  if (hours > 24) return `${Math.floor(hours / 24)}d`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
