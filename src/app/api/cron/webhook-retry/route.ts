import { sql } from "drizzle-orm";

import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";
import { getDb } from "@/lib/db/client";
import { processWebhook } from "@/lib/mlb/webhook-processor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RETRIES = 5;
const BATCH_SIZE = 25;

/**
 * Webhook retry cron — API spec §5.7, BDL integration §10.2.
 *
 * Processes up to BATCH_SIZE webhook_failed rows where retry_count < MAX_RETRIES
 * and next_retry_at <= now(). Runs every 5 minutes.
 *
 * Each attempt re-dispatches through processWebhook. On success, marks
 * the row resolved. On failure, increments retry_count and schedules the
 * next retry via exponential backoff (5m → 10m → 20m → 40m → 80m).
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);
    const db = getDb();

    const due = await db.execute<{
      id: string;
      delivery_id: string;
      event_type: string | null;
      raw_payload: unknown;
      retry_count: number;
    }>(sql`
      SELECT id, delivery_id, event_type, raw_payload, retry_count
      FROM public.webhook_failed
      WHERE resolved_at IS NULL
        AND retry_count < ${MAX_RETRIES}
        AND next_retry_at <= now()
      ORDER BY next_retry_at ASC
      LIMIT ${BATCH_SIZE}
    `);

    let resolved = 0;
    let rescheduled = 0;

    for (const row of due.rows) {
      const rawBody =
        typeof row.raw_payload === "string" ? row.raw_payload : JSON.stringify(row.raw_payload);

      const result = await processWebhook({
        deliveryId: row.delivery_id,
        eventType: row.event_type,
        rawBody,
      });

      if (result.outcome === "processed" || result.outcome === "already_processed") {
        await db.execute(sql`
          UPDATE public.webhook_failed
          SET resolved_at = now()
          WHERE id = ${row.id}::uuid
        `);
        resolved += 1;
      } else {
        const nextAttempt = row.retry_count + 1;
        // 5m base, doubling: 5, 10, 20, 40, 80 minutes.
        const delayMinutes = 5 * 2 ** row.retry_count;
        await db.execute(sql`
          UPDATE public.webhook_failed
          SET retry_count = ${nextAttempt},
              next_retry_at = now() + (${delayMinutes}::int * interval '1 minute')
          WHERE id = ${row.id}::uuid
        `);
        rescheduled += 1;
      }
    }

    return cronOk({
      considered: due.rows.length,
      resolved,
      rescheduled,
    });
  } catch (err) {
    return cronError(err);
  }
}
