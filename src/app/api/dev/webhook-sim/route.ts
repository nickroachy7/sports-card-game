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
 * needing BDL to register a real webhook URL. Useful for:
 *   - local Phase 3 development against the local Supabase stack
 *   - end-to-end smoke testing of scoring + token triggers on prod
 *     before BDL webhooks are registered
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}` — same gate as
 * our cron endpoints. Never enabled for unauthenticated traffic.
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
 * reducer — same write path as a real BDL webhook. Source column will
 * show `webhook` per existing handler behavior; callers can tell this
 * is a simulated event by the `dev-sim:` prefix on the delivery id.
 */
export async function POST(req: NextRequest): Promise<Response> {
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
