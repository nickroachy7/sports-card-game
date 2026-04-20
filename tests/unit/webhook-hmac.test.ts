import { describe, expect, it } from "vitest";

import { signBDLWebhook, verifyBDLWebhook } from "@/lib/mlb/webhook";

const SECRET = "whsec_test_secret_123";
const PAYLOAD = JSON.stringify({
  event_type: "mlb.batter.home_run",
  game: { id: 782931 },
  batter: { id: 12345, name: "Aaron Judge" },
});

describe("verifyBDLWebhook", () => {
  it("accepts a correctly-signed payload", () => {
    const nowSec = 1_700_000_000;
    const { signature, timestamp } = signBDLWebhook(PAYLOAD, SECRET, nowSec);
    const result = verifyBDLWebhook({
      rawBody: PAYLOAD,
      signature,
      timestamp,
      secret: SECRET,
      nowSec,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const nowSec = 1_700_000_000;
    const { signature, timestamp } = signBDLWebhook(PAYLOAD, SECRET, nowSec);
    const result = verifyBDLWebhook({
      rawBody: `${PAYLOAD} `, // added a byte
      signature,
      timestamp,
      secret: SECRET,
      nowSec,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a different secret", () => {
    const nowSec = 1_700_000_000;
    const { signature, timestamp } = signBDLWebhook(PAYLOAD, SECRET, nowSec);
    const result = verifyBDLWebhook({
      rawBody: PAYLOAD,
      signature,
      timestamp,
      secret: "different_secret",
      nowSec,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects an expired timestamp (>5 min old)", () => {
    const nowSec = 1_700_000_000;
    const { signature, timestamp } = signBDLWebhook(PAYLOAD, SECRET, nowSec - 301);
    const result = verifyBDLWebhook({
      rawBody: PAYLOAD,
      signature,
      timestamp,
      secret: SECRET,
      nowSec,
    });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a future-dated timestamp (>30s skew)", () => {
    const nowSec = 1_700_000_000;
    const { signature, timestamp } = signBDLWebhook(PAYLOAD, SECRET, nowSec + 60);
    const result = verifyBDLWebhook({
      rawBody: PAYLOAD,
      signature,
      timestamp,
      secret: SECRET,
      nowSec,
    });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects when signature header is missing", () => {
    const result = verifyBDLWebhook({
      rawBody: PAYLOAD,
      signature: null,
      timestamp: "1700000000",
      secret: SECRET,
      nowSec: 1_700_000_000,
    });
    expect(result).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("rejects when timestamp is missing", () => {
    const result = verifyBDLWebhook({
      rawBody: PAYLOAD,
      signature: "v1=abc123",
      timestamp: null,
      secret: SECRET,
      nowSec: 1_700_000_000,
    });
    expect(result).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("rejects signature with wrong scheme prefix", () => {
    const nowSec = 1_700_000_000;
    const { signature, timestamp } = signBDLWebhook(PAYLOAD, SECRET, nowSec);
    const swapped = signature.replace("v1=", "v2=");
    const result = verifyBDLWebhook({
      rawBody: PAYLOAD,
      signature: swapped,
      timestamp,
      secret: SECRET,
      nowSec,
    });
    expect(result).toEqual({ ok: false, reason: "malformed_signature" });
  });
});
