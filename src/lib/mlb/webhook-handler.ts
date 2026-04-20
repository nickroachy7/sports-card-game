import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";

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
};

/**
 * Handler dispatch table.
 * M4 launches with stubs for game lifecycle + batter events; deeper
 * handlers (token-triggering) land alongside the live contest work in
 * Phase 3. Unknown event types still return `{ dispatched: false }` so
 * the caller parks them in webhook_failed for manual review.
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
  if (typeof bdlGameId === "number") {
    await getDb().execute(sql`
      UPDATE public.game
      SET status = 'live'::game_status, updated_at = now()
      WHERE bdl_game_id = ${bdlGameId}
    `);
  }
  return { dispatched: true, eventType: "mlb.game.started", providerEventId: null };
}

async function handleGameEnded(
  payload: WebhookPayload,
  _deliveryId: string,
): Promise<DispatchResult> {
  const bdlGameId = payload.game?.id;
  if (typeof bdlGameId === "number") {
    await getDb().execute(sql`
      UPDATE public.game
      SET status = 'final'::game_status, ended_at = now(), updated_at = now()
      WHERE bdl_game_id = ${bdlGameId}
    `);
  }
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
  const bdlGameId = payload.game?.id;
  if (typeof bdlGameId !== "number") {
    return {
      dispatched: false,
      eventType: payload.event_type ?? "unknown",
      providerEventId: null,
      note: "missing game.id",
    };
  }
  const providerEventId = `bdl:${deliveryId}`;
  const db = getDb();
  await db.execute(sql`
    INSERT INTO public.game_event (
      game_id, provider_event_id, event_type, source,
      inning, inning_half, batter_player_id, pitcher_player_id,
      play_type, play_text, score_value,
      home_score_after, away_score_after, raw_payload
    ) VALUES (
      (SELECT id FROM public.game WHERE bdl_game_id = ${bdlGameId}),
      ${providerEventId},
      ${payload.event_type ?? "unknown"},
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
  return { dispatched: true, eventType: payload.event_type ?? "unknown", providerEventId };
}
