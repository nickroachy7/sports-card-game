import { NextResponse } from "next/server";

import { CronAuthError } from "@/lib/auth/cron";

/**
 * Standard JSON envelope for cron endpoints. Mirrors API spec §2.1 —
 * 200 on success with `{ data }`, 401 on unauthorized cron auth,
 * 500 on internal with `{ error }`.
 */
export function cronOk<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ data, meta });
}

export function cronError(err: unknown): NextResponse {
  if (err instanceof CronAuthError) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: err.message } },
      { status: 401 },
    );
  }
  const message = err instanceof Error ? err.message : "Internal error";
  return NextResponse.json({ error: { code: "INTERNAL", message } }, { status: 500 });
}
