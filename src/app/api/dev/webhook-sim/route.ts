import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { processWebhook } from "@/lib/mlb/webhook-processor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Dev-only webhook simulator.
 *
 * Lets us fire synthetic `mlb.game.started` / `mlb.game.ended` /
 * `mlb.batter.*` events against our own webhook processor without
 * needing BDL to register a real webhook URL. Useful for local
 * development and for pre-registration smoke tests against a
 * preview deployment.
 *
 * Gating (polish spec §12.1):
 *   - 404 when NODE_ENV === 'production' so the route does not exist
 *     at all on prod — real BDL webhooks hit /api/webhooks/balldontlie/mlb
 *     with HMAC verification.
 *   - Otherwise: requires `Authorization: Bearer ${CRON_SECRET}` —
 *     same gate as cron endpoints.
 *
 * POST body:
 * ```json
 * {
 *   "event_type": "mlb.batter.home_run",
 *   "game": { "id": 5058099 },
 *   "play": { "type": "home_run", "score_value": 2, "inning": 5, "inning_half": "top" },
 *   "batter": { "id": 123456 },
 *   "pitcher": { "id": 789012 }
 * }
 * ```
 *
 * The handler inserts into `game_event`, which triggers the scoring
 * reducer — same write path as a real BDL webhook. Callers can tell
 * this is a simulated event by the `dev-sim:` prefix on the delivery
 * id in `webhook_delivery`.
 */
export async function POST(req: NextRequest): Promise<Response> {
  // Prod guard — route does not exist at all in production so there's
  // no surface to accidentally hit with a cron secret leak.
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Missing or invalid CRON_SECRET." } },
      { status: 401 },
    );
  }

  const rawBody = await req.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Body is not valid JSON." } },
      { status: 400 },
    );
  }
  const payload = parsed as { event_type?: string };
  if (!payload.event_type) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Missing event_type." } },
      { status: 400 },
    );
  }

  const deliveryId = `dev-sim:${randomUUID()}`;
  const result = await processWebhook({
    deliveryId,
    eventType: payload.event_type,
    rawBody,
  });

  return NextResponse.json({ data: { ...result, delivery_id: deliveryId } });
}
