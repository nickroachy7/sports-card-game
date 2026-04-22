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
        className="h-full w-full object-cover"
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
