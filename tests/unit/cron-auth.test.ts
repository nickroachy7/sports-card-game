import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertCronAuth, CronAuthError } from "@/lib/auth/cron";
import { resetServerEnvCache } from "@/lib/env";

const CRON_SECRET = "a".repeat(64);

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_JWT_SECRET: "jwt-secret",
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  BDL_API_KEY: "bdl-key",
  BDL_WEBHOOK_SECRET: "bdl-webhook-secret",
  UPSTASH_REDIS_REST_URL: "https://redis.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "redis-token",
  CRON_SECRET,
};

describe("assertCronAuth", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    process.env = { ...originalEnv, ...baseEnv, SKIP_ENV_VALIDATION: "" };
  });

  afterEach(() => {
    process.env = originalEnv;
    resetServerEnvCache();
  });

  it("passes on a correct Bearer token", () => {
    const req = new Request("https://example.com/api/cron/foo", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(() => assertCronAuth(req)).not.toThrow();
  });

  it("throws when the Authorization header is missing", () => {
    const req = new Request("https://example.com/api/cron/foo");
    expect(() => assertCronAuth(req)).toThrow(CronAuthError);
  });

  it("throws when the scheme is not Bearer", () => {
    const req = new Request("https://example.com/api/cron/foo", {
      headers: { authorization: `Basic ${CRON_SECRET}` },
    });
    expect(() => assertCronAuth(req)).toThrow(/Malformed/);
  });

  it("throws when the secret does not match", () => {
    const req = new Request("https://example.com/api/cron/foo", {
      headers: { authorization: `Bearer ${"b".repeat(64)}` },
    });
    expect(() => assertCronAuth(req)).toThrow(/Invalid/);
  });

  it("throws when the secret length differs", () => {
    const req = new Request("https://example.com/api/cron/foo", {
      headers: { authorization: "Bearer short" },
    });
    expect(() => assertCronAuth(req)).toThrow(/Invalid/);
  });
});
