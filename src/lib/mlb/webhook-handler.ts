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
    SET status = 'live'::game_status, updated_at = now()
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
  const res = await db.execute<{ id: string }>(sql`
    UPDATE public.game
    SET status = 'final'::game_status, ended_at = now(), updated_at = now()
    WHERE bdl_game_id = ${bdlGameId}
    RETURNING id
  `);
  if (res.rows.length === 0) {
    return {
      dispatched: false,
      unhandled: true,
      eventType: "mlb.game.ended",
      providerEventId: null,
      note: `game ${bdlGameId} not in our db`,
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
      ${payload.play?.inning ?? null},
      ${payload.play?.inning_half ?? null},
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
  return { dispatched: true, eventType, providerEventId };
}
