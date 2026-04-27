"use client";

import { Trophy } from "lucide-react";

import type { TokenType } from "@/lib/contracts/cards";
import type { LineupPosition } from "@/lib/contracts/lineup";
import { LINEUP_POSITIONS } from "@/lib/contracts/lineup";
import type { LineupCardVM, SlotGameInfo } from "@/lib/lineup/types";
import { TOKEN_LONG_LABEL, TOKEN_SHORT_LABEL } from "@/lib/token/display";
import { cn } from "@/lib/utils";

/**
 * Polish spec §216 (Phase 53). End-of-day results summary that
 * replaces the lineup grid when `entry.status='final'`.
 *
 * Trigger condition: today's slate's games are all done, the
 * server's `_check_and_finalize_entry` has flipped the entry,
 * and the user lands on `/lineup` between then and the next
 * slate's pivot at 4 AM ET.
 *
 * Shows:
 *   - "FINAL" header with the final FP total
 *   - Top performer call-out (highest-scoring slot)
 *   - Per-position breakdown table (player + FP + token-fired flag)
 *
 * Sidebar continues to render its existing 'Final' headline state
 * + roster (each row's FP via `useLiveSlotFp`); cards section stays
 * usable. Only the LineupGrid area swaps to this summary.
 */

type SlotFillCompat = {
  slotId: string;
  card: LineupCardVM | null;
  liveFp: number;
  finalFp: number;
  appliedToken: {
    type?: string;
    bonusFp: number;
    triggered?: boolean | null;
  } | null;
  gameInfo: SlotGameInfo | null;
};

type Props = {
  finalScore: number;
  slateDate: string;
  slotFills: Record<LineupPosition, SlotFillCompat>;
};

export function ContestResultsSummary({ finalScore, slateDate, slotFills }: Props) {
  const filled = LINEUP_POSITIONS.map((pos) => ({ pos, fill: slotFills[pos] })).filter(
    (row) => row.fill.card !== null,
  );

  // §216 — top performer = highest contestFp slot. Ties broken by
  // earliest position in the lineup ordering (deterministic).
  const seed = filled[0];
  const topPerformer =
    filled.length > 0 && seed
      ? filled.reduce((best, row) => (slotFp(row.fill) > slotFp(best.fill) ? row : best), seed)
      : null;

  return (
    <div className="flex h-full w-full flex-col items-center gap-6 px-6 py-8">
      {/* Header — final score + label */}
      <header className="flex flex-col items-center gap-2 text-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--tier-gold)]">
          {slateDate} · Contest Final
        </span>
        <div className="flex items-center gap-3">
          <Trophy className="size-8 text-[var(--tier-gold)]" aria-hidden="true" />
          <span className="font-mono text-5xl font-bold tabular-nums text-[var(--text)]">
            {finalScore.toFixed(1)}
          </span>
        </div>
        <span className="font-mono text-xs uppercase tracking-wider text-[var(--text-3)]">
          Final FP
        </span>
      </header>

      {/* Top performer */}
      {topPerformer && slotFp(topPerformer.fill) > 0 && (
        <section className="flex flex-col items-center gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
            Top performer
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-3)]">
              {topPerformer.pos}
            </span>
            <span className="font-sans text-base font-semibold text-[var(--text)]">
              {topPerformer.fill.card?.playerName}
            </span>
            <span className="font-mono text-base font-bold tabular-nums text-emerald-400">
              {slotFp(topPerformer.fill).toFixed(1)} FP
            </span>
          </div>
        </section>
      )}

      {/* Per-position breakdown */}
      <section className="flex w-full max-w-xl flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
        <h3 className="border-b border-[var(--border)] pb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
          Lineup Breakdown
        </h3>
        <ol className="flex flex-col">
          {LINEUP_POSITIONS.map((pos) => {
            const fill = slotFills[pos];
            return (
              <SummaryRow key={pos} position={pos} fill={fill} isTop={topPerformer?.pos === pos} />
            );
          })}
        </ol>
      </section>

      {/* Empty-state callout when nothing scored. */}
      {finalScore === 0 && filled.length === 0 && (
        <p className="text-center text-[12px] text-[var(--text-3)]">
          No starters were rostered for this slate.
        </p>
      )}
      {finalScore === 0 && filled.length > 0 && (
        <p className="text-center text-[12px] text-[var(--text-3)]">
          Final score 0.0 — none of your rostered players had qualifying events.
        </p>
      )}

      {/* Footer — info-only; tomorrow's slate auto-creates at the 4 AM ET pivot. */}
      <p className="mt-auto text-center text-[11px] text-[var(--text-3)]">
        Tomorrow's slate auto-creates at 4 AM ET. Your sticky slots will carry over.
      </p>
    </div>
  );
}

function SummaryRow({
  position,
  fill,
  isTop,
}: {
  position: LineupPosition;
  fill: SlotFillCompat;
  isTop: boolean;
}) {
  const card = fill.card;
  if (!card) {
    return (
      <li className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 py-1.5 text-[12px]">
        <span className="font-mono text-[var(--text-3)]">{position}</span>
        <span className="text-[var(--text-3)] italic">No starter</span>
        <span className="font-mono tabular-nums text-[var(--text-3)]">—</span>
      </li>
    );
  }
  const fp = slotFp(fill);
  const token = fill.appliedToken;
  return (
    <li
      className={cn(
        "grid grid-cols-[3rem_1fr_auto_auto] items-center gap-2 border-b border-[var(--border)]/50 py-1.5 text-[12px] last:border-b-0",
        isTop && "bg-[var(--tier-gold)]/5",
      )}
    >
      <span className="font-mono text-[var(--text-3)]">{position}</span>
      <span className="truncate text-[var(--text-2)]">{card.playerName}</span>
      {token ? (
        <span
          className="font-mono text-[9px] uppercase tracking-wider text-[var(--tier-gold)]"
          title={`${TOKEN_LONG_LABEL[token.type as TokenType] ?? "Token"} ${
            token.triggered ? "fired" : token.triggered === false ? "missed" : "pending"
          }`}
        >
          {TOKEN_SHORT_LABEL[token.type as TokenType] ?? "·"}
          {token.triggered === true && " ✓"}
          {token.triggered === false && " ✗"}
        </span>
      ) : (
        <span />
      )}
      <span
        className={cn(
          "text-right font-mono font-semibold tabular-nums",
          fp > 0 ? "text-[var(--text)]" : "text-[var(--text-3)]",
          isTop && "text-emerald-400",
        )}
      >
        {fp.toFixed(1)}
      </span>
    </li>
  );
}

function slotFp(fill: SlotFillCompat): number {
  // §215: live_fp is the running total from the trigger. final_fp
  // is reconcile's authoritative pass. Use whichever is non-zero
  // (sandbox-safe), or just live_fp when both populated.
  return Math.max(fill.liveFp, fill.finalFp);
}
