import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getSeedClient } from "../fixtures/seed";

/**
 * Integration test — Polish spec §190–§194 (Phase 48).
 *
 * Exercises the BDL final-state trust predicate end-to-end against
 * the local Supabase. Doesn't seed user data — just invokes the
 * pure SQL functions with various input shapes and asserts the
 * decision.
 *
 * Five known failure modes the predicate must catch:
 *   1. missing_start  — scheduled_start IS NULL
 *   2. not_started    — scheduled_start > now()
 *   3. too_recent     — scheduled_start within last 2 hours
 *   4. null_score     — home_runs / away_runs IS NULL
 *   5. zero_zero_tie  — both 0 (impossible in 2026 MLB)
 *
 * Plus the trustworthy happy path.
 *
 * Prereq: `supabase start` running at 127.0.0.1:64322.
 */

describe("public.is_trustworthy_final + final_trust_violation_reason", () => {
  let client: Client;

  beforeAll(async () => {
    client = await getSeedClient();
  });

  afterAll(async () => {
    await client.end();
  });

  type Row = { trustworthy: boolean; reason: string | null };

  async function evaluate(
    status: "scheduled" | "live" | "final" | "postponed" | "suspended" | "canceled",
    scheduledStart: string | null,
    homeRuns: number | null,
    awayRuns: number | null,
  ): Promise<Row> {
    const r = await client.query<Row>(
      `SELECT
         public.is_trustworthy_final($1::game_status, $2::timestamptz, $3::int, $4::int) AS trustworthy,
         public.final_trust_violation_reason($1::game_status, $2::timestamptz, $3::int, $4::int) AS reason`,
      [status, scheduledStart, homeRuns, awayRuns],
    );
    return r.rows[0] as Row;
  }

  // ─── Happy path ────────────────────────────────────────────────

  it("trustworthy: final + 3h ago + 5-2 score → trustworthy", async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const r = await evaluate("final", threeHoursAgo, 5, 2);
    expect(r.trustworthy).toBe(true);
    expect(r.reason).toBeNull();
  });

  // ─── Time-based violations ─────────────────────────────────────

  it("missing_start: scheduled_start is NULL", async () => {
    const r = await evaluate("final", null, 5, 2);
    expect(r.trustworthy).toBe(false);
    expect(r.reason).toBe("missing_start");
  });

  it("not_started: scheduled_start in the future", async () => {
    const future = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const r = await evaluate("final", future, 5, 2);
    expect(r.trustworthy).toBe(false);
    expect(r.reason).toBe("not_started");
  });

  it("too_recent: scheduled_start 30 min ago (under 2h grace)", async () => {
    const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const r = await evaluate("final", recent, 5, 2);
    expect(r.trustworthy).toBe(false);
    expect(r.reason).toBe("too_recent");
  });

  it("too_recent: scheduled_start exactly 1h ago", async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const r = await evaluate("final", oneHourAgo, 5, 2);
    expect(r.trustworthy).toBe(false);
    expect(r.reason).toBe("too_recent");
  });

  // ─── Score-based violations ────────────────────────────────────

  it("null_score: home_runs is NULL", async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const r = await evaluate("final", threeHoursAgo, null, 2);
    expect(r.trustworthy).toBe(false);
    expect(r.reason).toBe("null_score");
  });

  it("null_score: away_runs is NULL", async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const r = await evaluate("final", threeHoursAgo, 5, null);
    expect(r.trustworthy).toBe(false);
    expect(r.reason).toBe("null_score");
  });

  it("zero_zero_tie: both runs are 0 (impossible in 2026 MLB)", async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const r = await evaluate("final", threeHoursAgo, 0, 0);
    expect(r.trustworthy).toBe(false);
    expect(r.reason).toBe("zero_zero_tie");
  });

  it("zero_zero_tie does NOT trip on 1-0 (real shutout)", async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const r = await evaluate("final", threeHoursAgo, 1, 0);
    expect(r.trustworthy).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("zero_zero_tie does NOT trip on 0-1 (real shutout)", async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const r = await evaluate("final", threeHoursAgo, 0, 1);
    expect(r.trustworthy).toBe(true);
    expect(r.reason).toBeNull();
  });

  // ─── Non-final inputs ──────────────────────────────────────────

  it("non-final status: predicate false, reason NULL", async () => {
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    for (const status of ["scheduled", "live", "postponed", "suspended", "canceled"] as const) {
      const r = await evaluate(status, past, 5, 2);
      expect(r.trustworthy, `status=${status}`).toBe(false);
      expect(r.reason, `status=${status}`).toBeNull();
    }
  });

  // ─── Reason ordering: time check wins over score check ─────────

  it("ordering: not_started wins over zero_zero_tie when both fail", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const r = await evaluate("final", future, 0, 0);
    expect(r.trustworthy).toBe(false);
    expect(r.reason).toBe("not_started");
  });

  it("ordering: missing_start wins over null_score", async () => {
    const r = await evaluate("final", null, null, null);
    expect(r.trustworthy).toBe(false);
    expect(r.reason).toBe("missing_start");
  });

  // ─── final_passes_time_check (used at webhook ingest) ──────────

  it("final_passes_time_check: 3h ago → true", async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const r = await client.query<{ ok: boolean }>(
      `SELECT public.final_passes_time_check($1::timestamptz) AS ok`,
      [threeHoursAgo],
    );
    expect(r.rows[0]?.ok).toBe(true);
  });

  it("final_passes_time_check: NULL → false", async () => {
    const r = await client.query<{ ok: boolean }>(
      `SELECT public.final_passes_time_check(NULL::timestamptz) AS ok`,
    );
    expect(r.rows[0]?.ok).toBe(false);
  });

  it("final_passes_time_check: 30 min ago → false", async () => {
    const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const r = await client.query<{ ok: boolean }>(
      `SELECT public.final_passes_time_check($1::timestamptz) AS ok`,
      [recent],
    );
    expect(r.rows[0]?.ok).toBe(false);
  });
});
