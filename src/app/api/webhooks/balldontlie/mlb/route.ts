import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { verifyBDLWebhook } from "@/lib/mlb/webhook";
import { processWebhook } from "@/lib/mlb/webhook-processor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * BallDontLie webhook receiver — BDL integration §5, API spec §6.1.
 *
 * Protocol:
 *   - Read raw body (signature is over raw bytes).
 *   - Verify HMAC-SHA256 signature + 5-min replay window.
 *   - 401 on signature failure. Vendor must never see a 200 for a bad
 *     signature — that would let an attacker pump fake events in.
 *   - Dedupe via webhook_delivery.delivery_id; already-processed ⇒ 200.
 *   - Dispatch, then 200 with { data }. If dispatch fails we still 200
 *     and park the payload in webhook_failed (the retry cron picks it
 *     up) — returning 5xx causes the vendor to retry and eventually
 *     auto-disable us.
 */
export async function POST(req: Request): Promise<Response> {
  const { BDL_WEBHOOK_SECRET } = getServerEnv();
  if (!BDL_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "BDL_WEBHOOK_SECRET not configured" } },
      { status: 500 },
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-bdl-webhook-signature");
  const timestamp = req.headers.get("x-bdl-webhook-timestamp");
  const deliveryId = req.headers.get("x-bdl-webhook-id");
  const eventType = req.headers.get("x-bdl-webhook-event-type");

  const verify = verifyBDLWebhook({
    rawBody,
    signature,
    timestamp,
    secret: BDL_WEBHOOK_SECRET,
  });
  if (!verify.ok) {
    return NextResponse.json(
      {
        error: { code: "UNAUTHENTICATED", message: `webhook signature invalid: ${verify.reason}` },
      },
      { status: 401 },
    );
  }

  if (!deliveryId) {
    // Verified but missing delivery id — we can't dedupe safely. Park it.
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "missing x-bdl-webhook-id" } },
      { status: 400 },
    );
  }

  const result = await processWebhook({
    deliveryId,
    eventType,
    rawBody,
    signature,
  });

  return NextResponse.json({ data: result });
}
