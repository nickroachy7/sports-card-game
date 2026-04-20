import { z } from "zod";

/**
 * Empty strings in .env.local are treated as unset. Without this, a row like
 * `SENTRY_DSN=""` would fail a `.optional()` check (it's defined, just empty).
 */
const emptyAsUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.length === 0 ? undefined : v), schema);

const requiredString = z.string().min(1);
const optionalString = emptyAsUndefined(z.string().min(1).optional());
const optionalUrl = emptyAsUndefined(z.string().url().optional());

const booleanFromString = z
  .string()
  .transform((v) => v === "1" || v.toLowerCase() === "true")
  .optional();

/**
 * Only the vars the app genuinely needs RIGHT NOW to boot are required.
 * Everything else is optional so M3 can run without an Upstash instance,
 * a Sentry DSN, or a BallDontLie key — the feature paths that depend on
 * those creds check at call time and degrade gracefully.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // Required: app can't boot without these.
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredString,
  SUPABASE_SERVICE_ROLE_KEY: requiredString,
  SUPABASE_JWT_SECRET: requiredString,
  DATABASE_URL: requiredString,
  CRON_SECRET: requiredString,

  // Optional: filled in at the milestone that needs them.
  BDL_API_KEY: optionalString, // M4
  BDL_WEBHOOK_SECRET: optionalString, // M4
  UPSTASH_REDIS_REST_URL: optionalUrl, // M3 rate limit (graceful no-op)
  UPSTASH_REDIS_REST_TOKEN: optionalString, // M3 rate limit
  NEXT_PUBLIC_SENTRY_DSN: optionalString, // M6
  SENTRY_DSN: optionalString, // M6
  SENTRY_AUTH_TOKEN: optionalString, // M6 source-map upload
  SENTRY_ORG: optionalString, // M6
  SENTRY_PROJECT: optionalString, // M6
  SENTRY_ENVIRONMENT: optionalString,
  NEXT_PUBLIC_POSTHOG_KEY: optionalString,
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().default("https://us.i.posthog.com"),
  POSTHOG_API_KEY: optionalString,

  SKIP_ENV_VALIDATION: booleanFromString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

/**
 * Validate and return the server-side environment. Throws on missing or
 * malformed REQUIRED vars. Safe to call from any server-only module. The
 * `next build` step sets SKIP_ENV_VALIDATION=1 on Vercel to avoid needing
 * every var at build time; in that case we return a loose passthrough.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const skip = process.env.SKIP_ENV_VALIDATION;
  if (skip === "1" || skip?.toLowerCase() === "true") {
    cached = process.env as unknown as ServerEnv;
    return cached;
  }

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${formatZodError(parsed.error)}`);
  }

  cached = parsed.data;
  return cached;
}

/** For tests. Resets the cached env so a new process.env state is re-parsed. */
export function resetServerEnvCache(): void {
  cached = null;
}
