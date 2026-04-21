"use client";

import { Card, type CardViewModel } from "@/components/card/Card";
import { AppliedTokenBadge } from "@/components/token/AppliedTokenBadge";
import { TokenBadge } from "@/components/token/TokenBadge";
import type { CardTier, TokenType } from "@/lib/contracts/cards";

const TOKEN_DEMO: ReadonlyArray<{ type: TokenType; bonusFp: number }> = [
  { type: "hr_bonus", bonusFp: 5 },
  { type: "multi_hit_bonus", bonusFp: 4 },
  { type: "sb_bonus", bonusFp: 3 },
  { type: "strikeout_bonus", bonusFp: 6 },
  { type: "quality_start_bonus", bonusFp: 6 },
];

type Props = {
  tierCards: Array<{ tier: CardTier; card: CardViewModel }>;
};

export function TokenPaletteDemo({ tierCards }: Props) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
            Tray pip · 44px
          </span>
          <div className="flex items-center gap-3">
            {TOKEN_DEMO.map(({ type, bonusFp }) => (
              <TokenBadge key={type} tokenType={type} bonusFp={bonusFp} size="tray" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
            Applied pip · 32px
          </span>
          <div className="flex items-center gap-3">
            {TOKEN_DEMO.map(({ type, bonusFp }) => (
              <TokenBadge key={type} tokenType={type} bonusFp={bonusFp} size="applied" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
            Tray pip · dim (already applied)
          </span>
          <TokenBadge tokenType="hr_bonus" bonusFp={5} size="tray" dim />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        {tierCards.map(({ tier, card }, i) => {
          const demo = TOKEN_DEMO[i % TOKEN_DEMO.length];
          return (
            <div key={tier} className="flex flex-col items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">{tier}</span>
              <div className="relative">
                <Card size="medium" card={card} />
                <div className="absolute -right-2 -bottom-2 z-10">
                  <AppliedTokenBadge
                    tokenType={demo.type}
                    bonusFp={demo.bonusFp}
                    onRemove={() => {
                      // Palette demo only — click toggles the visual confirm
                      // state internally; a real surface wires this to
                      // removeToken. No-op here.
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
