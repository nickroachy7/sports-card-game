import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { reconcileGame } from "@/lib/mlb/reconcile";

export type WebhookPayload = {
  event_type?: string;
  game?: {
    id?: number;
    home_team_id?: number;
    away_team_id?: number;
    status?: string;
  };
  play?: {
    type?: string;
    text?: string;
    score_value?: number;
    inning?: number;
    inning_half?: string;
    /** Polish spec §64 — present on every batter event; used to
     *  update public.game.current_outs. */
    outs?: number;
    home_score?: number;
    away_score?: number;
  };
  batter?: { id?: number; name?: string };
  pitcher?: { id?: number; name?: string };
};

export type DispatchResult = {
  dispatched: boolean;
  eventType: string;
  /** If the handler wrote a game_event, the provider_event_id it used. */
  providerEventId: string | null;
  /** Set to the reason the handler didn't write a game_event. */
  note?: string;
  /**
   * True when `dispatched=false` because no handler is registered for
   * this event_type. Distinct from `dispatched=false` due to a
   * handler-side validation error (missing game.id, etc.). The
   * processor treats unhandled events as successful no-ops (no retry,
   * no webhook_failed row) because no amount of retrying will help.
   */
  unhandled?: boolean;
};

/**
 * Handler dispatch table.
 * Event types not in this registry are no-ops — BDL subscribes us to
 * more types (foulout, groundout, inning_half_ended, etc.) than we
 * model for scoring. Those deliveries return `{ unhandled: true }` and
 * the processor marks them as successfully processed rather than
 * failed.
 */
const HANDLERS: Record<
  string,
  (payload: WebhookPayload, deliveryId: string) => Promise<DispatchResult>
> = {
  "mlb.game.started": handleGameStarted,
  "mlb.game.ended": handleGameEnded,
  "mlb.game.extra_innings": handleGameEvent,
  "mlb.team.scored": handleGameEvent,
  "mlb.batter.hit": handleGameEvent,
  "mlb.batter.home_run": handleGameEvent,
  "mlb.batter.strikeout": handleGameEvent,
  "mlb.batter.walk": handleGameEvent,
  "mlb.batter.hit_by_pitch": handleGameEvent,
};

/** Dispatch a parsed webhook payload. Safe to call from the receiver or retry cron. */
export async function dispatchWebhook(
  payload: WebhookPayload,
  deliveryId: string,
): Promise<DispatchResult> {
  const eventType = payload.event_type ?? "unknown";
  const handler = HANDLERS[eventType];
  if (!handler) {
    return {
      dispatched: false,
      unhandled: true,
      eventType,
      providerEventId: null,
      note: "no handler for event_type",
    };
  }
  return handler(payload, deliveryId);
}

async function handleGameStarted(
  payload: WebhookPayload,
  _deliveryId: string,
): Promise<DispatchResult> {
  const bdlGameId = payload.game?.id;
  if (typeof bdlGameId !== "number") {
    return {
      dispatched: false,
      unhandled: true,
      eventType: "mlb.game.started",
      providerEventId: null,
      note: "missing game.id",
    };
  }
  const db = getDb();
  const res = await db.execute<{ id: string }>(sql`
    UPDATE public.game
    SET status = 'live'::game_status,
        -- Polish spec §54 (Phase 20): seed inning to T1 if not already
        -- populated. A prior batter event might have beaten the
        -- game.started delivery; don't stomp its value.
        current_inning = COALESCE(current_inning, 1),
        current_inning_half = COALESCE(current_inning_half, 'top'),
        -- Polish spec §64 (Phase 22): seed outs to 0 likewise.
        current_outs = COALESCE(current_outs, 0),
        updated_at = now()
    WHERE bdl_game_id = ${bdlGameId}
    RETURNING id
  `);
  if (res.rows.length === 0) {
    // Game not in our DB — BDL fires events for every MLB game. We
    // only care about games in active contests. Skip quietly.
    return {
      dispatched: false,
      unhandled: true,
      eventType: "mlb.game.started",
      providerEventId: null,
      note: `game ${bdlGameId} not in our db`,
    };
  }
  await db.execute(sql`
    SELECT public.mark_contest_entries_on_game_start(
      (SELECT id FROM public.game WHERE bdl_game_id = ${bdlGameId})
    )
  `);
  return { dispatched: true, eventType: "mlb.game.started", providerEventId: null };
}

async function handleGameEnded(
  payload: WebhookPayload,
  _deliveryId: string,
): Promise<DispatchResult> {
  const bdlGameId = payload.game?.id;
  if (typeof bdlGameId !== "number") {
    return {
      dispatched: false,
      unhandled: true,
      eventType: "mlb.game.ended",
      providerEventId: null,
      note: "missing game.id",
    };
  }
  const db = getDb();
  // Polish spec §192 (Phase 48). Use the unified time-only trust
  // gate `public.final_passes_time_check()`. Score-sanity portion
  // of the full predicate isn't applicable here — at the moment of
  // the status flip, scores haven't been reconciled yet (reconcile
  // runs after on success). The display CTE (§190) catches any
  // post-flip score corruption with the full predicate.
  const res = await db.execute<{ id: string }>(sql`
    UPDATE public.game
    SET status = 'final'::game_status,
        ended_at = now(),
        -- Polish spec §54 + §64 — clear live-inning + outs state;
        -- FINAL footer renders just the score, no trailing "T9 2O".
        current_inning = NULL,
        current_inning_half = NULL,
        current_outs = NULL,
        updated_at = now()
    WHERE bdl_game_id = ${bdlGameId}
      AND public.final_passes_time_check(scheduled_start)
    RETURNING id
  `);
  if (res.rows.length === 0) {
    // §193 — surface the violation reason via
    // `public.final_trust_violation_reason()` so the rejection note
    // grep-matches the same machine codes used in display + backfill.
    // The note lands in webhook_failed (we return unhandled=false so
    // the processor parks it for audit + retry).
    const exists = await db.execute<{
      id: string;
      reason: string | null;
    }>(sql`
      SELECT
        id,
        public.final_trust_violation_reason(
          'final'::game_status,
          scheduled_start,
          home_runs,
          away_runs
        ) AS reason
      FROM public.game WHERE bdl_game_id = ${bdlGameId}
    `);
    if (exists.rows.length === 0) {
      // Game not in our DB — BDL fires events for every MLB game,
      // we only model games in active contests. No retry helps.
      return {
        dispatched: false,
        unhandled: true,
        eventType: "mlb.game.ended",
        providerEventId: null,
        note: `game ${bdlGameId} not in our db`,
      };
    }
    const reason = exists.rows[0]?.reason ?? "unknown_violation";
    return {
      dispatched: false,
      unhandled: false,
      eventType: "mlb.game.ended",
      providerEventId: null,
      note: `final_trust_violation:${reason} (game ${bdlGameId})`,
    };
  }
  // Pull authoritative box score and overwrite final_fp on every
  // rostered slot. Best-effort — failures are logged but don't fail
  // the webhook so the vendor doesn't retry.
  try {
    await reconcileGame(bdlGameId);
  } catch (err) {
    console.error("[webhook] reconcileGame failed", { bdlGameId }, err);
  }
  await db.execute(sql`
    SELECT public.mark_contest_entries_on_game_end(
      (SELECT id FROM public.game WHERE bdl_game_id = ${bdlGameId})
    )
  `);
  return { dispatched: true, eventType: "mlb.game.ended", providerEventId: null };
}

/**
 * Generic game-event write for batter events + team scored + extra_innings.
 * provider_event_id is deterministic on (delivery_id) so retries don't
 * double-insert.
 */
async function handleGameEvent(
  payload: WebhookPayload,
  deliveryId: string,
): Promise<DispatchResult> {
  const eventType = payload.event_type ?? "unknown";
  const bdlGameId = payload.game?.id;
  if (typeof bdlGameId !== "number") {
    return {
      dispatched: false,
      unhandled: true,
      eventType,
      providerEventId: null,
      note: "missing game.id",
    };
  }
  const db = getDb();
  // Resolve the game row first so we can skip quietly when BDL fires
  // events for games we don't have in our DB (BDL sends every MLB
  // game; we only model games in active contests).
  const gameRow = await db.execute<{ id: string }>(sql`
    SELECT id FROM public.game WHERE bdl_game_id = ${bdlGameId} LIMIT 1
  `);
  const gameId = gameRow.rows[0]?.id;
  if (!gameId) {
    return {
      dispatched: false,
      unhandled: true,
      eventType,
      providerEventId: null,
      note: `game ${bdlGameId} not in our db`,
    };
  }
  const providerEventId = `bdl:${deliveryId}`;
  const inning = payload.play?.inning ?? null;
  const inningHalf = payload.play?.inning_half ?? null;
  await db.execute(sql`
    INSERT INTO public.game_event (
      game_id, provider_event_id, event_type, source,
      inning, inning_half, batter_player_id, pitcher_player_id,
      play_type, play_text, score_value,
      home_score_after, away_score_after, raw_payload
    ) VALUES (
      ${gameId}::uuid,
      ${providerEventId},
      ${eventType},
      'webhook',
      ${inning},
      ${inningHalf},
      ${payload.batter?.id ? sql`(SELECT id FROM public.player WHERE bdl_player_id = ${payload.batter.id})` : sql`NULL`},
      ${payload.pitcher?.id ? sql`(SELECT id FROM public.player WHERE bdl_player_id = ${payload.pitcher.id})` : sql`NULL`},
      ${payload.play?.type ?? null},
      ${payload.play?.text ?? null},
      ${payload.play?.score_value ?? null},
      ${payload.play?.home_score ?? null},
      ${payload.play?.away_score ?? null},
      ${JSON.stringify(payload)}::jsonb
    )
    ON CONFLICT (provider_event_id) DO NOTHING
  `);

  // Polish spec §54 — live inning on public.game. Idempotent via
  // IS DISTINCT FROM: Postgres only touches the row when the inning
  // or half actually changes, so Realtime broadcasts are the
  // signal-only set (~half-inning transitions, ~18/game).
  // Polish spec §64 (Phase 22) — same treatment for outs. BDL's
  // play.outs is the inning-state count; handler uses IS DISTINCT
  // FROM so reps with no out change are UPDATE-free.
  const outs = payload.play?.outs ?? null;
  if (inning !== null || inningHalf !== null || outs !== null) {
    await db.execute(sql`
      UPDATE public.game
      SET current_inning = COALESCE(${inning}::int, current_inning),
          current_inning_half = COALESCE(${inningHalf}, current_inning_half),
          current_outs = COALESCE(${outs}::smallint, current_outs),
          updated_at = now()
      WHERE id = ${gameId}::uuid
        AND status = 'live'
        AND (
          (${inning}::int IS NOT NULL AND current_inning IS DISTINCT FROM ${inning}::int)
          OR (${inningHalf}::text IS NOT NULL AND current_inning_half IS DISTINCT FROM ${inningHalf})
          OR (${outs}::smallint IS NOT NULL AND current_outs IS DISTINCT FROM ${outs}::smallint)
        )
    `);
  }

  // Polish spec §214 (Phase 52). Update game.home_runs / away_runs
  // from the event payload's running scoreboard. Pre-P52 the score
  // columns only got populated at game-end via reconcile, which left
  // the LIVE pill stuck on 0-0 for the entire game in BDL's sandbox
  // (and even for live prod games until the box-score reconcile
  // landed). Use IS DISTINCT FROM to keep updates idempotent —
  // realtime broadcasts only when the score actually changes.
  const homeScore = payload.play?.home_score ?? null;
  const awayScore = payload.play?.away_score ?? null;
  if (homeScore !== null || awayScore !== null) {
    await db.execute(sql`
      UPDATE public.game
      SET home_runs = COALESCE(${homeScore}::int, home_runs),
          away_runs = COALESCE(${awayScore}::int, away_runs),
          updated_at = now()
      WHERE id = ${gameId}::uuid
        AND status IN ('live', 'final')
        AND (
          (${homeScore}::int IS NOT NULL AND home_runs IS DISTINCT FROM ${homeScore}::int)
          OR (${awayScore}::int IS NOT NULL AND away_runs IS DISTINCT FROM ${awayScore}::int)
        )
    `);
  }

  return { dispatched: true, eventType, providerEventId };
}
