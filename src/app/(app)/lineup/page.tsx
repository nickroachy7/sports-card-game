import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { LineupView } from "@/app/(app)/lineup/lineup-view";
import type { CardTier, PackType, PlayerStatus, TokenType } from "@/lib/contracts/cards";
import type { AutoSubMode, LineupPosition } from "@/lib/contracts/lineup";
import { LINEUP_POSITIONS } from "@/lib/contracts/lineup";
import { getDb } from "@/lib/db/client";
import { createServerClient } from "@/lib/db/supabase";
import { fetchGameMatchupsById, fetchSlotGameByCardId } from "@/lib/lineup/fetch-slot-games";
import type { LineupCardVM, LineupSlotVM, LineupTokenVM } from "@/lib/lineup/types";
import { mlbamHeadshotUrl } from "@/lib/mlb/mlbam-headshot";

export const dynamic = "force-dynamic";

const PITCHER_TOKEN_TYPES: Set<TokenType> = new Set(["strikeout_bonus", "quality_start_bonus"]);

export default async function LineupPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const db = getDb();

  // Ensure today's contest exists (idempotent) + get its id.
  // Polish spec §50 — defaulting to public.current_slate_date() lets the
  // fn pick the ET-aware slate (4 AM ET pivot). Also refreshes
  // included_game_ids on each call (spec §51).
  const contestRes = await db.execute<{ create_daily_contest: string }>(sql`
    SELECT public.create_daily_contest() AS create_daily_contest
  `);
  const contestId = contestRes.rows[0]?.create_daily_contest;
  if (!contestId) {
    return <EmptyLineupState message="No active season configured." />;
  }

  // Ensure user's entry exists (idempotent).
  await db.execute(sql`
    SELECT public.create_contest_entry(${user.id}::uuid, ${contestId}::uuid)
  `);

  type ContestRow = {
    id: string;
    name: string;
    lineup_locks_at: string;
    included_game_ids: string[] | null;
  };
  const contestMeta = await db.execute<ContestRow>(sql`
    SELECT id, name, lineup_locks_at, included_game_ids
    FROM public.contest WHERE id = ${contestId}::uuid
  `);
  const contest = contestMeta.rows[0];
  if (!contest) {
    return <EmptyLineupState message="Couldn't load contest." />;
  }

  type EntryRow = {
    id: string;
    status: "building" | "submitted" | "live" | "final";
    auto_sub_mode: AutoSubMode;
    live_score: string | number;
    final_score: string | number;
  };
  const entryRes = await db.execute<EntryRow>(sql`
    SELECT id, status, auto_sub_mode, live_score, final_score
    FROM public.contest_entry
    WHERE user_id = ${user.id}::uuid AND contest_id = ${contestId}::uuid
  `);
  const entry = entryRes.rows[0];
  if (!entry) {
    return <EmptyLineupState message="Couldn't load lineup entry." />;
  }

  type SlotRow = {
    position: LineupPosition;
    starter_card_id: string | null;
    token_application_id: string | null;
    live_fp: string | number;
    final_fp: string | number;
  };
  const slotsRes = await db.execute<SlotRow>(sql`
    SELECT position, starter_card_id, token_application_id, live_fp, final_fp
    FROM public.contest_lineup_slot
    WHERE contest_entry_id = ${entry.id}::uuid
  `);

  type CardRow = {
    id: string;
    player_id: string;
    player_name: string;
    positions: string[] | null;
    team_id: string | null;
    team_abbreviation: string | null;
    status: PlayerStatus;
    is_pitcher: boolean;
    mlbam_id: number | null;
    current_tier: CardTier;
    career_fp_total: string | number;
    contract_plays_remaining: number;
    is_expired: boolean;
    applied_token_id: string | null;
  };
  const cardsRes = await db.execute<CardRow>(sql`
    SELECT
      c.id, c.player_id,
      p.full_name AS player_name,
      p.positions, p.status, p.is_pitcher, p.mlbam_id,
      p.team_id,
      t.abbreviation AS team_abbreviation,
      c.current_tier, c.career_fp_total, c.contract_plays_remaining,
      c.is_expired, c.applied_token_id
    FROM public.card c
    JOIN public.player p ON p.id = c.player_id
    LEFT JOIN public.team t ON t.id = p.team_id
    WHERE c.user_id = ${user.id}::uuid AND c.is_vaulted = false
    ORDER BY p.is_pitcher ASC, p.full_name ASC
  `);

  type TokenRow = {
    id: string;
    token_type: TokenType;
    bonus_fp: string | number;
    applied_to_card_id: string | null;
    applied_to_contest_id: string | null;
  };
  const tokensRes = await db.execute<TokenRow>(sql`
    SELECT id, token_type, bonus_fp, applied_to_card_id, applied_to_contest_id
    FROM public.token
    WHERE user_id = ${user.id}::uuid AND consumed_at IS NULL
    ORDER BY created_at DESC
  `);

  type AppRow = {
    id: string;
    token_id: string;
    card_id: string;
    triggered: boolean | null;
    bonus_fp_awarded: string | number;
  };
  const appsRes = await db.execute<AppRow>(sql`
    SELECT id, token_id, card_id, triggered, bonus_fp_awarded
    FROM public.token_application
    WHERE user_id = ${user.id}::uuid AND contest_id = ${contestId}::uuid
  `);

  const slots: LineupSlotVM[] = LINEUP_POSITIONS.map((pos) => {
    const row = slotsRes.rows.find((r) => r.position === pos);
    return {
      position: pos,
      starterCardId: row?.starter_card_id ?? null,
      tokenApplicationId: row?.token_application_id ?? null,
      liveFp: Number(row?.live_fp ?? 0),
      finalFp: Number(row?.final_fp ?? 0),
    };
  });

  const cards: LineupCardVM[] = cardsRes.rows.map((r) => ({
    id: r.id,
    playerId: r.player_id,
    playerName: r.player_name,
    position: r.positions && r.positions.length > 0 ? (r.positions[0] ?? null) : null,
    positions: r.positions ?? [],
    teamId: r.team_id,
    teamAbbreviation: r.team_abbreviation,
    tier: r.current_tier,
    careerFp: Number(r.career_fp_total ?? 0),
    contractPlays: r.contract_plays_remaining,
    contractMax: 15,
    playerStatus: r.status,
    isExpired: r.is_expired,
    hasAppliedToken: r.applied_token_id !== null,
    isPitcher: r.is_pitcher,
    appliedTokenId: r.applied_token_id,
    photoUrl: r.mlbam_id ? mlbamHeadshotUrl(r.mlbam_id, "small") : null,
  }));

  // Polish spec §45 — per-card today's game info. Shared helper; see
  // `fetchSlotGameByCardId` for the DISTINCT ON + has_double_header
  // derivation. The Collection page uses the same helper so its
  // per-card "has game today" filter reads from the same source.
  //
  // Polish spec §69 (Phase 23) — per-game matchup lookup for the
  // Event Feed chip. Runs in parallel with the slot-game query since
  // they're independent reads.
  // Polish spec §100 (Phase 34). Team summary was cut from the
  // sidebar; header + profile drawer already surface team identity
  // and career stats. Query dropped.
  //
  // Polish spec §109 (Phase 36). Buy-packs modal state — coin
  // balance, daily-pack readiness, standard pack cost. Fetched
  // alongside the game queries so the modal has everything it
  // needs on first render.
  const [slotGameByCardId, gameMatchupById, packStateRes, econCfgRes] = await Promise.all([
    fetchSlotGameByCardId(
      contest.included_game_ids ?? [],
      cards.map((c) => ({ id: c.id, teamId: c.teamId })),
    ),
    fetchGameMatchupsById(contest.included_game_ids ?? []),
    supabase
      .from("user_season_state")
      .select("coins, daily_pack_claimed_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.rpc("get_active_economy_config").single(),
  ]);

  const packState = packStateRes.data ?? null;
  const coinBalance = Number(packState?.coins ?? 0);
  const dailyClaimedAt = packState?.daily_pack_claimed_at
    ? new Date(packState.daily_pack_claimed_at)
    : null;
  const dailyReadyAtMs = dailyClaimedAt ? dailyClaimedAt.getTime() + 24 * 60 * 60 * 1000 : null;
  const dailyPackReady = dailyReadyAtMs === null || dailyReadyAtMs <= Date.now();
  const dailyPackSecondsUntilReady =
    dailyReadyAtMs && dailyReadyAtMs > Date.now()
      ? Math.ceil((dailyReadyAtMs - Date.now()) / 1000)
      : 0;
  const econCfg = (econCfgRes.data ?? null) as {
    pack_prices_coins?: Record<PackType, number>;
  } | null;
  const standardPackCost = Number(econCfg?.pack_prices_coins?.standard ?? 0);

  const tokens: LineupTokenVM[] = tokensRes.rows.map((r) => ({
    id: r.id,
    tokenType: r.token_type,
    bonusFp: Number(r.bonus_fp ?? 0),
    isPitcherToken: PITCHER_TOKEN_TYPES.has(r.token_type),
    appliedToCardId: r.applied_to_card_id,
    appliedToContestId: r.applied_to_contest_id,
  }));

  const tokenApplications = appsRes.rows.map((r) => ({
    id: r.id,
    tokenId: r.token_id,
    cardId: r.card_id,
    triggered: r.triggered,
    bonusFpAwarded: Number(r.bonus_fp_awarded ?? 0),
  }));

  // Unified rendering across building / submitted / live / final.
  // The view itself switches chrome per spec §16 — sidebar morphs from
  // Readiness/Projected/Auto-sub/Submit to Live Score/Box Score/Event
  // Feed/Status chip when entry.status !== 'building'. Bench + tokens
  // stay visible but become non-interactive once locked.
  return (
    <LineupView
      contestId={contest.id}
      contestName={contest.name}
      lineupLocksAt={contest.lineup_locks_at}
      entryId={entry.id}
      entryStatus={entry.status}
      autoSubMode={entry.auto_sub_mode}
      liveScore={Number(entry.live_score)}
      finalScore={Number(entry.final_score)}
      contestGameIds={contest.included_game_ids ?? []}
      slots={slots}
      cards={cards}
      tokens={tokens}
      tokenApplications={tokenApplications.map((a) => ({
        id: a.id,
        tokenId: a.tokenId,
        cardId: a.cardId,
      }))}
      slotGameByCardId={slotGameByCardId}
      gameMatchupById={gameMatchupById}
      coinBalance={coinBalance}
      dailyPackReady={dailyPackReady}
      dailyPackSecondsUntilReady={dailyPackSecondsUntilReady}
      standardPackCost={standardPackCost}
    />
  );
}

function EmptyLineupState({ message }: { message: string }) {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-16 text-center">
      <h1 className="font-sans text-2xl font-bold tracking-tight text-[var(--text)]">Lineup</h1>
      <p className="text-sm text-[var(--text-2)]">{message}</p>
      <a
        href="/shop"
        className="text-sm font-medium text-[var(--text)] underline-offset-4 hover:underline"
      >
        Visit Shop
      </a>
    </section>
  );
}
