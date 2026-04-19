import { z } from "zod";

const nonEmpty = z.string().min(1);
const optional = z.string().min(1).optional();

const urlString = z.string().url();

const booleanFromString = z
  .string()
  .transform((v) => v === "1" || v.toLowerCase() === "true")
  .optional();

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  NEXT_PUBLIC_APP_URL: urlString.default("http://localhost:3000"),

  NEXT_PUBLIC_SUPABASE_URL: urlString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  SUPABASE_JWT_SECRET: nonEmpty,
  DATABASE_URL: nonEmpty,

  BDL_API_KEY: nonEmpty,
  BDL_WEBHOOK_SECRET: nonEmpty,

  UPSTASH_REDIS_REST_URL: urlString,
  UPSTASH_REDIS_REST_TOKEN: nonEmpty,

  NEXT_PUBLIC_SENTRY_DSN: optional,
  SENTRY_DSN: optional,
  SENTRY_AUTH_TOKEN: optional,
  SENTRY_ORG: optional,
  SENTRY_PROJECT: optional,
  SENTRY_ENVIRONMENT: optional,

  NEXT_PUBLIC_POSTHOG_KEY: optional,
  NEXT_PUBLIC_POSTHOG_HOST: urlString.default("https://us.i.posthog.com"),
  POSTHOG_API_KEY: optional,

  CRON_SECRET: nonEmpty,

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
 * malformed vars. Safe to call from any server-only module. The `next build`
 * step sets SKIP_ENV_VALIDATION=1 on Vercel to avoid needing every var at
 * build time; in that case we return a loose passthrough.
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
