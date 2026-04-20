import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * API spec §2.5 rate-limit caps.
 * - pack_open:              30/min per user
 * - contract_extend:        20/min per user
 * - quick_sell:             60/min per user
 * - token_apply_remove:     60/min per user
 * - contest_entry_mutation: 60/min per user
 * - contest_entry_submit:   10/min per user
 * - profile_update:         10/min per user
 */
export type RateLimitBucket =
  | "pack_open"
  | "contract_extend"
  | "quick_sell"
  | "token_apply_remove"
  | "contest_entry_mutation"
  | "contest_entry_submit"
  | "profile_update";

const BUCKET_CAPS: Record<RateLimitBucket, { tokens: number; window: `${number} m` }> = {
  pack_open: { tokens: 30, window: "1 m" },
  contract_extend: { tokens: 20, window: "1 m" },
  quick_sell: { tokens: 60, window: "1 m" },
  token_apply_remove: { tokens: 60, window: "1 m" },
  contest_entry_mutation: { tokens: 60, window: "1 m" },
  contest_entry_submit: { tokens: 10, window: "1 m" },
  profile_update: { tokens: 10, window: "1 m" },
};

let redis: Redis | null = null;
const limiters = new Map<RateLimitBucket, Ratelimit>();

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!redis) {
    redis = new Redis({ url, token });
  }
  return redis;
}

function getLimiter(bucket: RateLimitBucket): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  let limiter = limiters.get(bucket);
  if (!limiter) {
    const cap = BUCKET_CAPS[bucket];
    limiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(cap.tokens, cap.window),
      prefix: `ratelimit:${bucket}`,
      analytics: true,
    });
    limiters.set(bucket, limiter);
  }
  return limiter;
}

export type RateLimitResult = {
  success: boolean;
  /** Remaining tokens in the current window. */
  remaining: number;
  /** Ms until the window resets. */
  reset: number;
  /** Total tokens the window grants. */
  limit: number;
};

/**
 * Check whether a request for `bucket` by `identifier` (typically the user
 * id, falling back to IP) is within the cap. Returns success=true when
 * Upstash is not configured — rate limiting is a production concern, and
 * dev shouldn't break without creds.
 */
export async function checkRateLimit(
  bucket: RateLimitBucket,
  identifier: string,
): Promise<RateLimitResult> {
  const limiter = getLimiter(bucket);
  if (!limiter) {
    return {
      success: true,
      remaining: BUCKET_CAPS[bucket].tokens,
      reset: Date.now() + 60_000,
      limit: BUCKET_CAPS[bucket].tokens,
    };
  }

  const result = await limiter.limit(identifier);
  return {
    success: result.success,
    remaining: result.remaining,
    reset: result.reset,
    limit: result.limit,
  };
}

/** Returns the standard `X-RateLimit-*` headers for a rate-limit result. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
  };
}
