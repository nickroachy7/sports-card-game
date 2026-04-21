import { sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Dev-only: flip the current active season to 'offseason' so the vault
 * ceremony can be exercised end-to-end without the Phase-5 season-close
 * cron. Auth: `Authorization: Bearer ${CRON_SECRET}` — same gate as the
 * webhook-sim endpoint.
 *
 * Body: { mode: 'offseason' | 'active' | 'closed' }. Defaults to
 * 'offseason'. Idempotent — calling twice leaves the state unchanged.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Missing or invalid CRON_SECRET." } },
      { status: 401 },
    );
  }

  let mode: "offseason" | "active" | "closed" = "offseason";
  try {
    const body = (await req.json()) as { mode?: string };
    if (body.mode === "active" || body.mode === "closed" || body.mode === "offseason") {
      mode = body.mode;
    }
  } catch {
    // Default mode used.
  }

  const res = await getDb().execute<{ id: string; year: number; status: string }>(sql`
    UPDATE public.season
    SET status = ${mode}::season_status,
        closed_at = CASE WHEN ${mode}::text IN ('offseason','closed') THEN COALESCE(closed_at, now()) ELSE NULL END
    WHERE id = (
      SELECT id FROM public.season
      WHERE status IN ('active','offseason')
      ORDER BY year DESC
      LIMIT 1
    )
    RETURNING id, year, status
  `);

  const row = res.rows[0];
  if (!row) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "No active season to flip." } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    data: { season_id: row.id, year: row.year, status: row.status },
  });
}
