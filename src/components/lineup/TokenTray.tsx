"use client";

import { TrayTokenPip } from "@/components/token/TrayTokenPip";
import type { LineupTokenVM } from "@/lib/lineup/types";

type Props = {
  tokens: LineupTokenVM[];
  locked: boolean;
};

export function TokenTray({ tokens, locked }: Props) {
  const availableCount = tokens.filter((t) => t.appliedToCardId === null).length;

  return (
    <section className="flex flex-col gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-2">
      <header className="flex items-center gap-3">
        <h2 className="text-xs uppercase tracking-wider text-[var(--text-3)]">Tokens</h2>
        {tokens.length === 0 ? (
          <span className="text-xs text-[var(--text-3)]">
            No tokens yet — earn some from Premium packs.
          </span>
        ) : (
          <span className="font-mono text-xs text-[var(--text-2)]">
            {availableCount} / {tokens.length} available
          </span>
        )}
      </header>

      {tokens.length > 0 && (
        <div className="flex items-center gap-3 overflow-x-auto py-1">
          {tokens.map((token) => (
            <TrayTokenPip key={token.id} token={token} disabled={locked} />
          ))}
        </div>
      )}
    </section>
  );
}
