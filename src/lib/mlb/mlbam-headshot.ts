/**
 * MLBAM headshot URL helper — polish spec §26.
 *
 * MLB's public photo CDN serves deterministic URLs given a player's
 * MLBAM id. BDL doesn't expose those ids directly; we backfill them
 * via the MLB Stats API search endpoint (see
 * `/api/cron/mlbam-id-backfill`) and store on `public.player.mlbam_id`.
 *
 * URL pattern is the 67:current headshot asset at 120px — good
 * enough for Medium cards (160px wide) and small slot cards (96px).
 * Large cards (320px) get a zoom=1.3 crop that fills without
 * pixelating.
 *
 * If MLB rotates the URL schema (rare — stable 5+ years), update
 * here and every card swaps in one deploy.
 */

const BASE = "https://img.mlbstatic.com/mlb-photos/image/upload";

export function mlbamHeadshotUrl(
  mlbamId: number,
  size: "small" | "medium" | "large" = "medium",
): string {
  // 120px is the natively-served size; scale down via CSS for small.
  const width = size === "large" ? 240 : 120;
  return `${BASE}/d_people:generic:headshot:67:current.png/w_${width},q_auto:best/v1/people/${mlbamId}/headshot/67/current`;
}
