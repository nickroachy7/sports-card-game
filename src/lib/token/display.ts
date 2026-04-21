import type { TokenType } from "@/lib/contracts/cards";

export const TOKEN_SHORT_LABEL: Record<TokenType, string> = {
  hr_bonus: "HR",
  multi_hit_bonus: "2H",
  sb_bonus: "SB",
  strikeout_bonus: "K8",
  quality_start_bonus: "QS",
};

export const TOKEN_LONG_LABEL: Record<TokenType, string> = {
  hr_bonus: "Home Run",
  multi_hit_bonus: "Multi-Hit",
  sb_bonus: "Stolen Base",
  strikeout_bonus: "Strikeout Game",
  quality_start_bonus: "Quality Start",
};

export function tokenRuleText(type: TokenType, bonusFp: number): string {
  switch (type) {
    case "hr_bonus":
      return `If this player hits a home run, +${bonusFp} FP.`;
    case "multi_hit_bonus":
      return `If this player gets 2 or more hits, +${bonusFp} FP.`;
    case "sb_bonus":
      return `If this player steals a base, +${bonusFp} FP.`;
    case "strikeout_bonus":
      return `If this pitcher records 8+ strikeouts, +${bonusFp} FP.`;
    case "quality_start_bonus":
      return `If this pitcher records a quality start, +${bonusFp} FP.`;
  }
}
