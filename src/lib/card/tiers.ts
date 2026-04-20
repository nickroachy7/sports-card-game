import type { CardTier } from "@/lib/contracts/cards";

/**
 * Tier visual tokens. UI/UX spec §4.5 calls for motion + foil
 * treatments at higher tiers — M5 ships static gradients + border
 * colors. Motion lands alongside Phase 6 polish.
 */
export const TIER_FRAME: Record<
  CardTier,
  {
    border: string;
    fill: string;
    accent: string;
    label: string;
  }
> = {
  bronze: {
    border: "#A57248",
    fill: "linear-gradient(180deg, #B8814C 0%, #8E5E38 100%)",
    accent: "#A57248",
    label: "Bronze",
  },
  silver: {
    border: "#A8A099",
    fill: "linear-gradient(90deg, #C5C0B8 0%, #D8D3C8 50%, #B0ABA2 100%)",
    accent: "#C5C0B8",
    label: "Silver",
  },
  gold: {
    border: "#B8923A",
    fill: "linear-gradient(135deg, #F5C768 0%, #D4A647 50%, #A37B2A 100%)",
    accent: "#D4A647",
    label: "Gold",
  },
  diamond: {
    border: "#8DC3C9",
    fill: "conic-gradient(from 210deg, #A8DDE2, #F0E3F5, #C8D8E8, #E8E0D8, #A8DDE2)",
    accent: "#A8DDE2",
    label: "Diamond",
  },
};

/** Tiers in ascending order. */
export const TIERS: CardTier[] = ["bronze", "silver", "gold", "diamond"];

/** Returns the next tier up, or null if already Diamond. */
export function nextTier(tier: CardTier): CardTier | null {
  const i = TIERS.indexOf(tier);
  return i >= 0 && i < TIERS.length - 1 ? (TIERS[i + 1] as CardTier) : null;
}

/**
 * Contract-count color coding — UI/UX spec §4.8.
 *   ≥ 5   → cream (text) / no halo
 *   3–4   → amber/gold (low)
 *   ≤ 2   → muted-red (critical)
 *   0     → muted (expired; card has EXPIRED pill instead)
 */
export function contractColor(remaining: number): {
  textColor: string;
  haloClass: string;
  label: "ok" | "low" | "critical" | "expired";
} {
  if (remaining <= 0) {
    return { textColor: "#5E584F", haloClass: "", label: "expired" };
  }
  if (remaining <= 2) {
    return {
      textColor: "#C47262",
      haloClass: "shadow-[0_0_0_2px_rgba(196,114,98,0.3)]",
      label: "critical",
    };
  }
  if (remaining <= 4) {
    return { textColor: "#D4A647", haloClass: "", label: "low" };
  }
  return { textColor: "var(--text)", haloClass: "", label: "ok" };
}
