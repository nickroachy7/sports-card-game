import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getServerEnv, resetServerEnvCache } from "@/lib/env";

const requiredVars = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_JWT_SECRET: "jwt-secret",
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  BDL_API_KEY: "bdl-key",
  BDL_WEBHOOK_SECRET: "bdl-webhook-secret",
  UPSTASH_REDIS_REST_URL: "https://redis.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "redis-token",
  CRON_SECRET: "cron-secret",
};

describe("getServerEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    process.env = { ...originalEnv, SKIP_ENV_VALIDATION: "" };
    for (const key of Object.keys(requiredVars)) {
      delete process.env[key as keyof typeof requiredVars];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    resetServerEnvCache();
  });

  it("throws when required vars are missing", () => {
    expect(() => getServerEnv()).toThrow(/Invalid environment variables/);
  });

  it("parses when required vars are present", () => {
    Object.assign(process.env, requiredVars);
    const env = getServerEnv();
    expect(env.DATABASE_URL).toBe(requiredVars.DATABASE_URL);
    expect(env.NEXT_PUBLIC_POSTHOG_HOST).toBe("https://us.i.posthog.com");
  });

  it("honors SKIP_ENV_VALIDATION", () => {
    process.env.SKIP_ENV_VALIDATION = "1";
    expect(() => getServerEnv()).not.toThrow();
  });
});
