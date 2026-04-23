/**
 * MLBAM headshot URL helper — polish spec §26 + §120 (Phase 38).
 *
 * MLB's public photo CDN serves deterministic URLs given a player's
 * MLBAM id. BDL doesn't expose those ids directly; we backfill them
 * via the MLB Stats API search endpoint (see
 * `/api/cron/mlbam-id-backfill`) and store on `public.player.mlbam_id`.
 *
 * Phase 38 change: bumped `small` / `medium` from 120px → 240px
 * source width. CSS scales down for the 96px slot-card render; the
 * extra density eliminates the soft edges on Retina displays that
 * made players with tight-framed headshots look cropped.
 *
 * If MLB rotates the URL schema (rare — stable 5+ years), update
 * here and every card swaps in one deploy.
 */

const BASE = "https://img.mlbstatic.com/mlb-photos/image/upload";

export function mlbamHeadshotUrl(
  mlbamId: number,
  size: "small" | "medium" | "large" = "medium",
): string {
  // Phase 38: all sizes use a 240px source. Crisper at Retina
  // scaling; CSS object-cover still trims to the card photo area.
  const width = size === "large" ? 360 : 240;
  return `${BASE}/d_people:generic:headshot:67:current.png/w_${width},q_auto:best/v1/people/${mlbamId}/headshot/67/current`;
}
