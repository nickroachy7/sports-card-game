import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";

import { dispatchWebhook, type WebhookPayload } from "./webhook-handler";

export type ProcessInput = {
  deliveryId: string;
  eventType: string | null;
  rawBody: string;
  signature?: string | null;
  providerEventId?: string | null;
};

export type ProcessResult =
  | { outcome: "already_processed" }
  | { outcome: "processed"; eventType: string }
  | { outcome: "failed"; eventType: string; error: string };

/**
 * Idempotent end-to-end webhook processor. Used by both the HTTP
 * receiver and the retry cron.
 *
 *   1. UPSERT into webhook_delivery keyed by delivery_id. If the row
 *      already has status='processed', short-circuit with
 *      `already_processed`.
 *   2. Parse the raw body as JSON and dispatch to the handler.
 *   3. On success, set webhook_delivery.status='processed'.
 *   4. On any failure, append to webhook_failed with retry bookkeeping
 *      and set webhook_delivery.status='failed'. Returns
 *      `{ outcome: 'failed' }` so the caller can log but still return 200
 *      to the vendor.
 */
export async function processWebhook(input: ProcessInput): Promise<ProcessResult> {
  const db = getDb();

  const existing = await db.execute<{ status: string }>(sql`
    SELECT status FROM public.webhook_delivery WHERE delivery_id = ${input.deliveryId}
  `);
  const prior = existing.rows[0];
  if (prior?.status === "processed") {
    return { outcome: "already_processed" };
  }

  // Parse first so webhook_delivery.event_type reflects the body's
  // event_type, not just the (often-absent) x-bdl-webhook-event-type
  // header. BDL delivers the event_type in the body.
  let parsed: WebhookPayload | null = null;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(input.rawBody) as WebhookPayload;
  } catch (err) {
    parseError = err instanceof Error ? err.message : "invalid JSON";
  }
  const eventType = parsed?.event_type ?? input.eventType ?? "unknown";

  if (!prior) {
    await db.execute(sql`
      INSERT INTO public.webhook_delivery (
        delivery_id, event_type, status, raw_payload,
        provider_event_id, signature
      ) VALUES (
        ${input.deliveryId},
        ${eventType},
        'received'::webhook_status,
        ${input.rawBody}::jsonb,
        ${input.providerEventId ?? null},
        ${input.signature ?? null}
      )
      ON CONFLICT (delivery_id) DO NOTHING
    `);
  }

  if (!parsed) {
    await recordFailure(input, eventType, parseError ?? "invalid JSON");
    return { outcome: "failed", eventType, error: parseError ?? "invalid JSON" };
  }

  try {
    const result = await dispatchWebhook(parsed, input.deliveryId);
    if (!result.dispatched) {
      if (result.unhandled) {
        // Event type has no registered handler — intentional no-op
        // (BDL subscribes us to more types than we model). Mark the
        // delivery as processed; don't park in webhook_failed.
        await db.execute(sql`
          UPDATE public.webhook_delivery
          SET status = 'processed'::webhook_status,
              processed_at = now()
          WHERE delivery_id = ${input.deliveryId}
        `);
        return { outcome: "processed", eventType };
      }
      await recordFailure(input, eventType, result.note ?? "not dispatched");
      return {
        outcome: "failed",
        eventType,
        error: result.note ?? "not dispatched",
      };
    }
    await db.execute(sql`
      UPDATE public.webhook_delivery
      SET status = 'processed'::webhook_status,
          processed_at = now()
      WHERE delivery_id = ${input.deliveryId}
    `);
    return { outcome: "processed", eventType };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordFailure(input, eventType, msg);
    return { outcome: "failed", eventType, error: msg };
  }
}

async function recordFailure(input: ProcessInput, eventType: string, error: string): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    INSERT INTO public.webhook_failed (
      delivery_id, event_type, error_message, raw_payload, retry_count
    ) VALUES (
      ${input.deliveryId},
      ${eventType},
      ${error},
      ${input.rawBody}::jsonb,
      0
    )
  `);
  await db.execute(sql`
    UPDATE public.webhook_delivery
    SET status = 'failed'::webhook_status
    WHERE delivery_id = ${input.deliveryId}
  `);
}
