"use client";

import { TrayTokenPip } from "@/components/token/TrayTokenPip";
import type { LineupTokenVM } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

type Props = {
  tokens: LineupTokenVM[];
  locked: boolean;
  /**
   * Polish spec §195 (Phase 49). Hard ceiling on inventory. Header
   * renders `unapplied / cap available`; pip color shifts when ≥90%
   * full so the user has a visual cue to grind down via quick-sell.
   */
  tokenCap: number;
  /**
   * Polish spec §195 (Phase 49). Click a tray pip → sidebar swaps
   * to <TokenDetailPanel>. Identical interaction shape to the
   * card-detail flow (handleOpenDetail pushes ?card=id).
   */
  onOpenDetail: (tokenId: string) => void;
  /** When set, the active tray pip renders an outline ring. */
  activeTokenId: string | null;
};

export function TokenTray({ tokens, locked, tokenCap, onOpenDetail, activeTokenId }: Props) {
  // Polish spec §35 (Phase 15): tokens applied to a lineup card drop
  // out of the tray entirely. The tray is for "unused" tokens;
  // applied ones render on their slot cards via <AppliedTokenBadge>.
  const unapplied = tokens.filter((t) => t.appliedToCardId === null);
  const appliedCount = tokens.length - unapplied.length;
  // §195 — inventory count is unapplied + applied; both still occupy
  // cap slots until contest finalize consumes them. The page query
  // already filters `consumed_at IS NULL`, so `tokens` is the live set.
  const inventoryCount = tokens.length;
  const isNearCap = inventoryCount >= Math.floor(tokenCap * 0.9);
  const isAtCap = inventoryCount >= tokenCap;

  return (
    <section className="flex flex-col gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-2">
      <header className="flex items-center gap-3">
        <h2 className="text-xs uppercase tracking-wider text-[var(--text-3)]">Tokens</h2>
        {locked ? (
          <span className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--text-3)]">
            Locked
          </span>
        ) : tokens.length === 0 ? (
          <span className="text-xs text-[var(--text-3)]">
            No tokens yet — earn some from Premium packs.
          </span>
        ) : (
          <span
            className={cn(
              "font-mono text-xs",
              isAtCap
                ? "text-[#D4A647]"
                : isNearCap
                  ? "text-[var(--text)]"
                  : "text-[var(--text-2)]",
            )}
          >
            {inventoryCount} / {tokenCap} available
            {appliedCount > 0 && (
              <span className="ml-1 text-[var(--text-3)]">· {appliedCount} in lineup</span>
            )}
            {isAtCap && (
              <span className="ml-1 text-[var(--text-3)]">· at cap, packs won't add more</span>
            )}
          </span>
        )}
      </header>

      {unapplied.length > 0 && (
        <div
          className={cn(
            "flex min-w-0 items-center gap-3 overflow-x-auto py-1",
            "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            locked && "opacity-50",
          )}
        >
          {unapplied.map((token) => (
            <TrayTokenPip
              key={token.id}
              token={token}
              disabled={locked}
              isActive={token.id === activeTokenId}
              onClick={() => onOpenDetail(token.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
