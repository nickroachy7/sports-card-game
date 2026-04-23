import type { TokenType } from "@/lib/contracts/cards";
import { TOKEN_LONG_LABEL, tokenRuleText } from "@/lib/token/display";

/**
 * Polish spec §114 (Phase 37). Shared tooltip body for tokens
 * wherever they appear (TokenTray pips + AppliedTokenBadge). Keeps
 * the hover UX identical: name on top, bonus FP chip, one-line rule
 * underneath.
 */
export function TokenTooltipContent({
  tokenType,
  bonusFp,
}: {
  tokenType: TokenType;
  bonusFp: number;
}) {
  return (
    <div className="flex min-w-[200px] flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="font-sans text-sm font-bold tracking-tight text-[var(--text)]">
          {TOKEN_LONG_LABEL[tokenType]}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--tier-gold)]">
          +{bonusFp} FP
        </span>
      </div>
      <p className="text-[11px] leading-snug text-[var(--text-2)]">
        {tokenRuleText(tokenType, bonusFp)}
      </p>
    </div>
  );
}
