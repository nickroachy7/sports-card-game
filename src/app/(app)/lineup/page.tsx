import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { LineupView } from "@/app/(app)/lineup/lineup-view";
import type { LiveGameState } from "@/components/lineup/LiveEventsProvider";
import { TIER_PLAY_BUDGET } from "@/lib/card/tiers";
import type { CardTier, PackType, PlayerStatus, TokenType } from "@/lib/contracts/cards";
import type { AutoSubMode, LineupPosition } from "@/lib/contracts/lineup";
import { LINEUP_POSITIONS } from "@/lib/contracts/lineup";
import { getDb } from "@/lib/db/client";
import { createServerClient } from "@/lib/db/supabase";
import { fetchGameMatchupsById, fetchSlotGameByCardId } from "@/lib/lineup/fetch-slot-games";
import { applyGameStateTrustGate } from "@/lib/lineup/game-trust";
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

  // Polish spec §128 follow-up (Phase 40). Sweep any applied tokens
  // whose player's game is already final but `triggered` is still
  // null, marking them missed. Independent of entry.status so it
  // works even though Phase 39 removed the Submit flow that used to
  // flip entries to 'submitted'. Idempotent; cheap (single UPDATE
  // guarded by game-status filter).
  await db.execute(sql`SELECT public.reconcile_missed_tokens()`);

  // Post-P39 sweep: Submit button retired, so entries stay in
  // 'building' across slate-date rollovers. Yesterday's entry keeps
  // starter_card_id + token bindings indefinitely, which then
  // blocks today's quick-sell / vault on those cards ("card has an
  // applied token" from yesterday's ghost lineup). Release the
  // holds for any of the user's entries in contests OTHER than
  // today's. Cheap: bounded by user's historical entry count.
  await db.execute(sql`
    SELECT public.release_stale_contest_holds(${user.id}::uuid, ${contestId}::uuid)
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
    id: string;
    position: LineupPosition;
    starter_card_id: string | null;
    token_application_id: string | null;
    live_fp: string | number;
    final_fp: string | number;
    is_sticky: boolean;
  };
  const slotsRes = await db.execute<SlotRow>(sql`
    SELECT id, position, starter_card_id, token_application_id, live_fp, final_fp, is_sticky
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
    is_pending: boolean;
  };
  // §198 (Phase 49 Wave 2). is_pending tokens are limbo state — not
  // shown in the tray, but surfaced so the lineup-view can re-open
  // the resolve modal if a user closed mid-flow last session.
  const tokensRes = await db.execute<TokenRow>(sql`
    SELECT id, token_type, bonus_fp, applied_to_card_id, applied_to_contest_id, is_pending
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
      slotId: row?.id ?? "",
      position: pos,
      starterCardId: row?.starter_card_id ?? null,
      tokenApplicationId: row?.token_application_id ?? null,
      liveFp: Number(row?.live_fp ?? 0),
      finalFp: Number(row?.final_fp ?? 0),
      isSticky: row?.is_sticky ?? true,
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
    contractMax: TIER_PLAY_BUDGET[r.current_tier as CardTier],
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
  // Polish spec §208 (Phase 51). Per-game live snapshot fetched
  // alongside the matchup lookup. Hands the LiveEventsProvider its
  // initial state for `useLiveGameState` + the time-gate filter.
  const fetchGameStateById = async (gameIds: string[]): Promise<Record<string, LiveGameState>> => {
    if (gameIds.length === 0) return {};
    type Row = {
      id: string;
      status: LiveGameState["status"];
      scheduled_start: string | null;
      current_inning: number | null;
      current_inning_half: "top" | "bottom" | null;
      current_outs: number | null;
      home_runs: number | null;
      away_runs: number | null;
    };
    const res = await db.execute<Row>(sql`
      SELECT id, status, scheduled_start, current_inning, current_inning_half,
             current_outs, home_runs, away_runs
      FROM public.game
      WHERE id = ANY(${sql`ARRAY[${sql.join(
        gameIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]::uuid[]`})
    `);
    const out: Record<string, LiveGameState> = {};
    for (const r of res.rows) {
      // §213 (Phase 51 hotfix). Demote untrustworthy finals here too.
      // Mirrors the SQL CTE in fetchSlotGameByCardId; without this,
      // the LiveEventsProvider's initial seed renders raw bogus
      // finals before the realtime override (which also gates) kicks
      // in.
      out[r.id] = applyGameStateTrustGate({
        status: r.status,
        scheduledStart: r.scheduled_start,
        currentInning: r.current_inning,
        currentInningHalf: r.current_inning_half,
        currentOuts: r.current_outs,
        homeRuns: r.home_runs,
        awayRuns: r.away_runs,
      });
    }
    return out;
  };

  const [slotGameByCardId, gameMatchupById, gameStateById, packStateRes, econCfgRes] =
    await Promise.all([
      fetchSlotGameByCardId(
        contest.included_game_ids ?? [],
        cards.map((c) => ({ id: c.id, teamId: c.teamId })),
      ),
      fetchGameMatchupsById(contest.included_game_ids ?? []),
      fetchGameStateById(contest.included_game_ids ?? []),
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
    // Polish spec §195/§197 (Phase 49). Token cap + per-type
    // quicksell values surfaced to the tray + detail panel so they
    // don't need their own round-trip.
    token_cap?: number;
    token_quicksell_values?: Record<string, number>;
  } | null;
  const standardPackCost = Number(econCfg?.pack_prices_coins?.standard ?? 0);
  const tokenCap = Number(econCfg?.token_cap ?? 20);
  const tokenSellValueByType: Record<string, number> = econCfg?.token_quicksell_values ?? {};

  const tokens: LineupTokenVM[] = tokensRes.rows.map((r) => ({
    id: r.id,
    tokenType: r.token_type,
    bonusFp: Number(r.bonus_fp ?? 0),
    isPitcherToken: PITCHER_TOKEN_TYPES.has(r.token_type),
    appliedToCardId: r.applied_to_card_id,
    appliedToContestId: r.applied_to_contest_id,
    isPending: r.is_pending,
  }));
  // §199 — surface unresolved pending IDs so lineup-view can auto-
  // open the resolve modal if a previous session bailed mid-flow.
  const initialPendingTokenIds = tokens.filter((t) => t.isPending).map((t) => t.id);

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
  // Polish spec §140 (Phase 42). Format the slate date server-side in
  // ET so the sidebar doesn't need to worry about timezone drift.
  // Uses lineup_locks_at as the slate anchor (first game time in ET).
  const slateDate = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(contest.lineup_locks_at));

  return (
    <LineupView
      contestId={contest.id}
      slateDate={slateDate}
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
        triggered: a.triggered,
      }))}
      slotGameByCardId={slotGameByCardId}
      gameMatchupById={gameMatchupById}
      gameStateById={gameStateById}
      coinBalance={coinBalance}
      dailyPackReady={dailyPackReady}
      dailyPackSecondsUntilReady={dailyPackSecondsUntilReady}
      standardPackCost={standardPackCost}
      tokenCap={tokenCap}
      tokenSellValueByType={tokenSellValueByType}
      initialPendingTokenIds={initialPendingTokenIds}
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
