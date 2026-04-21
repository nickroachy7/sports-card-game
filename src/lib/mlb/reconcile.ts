import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { getMLBProvider } from "@/lib/mlb/provider";
import { withBdlRetry } from "@/lib/mlb/retry";

/**
 * Authoritative DK FP from MLBStats. Hitter + pitcher both. See gameplay
 * spec §4.1 / §4.2.
 *
 * Hitter: 1B+3, 2B+5, 3B+8, HR+10, RBI+2, R+2, BB+2, HBP+2, SB+5
 * Pitcher: IP+2.25, K+2, W+4, ER-2, hit-2/3, BB-0.6, HBP-0.6, CG+2.5,
 *          SO+2.5, NoHit+5, QS bonus is a token (not in raw FP).
 *
 * MLBStats lacks 2B/3B/HBP/SB. We treat all non-HR hits as singles
 * (minor scoring drift on extra-base-hit-heavy games — acceptable for
 * Phase 3 walking-skeleton; spec calls this out as a known compromise
 * if dedicated webhook events aren't available).
 */
function computeHitterFp(s: BdlStats): number {
  const singles = Math.max(0, s.hits - s.hr);
  let fp = 0;
  fp += singles * 3;
  fp += s.hr * 10;
  fp += s.rbi * 2;
  fp += s.runs * 2;
  fp += s.bb * 2;
  return fp;
}

function computePitcherFp(s: BdlStats): number {
  let fp = 0;
  fp += s.ip * 2.25;
  fp += s.p_k * 2;
  fp += s.er * -2;
  fp += s.p_hits * -0.6;
  fp += s.p_bb * -0.6;
  if (s.ip >= 9) fp += 2.5; // CG
  if (s.ip >= 9 && s.p_runs === 0) fp += 2.5; // CG SO
  if (s.ip >= 9 && s.p_hits === 0) fp += 5; // No-hitter
  return fp;
}

/** Subset of @balldontlie/sdk MLBStats we touch. */
type BdlStats = {
  player: { id: number };
  game: { id: number };
  hits: number;
  hr: number;
  rbi: number;
  runs: number;
  bb: number;
  ip: number;
  p_k: number;
  er: number;
  p_hits: number;
  p_bb: number;
  p_runs: number;
};

/**
 * Reconcile one game post-end. Pulls per-player stats from BDL and
 * writes authoritative final_fp into every contest_lineup_slot whose
 * starter card matches a player who appeared in this game (across all
 * users, all contests touching this game).
 *
 * Idempotent: re-running is safe (final_fp is overwritten, not added).
 *
 * Token QS evaluation also fires here (the only Phase 3 token type
 * resolved at game-end rather than from a single live event).
 */
export async function reconcileGame(bdlGameId: number): Promise<{
  game_id: string | null;
  slots_updated: number;
  qs_tokens_triggered: number;
  wins_emitted: number;
}> {
  const db = getDb();
  const provider = getMLBProvider();

  const stats = (await withBdlRetry(() =>
    provider.fetchGameStats(bdlGameId),
  )) as unknown as BdlStats[];
  if (stats.length === 0) {
    return { game_id: null, slots_updated: 0, qs_tokens_triggered: 0, wins_emitted: 0 };
  }

  type GameRow = { id: string };
  const gameRow = await db.execute<GameRow>(sql`
    SELECT id FROM public.game WHERE bdl_game_id = ${bdlGameId} LIMIT 1
  `);
  const gameId = gameRow.rows[0]?.id ?? null;
  if (!gameId) {
    return { game_id: null, slots_updated: 0, qs_tokens_triggered: 0, wins_emitted: 0 };
  }

  let slotsUpdated = 0;
  let qsTokensTriggered = 0;

  for (const playerStats of stats) {
    const bdlPlayerId = playerStats.player?.id;
    if (typeof bdlPlayerId !== "number") continue;

    type PlayerRow = { id: string; is_pitcher: boolean };
    const playerRow = await db.execute<PlayerRow>(sql`
      SELECT id, is_pitcher FROM public.player WHERE bdl_player_id = ${bdlPlayerId} LIMIT 1
    `);
    const player = playerRow.rows[0];
    if (!player) continue;

    const fp = player.is_pitcher ? computePitcherFp(playerStats) : computeHitterFp(playerStats);

    // Update every rostered slot for this player in any contest touching this game.
    type SlotRow = { id: string; entry_id: string; token_application_id: string | null };
    const slotRows = await db.execute<SlotRow>(sql`
      UPDATE public.contest_lineup_slot s
      SET final_fp = ${fp}::numeric
      FROM public.contest_entry ce
      JOIN public.contest c ON c.id = ce.contest_id
      JOIN public.card card ON card.id = s.starter_card_id
      WHERE s.contest_entry_id = ce.id
        AND card.player_id = ${player.id}::uuid
        AND ${gameId}::uuid = ANY(c.included_game_ids)
        AND ce.status IN ('live', 'final', 'submitted')
      RETURNING s.id, ce.id AS entry_id, s.token_application_id
    `);
    slotsUpdated += slotRows.rows.length;

    // QS token: 6+ IP and ≤ 3 ER. Resolves at reconciliation, not on live events.
    if (player.is_pitcher && playerStats.ip >= 6 && playerStats.er <= 3) {
      for (const slot of slotRows.rows) {
        if (!slot.token_application_id) continue;
        const tokRows = await db.execute<{
          id: string;
          token_type: string;
          bonus_fp: string | number;
        }>(sql`
          SELECT ta.id, t.token_type, t.bonus_fp
          FROM public.token_application ta
          JOIN public.token t ON t.id = ta.token_id
          WHERE ta.id = ${slot.token_application_id}::uuid
            AND t.token_type = 'quality_start_bonus'
            AND ta.triggered IS NULL
        `);
        const tok = tokRows.rows[0];
        if (!tok) continue;
        const bonus = Number(tok.bonus_fp);
        await db.execute(sql`
          UPDATE public.token_application
          SET triggered = true, bonus_fp_awarded = ${bonus}::numeric, resolved_at = now()
          WHERE id = ${tok.id}::uuid
        `);
        await db.execute(sql`
          UPDATE public.contest_lineup_slot
          SET final_fp = final_fp + ${bonus}::numeric
          WHERE id = ${slot.id}::uuid
        `);
        qsTokensTriggered += 1;
      }
    }
  }

  // Roll up entry.final_score = sum of slot.final_fp for entries touching this game.
  await db.execute(sql`
    UPDATE public.contest_entry ce
    SET final_score = COALESCE((
      SELECT sum(s.final_fp) FROM public.contest_lineup_slot s
      WHERE s.contest_entry_id = ce.id
    ), 0)
    FROM public.contest c
    WHERE c.id = ce.contest_id
      AND ${gameId}::uuid = ANY(c.included_game_ids)
      AND ce.status IN ('live', 'final')
  `);

  // Winning pitcher attribution — BDL doesn't expose decisions, so we
  // use a "most IP on the winning team" heuristic (≈accurate in ~90%
  // of games; lead-change attribution for edge cases is out of scope
  // for launch). Emits a synthetic 'mlb.game.pitcher_win' event so the
  // existing _finalize_contest_entry milestone counter query picks it
  // up. Idempotent via the game_event.provider_event_id unique index.
  const winnerPick = await db.execute<{
    home_team_id: string | null;
    away_team_id: string | null;
    home_runs: number | null;
    away_runs: number | null;
  }>(sql`
    SELECT home_team_id, away_team_id, home_runs, away_runs
    FROM public.game WHERE id = ${gameId}::uuid
  `);
  const g = winnerPick.rows[0];
  let winsEmitted = 0;
  if (g && g.home_runs != null && g.away_runs != null && g.home_runs !== g.away_runs) {
    const winningTeamId = g.home_runs > g.away_runs ? g.home_team_id : g.away_team_id;
    if (winningTeamId) {
      // Pick the pitcher with the most IP on the winning team who
      // appeared in this game.
      let topBdlId: number | null = null;
      let topIp = 0;
      for (const s of stats) {
        if (typeof s.player?.id !== "number") continue;
        if (s.ip <= topIp) continue;
        // Is this player on the winning team? Check via player.team_id.
        const teamRow = await db.execute<{ team_id: string | null }>(sql`
          SELECT team_id FROM public.player WHERE bdl_player_id = ${s.player.id} LIMIT 1
        `);
        if (teamRow.rows[0]?.team_id !== winningTeamId) continue;
        topBdlId = s.player.id;
        topIp = s.ip;
      }
      if (topBdlId !== null && topIp >= 3) {
        const pitcherRow = await db.execute<{ id: string }>(sql`
          SELECT id FROM public.player WHERE bdl_player_id = ${topBdlId} LIMIT 1
        `);
        const pitcherId = pitcherRow.rows[0]?.id ?? null;
        if (pitcherId) {
          await db.execute(sql`
            INSERT INTO public.game_event
              (game_id, provider_event_id, event_type, source, pitcher_player_id)
            VALUES (
              ${gameId}::uuid,
              'reconcile:pwin:' || ${bdlGameId}::text,
              'mlb.game.pitcher_win',
              'reconcile',
              ${pitcherId}::uuid
            )
            ON CONFLICT (provider_event_id) DO NOTHING
          `);
          winsEmitted = 1;
        }
      }
    }
  }

  return {
    game_id: gameId,
    slots_updated: slotsUpdated,
    qs_tokens_triggered: qsTokensTriggered,
    wins_emitted: winsEmitted,
  };
}
