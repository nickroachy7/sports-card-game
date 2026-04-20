"use client";

import type { LineupTokenVM } from "@/lib/lineup/types";

import { TokenChip } from "./TokenChip";

type Props = {
  tokens: LineupTokenVM[];
  locked: boolean;
};

export function TokenTray({ tokens, locked }: Props) {
  if (tokens.length === 0) {
    return (
      <section className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xs uppercase tracking-wider text-[var(--text-3)]">Tokens</h2>
          <span className="text-xs text-[var(--text-3)]">
            No tokens yet — pull from Premium packs to earn some.
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="flex items-center gap-3">
        <h2 className="text-xs uppercase tracking-wider text-[var(--text-3)]">Tokens</h2>
        <span className="font-mono text-xs text-[var(--text-2)]">
          {tokens.filter((t) => t.appliedToCardId === null).length} / {tokens.length} available
        </span>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {tokens.map((token) => (
          <TokenChip key={token.id} token={token} disabled={locked} />
        ))}
      </div>
    </section>
  );
}
