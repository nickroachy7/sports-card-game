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
 * Tier-based contract budget (polish spec §134, Phase 41). Must stay in
 * sync with the `public.tier_play_budget` SQL fn. Diamond returns 999 as
 * a practical sentinel for "unlimited"; UI should render ∞.
 */
export const TIER_PLAY_BUDGET: Record<CardTier, number> = {
  bronze: 5,
  silver: 15,
  gold: 40,
  diamond: 999,
};

/** True if this tier's budget is the "unlimited" Diamond tier. */
export function isUnlimitedTier(tier: CardTier): boolean {
  return tier === "diamond";
}

/**
 * Render the contract line for a card. Phase 41 introduced tier-based
 * budgets, which leaves three display cases:
 *
 *   1. Normal — plays <= budget.              "3/5"            "Contract 3/5"
 *   2. Legacy inflated — plays > budget.      "14"             "14 plays left"
 *      (Bronze card minted pre-P41 with 15
 *      plays, or a tier-down edge case.)
 *   3. Diamond — budget is 999 (∞).           "14"             "∞ (14 left)"
 *
 * Compact variant is for the card face footer (tight). Full variant is
 * for the detail panel + tooltips. Never surfaces a broken "14/5"
 * denominator — user direction in the Phase 41 polish interview.
 */
export function formatContract(
  plays: number,
  tier: CardTier,
  variant: "compact" | "full" = "full",
): string {
  const budget = TIER_PLAY_BUDGET[tier];
  if (tier === "diamond") {
    return variant === "compact" ? String(plays) : `∞ (${plays} left)`;
  }
  if (plays > budget) {
    return variant === "compact" ? String(plays) : `${plays} plays left`;
  }
  return variant === "compact" ? `${plays}/${budget}` : `${plays}/${budget}`;
}

/**
 * Vault multiplier curve (polish spec §133, Phase 41). Must stay in
 * sync with the `public.card_vault_multiplier` SQL fn. Celebrates peak
 * single-game performance: a card played once gets 5×, volume cards
 * trend toward 1×.
 */
export function cardVaultMultiplier(plays: number): number {
  if (plays <= 0) return 0.0;
  if (plays === 1) return 5.0;
  if (plays === 2) return 3.5;
  if (plays === 3) return 2.5;
  if (plays <= 5) return 1.8;
  if (plays <= 10) return 1.3;
  if (plays <= 20) return 1.1;
  return 1.0;
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
