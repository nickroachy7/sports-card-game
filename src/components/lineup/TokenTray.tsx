"use client";

import { TrayTokenPip } from "@/components/token/TrayTokenPip";
import type { LineupTokenVM } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

type Props = {
  tokens: LineupTokenVM[];
  locked: boolean;
};

export function TokenTray({ tokens, locked }: Props) {
  // Polish spec §35 (Phase 15): tokens applied to a lineup card drop
  // out of the tray entirely. The tray is for "unused" tokens;
  // applied ones render on their slot cards via <AppliedTokenBadge>.
  // Applied tokens are the ones with `appliedToCardId` set.
  const unapplied = tokens.filter((t) => t.appliedToCardId === null);
  const appliedCount = tokens.length - unapplied.length;

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
          <span className="font-mono text-[var(--text-2)] text-xs">
            {unapplied.length} available
            {appliedCount > 0 && (
              <span className="ml-1 text-[var(--text-3)]">· {appliedCount} in lineup</span>
            )}
          </span>
        )}
      </header>

      {unapplied.length > 0 && (
        <div className={cn("flex items-center gap-3 overflow-x-auto py-1", locked && "opacity-50")}>
          {unapplied.map((token) => (
            <TrayTokenPip key={token.id} token={token} disabled={locked} />
          ))}
        </div>
      )}
    </section>
  );
}
