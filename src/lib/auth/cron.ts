import { timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env";

/**
 * Thrown when a cron request does not carry a valid `Authorization: Bearer`
 * token. Route Handlers that call `assertCronAuth` should catch this and
 * return a 401 response.
 */
export class CronAuthError extends Error {
  readonly status = 401;

  constructor(message = "Unauthorized") {
    super(message);
    this.name = "CronAuthError";
  }
}

/**
 * Validates a Vercel Cron request. Vercel Cron invokes the endpoint with
 * `Authorization: Bearer ${CRON_SECRET}`. We do a constant-time comparison
 * against the server's configured secret. Throws `CronAuthError` on any
 * failure path; returns void on success.
 */
export function assertCronAuth(req: Request): void {
  const { CRON_SECRET } = getServerEnv();

  const header = req.headers.get("authorization");
  if (!header) {
    throw new CronAuthError("Missing Authorization header");
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new CronAuthError("Malformed Authorization header");
  }

  const provided = match[1].trim();
  const expected = CRON_SECRET;

  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");

  if (providedBuf.length !== expectedBuf.length) {
    throw new CronAuthError("Invalid cron secret");
  }

  if (!timingSafeEqual(providedBuf, expectedBuf)) {
    throw new CronAuthError("Invalid cron secret");
  }
}
