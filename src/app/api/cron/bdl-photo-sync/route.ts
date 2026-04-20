import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Weekly player photo sync — BDL integration §8.
 *
 * Stubbed for launch. When the MLBAM join strategy is locked (§8.1), this
 * iterates `player` rows with `photo_url IS NULL`, fetches the MLB static
 * headshot via `https://midfield.mlbstatic.com/v1/people/{mlbam_id}/spots/120`,
 * uploads to Supabase Storage at `players/{player_id}/headshot.jpg`, and
 * writes `player.photo_url + photo_synced_at`.
 *
 * The fallback silhouette (UI/UX spec §4.4) renders in the meantime.
 * Scheduled weekly (Sun 02:00 ET) once activated.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);
    return cronOk(
      {
        synced: 0,
        skipped: 0,
        errored: 0,
      },
      { stubbed: true, message: "Photo sync not yet activated (see BDL integration §8.1)." },
    );
  } catch (err) {
    return cronError(err);
  }
}
