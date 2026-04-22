/**
 * Status-chip label helpers — polish spec §22.
 *
 * `liveLabel` renders the "Live · …" copy the chip shows while
 * `entryStatus === 'live'`. Split out of LineupSidebar.tsx so the
 * edge cases (ordinal suffixes 11-13, singular vs plural count,
 * loading-not-ready case) are unit-testable without React /
 * Supabase Realtime in the loop.
 */

export type InningInfo = {
  inning: number;
  half: "top" | "bottom";
};

export function liveLabel(
  inning: InningInfo | null,
  gamesActive: number,
  gamesReady: boolean,
): string {
  if (!gamesReady) return "Live · Games in progress";
  if (gamesActive === 0) return "Live · Games ending";
  const countPart = `${gamesActive} ${gamesActive === 1 ? "game" : "games"} active`;
  if (!inning) return `Live · ${countPart}`;
  const halfLabel = inning.half === "top" ? "Top" : "Bottom";
  return `Live · ${halfLabel} ${ordinal(inning.inning)} · ${countPart}`;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
