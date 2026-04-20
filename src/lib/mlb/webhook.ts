import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * BDL webhook HMAC verification.
 * Per integration spec §5.2: signature is v1={hex} over `{timestamp}.{rawBody}`.
 */

export type WebhookVerifyInput = {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  /** Current time in seconds-since-epoch. Injectable for tests. */
  nowSec?: number;
  /** Max age in seconds before a replay is rejected. Default 300 (5 min). */
  maxAgeSec?: number;
};

export type WebhookVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing_headers"
        | "bad_timestamp"
        | "expired"
        | "malformed_signature"
        | "signature_mismatch";
    };

export function verifyBDLWebhook(input: WebhookVerifyInput): WebhookVerifyResult {
  const { rawBody, signature, timestamp, secret } = input;
  if (!signature || !timestamp) return { ok: false, reason: "missing_headers" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad_timestamp" };

  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  const maxAge = input.maxAgeSec ?? 300;
  const age = now - ts;
  // Reject future-dated (> 30s skew) and too-old timestamps.
  if (age > maxAge || age < -30) return { ok: false, reason: "expired" };

  if (!signature.startsWith("v1=")) return { ok: false, reason: "malformed_signature" };

  const expectedHex = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  const expected = `v1=${expectedHex}`;

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return { ok: false, reason: "signature_mismatch" };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "signature_mismatch" };
  return { ok: true };
}

/** Convenience for tests: sign a payload the way BDL would. */
export function signBDLWebhook(
  rawBody: string,
  secret: string,
  timestamp: number,
): { signature: string; timestamp: string } {
  const hex = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return { signature: `v1=${hex}`, timestamp: String(timestamp) };
}
