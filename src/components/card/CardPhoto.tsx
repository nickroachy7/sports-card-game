"use client";

import { useState } from "react";

type Props = {
  photoUrl: string | null;
  initials: string;
  /** Fallback-initials font size in px. */
  fontSize: number;
};

/**
 * Polish spec §26 — card photo area with graceful silhouette
 * fallback.
 *
 * Renders the MLBAM CDN headshot when `photoUrl` is provided; if
 * the image fails to load (404 stale id, network, etc.), swaps to
 * the name-initials fallback. Also swaps when `photoUrl` is null
 * (player missing MLBAM id).
 *
 * Kept as a separate client component so the parent `<Card>` stays
 * server-renderable — only the per-image `onError` state needs a
 * hook.
 */
export function CardPhoto({ photoUrl, initials, fontSize }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = photoUrl !== null && !failed;

  if (showImage) {
    return (
      // biome-ignore lint/performance/noImgElement: MLBAM CDN off-domain, no next/image loader
      <img
        src={photoUrl ?? undefined}
        alt=""
        // Polish spec §120 (Phase 38). Default `object-position:
        // center` was cropping top + bottom equally; MLBAM headshots
        // have a bit of head-room above and shoulders below, so the
        // chin was ending up at the edge of the photo window. Shift
        // the crop up (top ~25%) so faces sit higher in frame and
        // chins don't get clipped when the card's photo-area aspect
        // ratio is shorter than the source's 1:1.5 portrait.
        className="h-full w-full object-cover"
        style={{ objectPosition: "center 25%" }}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="font-bold font-sans" style={{ fontSize }}>
      {initials || "?"}
    </span>
  );
}
