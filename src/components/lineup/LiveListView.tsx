"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { formatTokenLabel } from "@/components/lineup/LineupSlot";
import type { LineupPosition } from "@/lib/contracts/lineup";
import { LINEUP_POSITIONS } from "@/lib/contracts/lineup";
import type { LineupCardVM } from "@/lib/lineup/types";
import { cn } from "@/lib/utils";

type SlotLive = {
  position: LineupPosition;
  card: LineupCardVM | null;
  liveFp: number;
  finalFp: number;
  appliedToken: {
    type: string;
    bonusFp: number;
    triggered: boolean | null;
    bonusFpAwarded: number;
  } | null;
};

type RecentEvent = {
  id: string;
  ts: string;
  text: string;
  fp: number | null;
};

type Props = {
  contestName: string;
  status: "submitted" | "live" | "final";
  liveScore: number;
  finalScore: number;
  slots: SlotLive[];
  recentEvents: RecentEvent[];
  /** When true, polls the server every N seconds (live state only). */
  pollMs?: number;
};

/**
 * UI/UX spec §5.1.3 / §5.1.4 — list view shown after the lineup locks.
 * Renders one row per slot with player name + team + position, live or
 * final FP, and the applied token's status (pending / triggered / missed).
 * Recent-events feed sits below the lineup.
 */
export function LiveListView({
  contestName,
  status,
  liveScore,
  finalScore,
  slots,
  recentEvents,
  pollMs = 10_000,
}: Props) {
  const router = useRouter();
  const isFinal = status === "final";
  const score = isFinal ? finalScore : liveScore;

  // Polling tick — reasonable for "live" status. router.refresh() refetches
  // server data without a full nav. Realtime subscriptions land in P3.7.
  useEffect(() => {
    if (status !== "live") return;
    const t = setInterval(() => router.refresh(), pollMs);
    return () => clearInterval(t);
  }, [status, router, pollMs]);

  return (
    <div className="flex min-h-full flex-col bg-[var(--bg)]">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3">
        <div className="flex flex-col">
          <h1 className="font-sans text-base font-bold tracking-tight text-[var(--text)]">
            {contestName}
          </h1>
          <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
            {status === "submitted" && "Locked · waiting on first pitch"}
            {status === "live" && "Live"}
            {status === "final" && "Final"}
          </span>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">
            {isFinal ? "Final score" : "Live score"}
          </div>
          <div className="font-mono text-2xl font-bold text-[var(--text)]">{score.toFixed(2)}</div>
        </div>
      </header>

      {/* Slot list */}
      <div className="flex-1 overflow-auto">
        <ul className="divide-y divide-[var(--border)]">
          {LINEUP_POSITIONS.map((pos) => {
            const slot = slots.find((s) => s.position === pos);
            if (!slot) return null;
            return <SlotRow key={pos} slot={slot} isFinal={isFinal} />;
          })}
        </ul>
      </div>

      {/* Recent events feed */}
      {recentEvents.length > 0 && (
        <section className="max-h-48 overflow-auto border-t border-[var(--border)] bg-[var(--surface)] px-6 py-3">
          <h2 className="mb-2 text-xs uppercase tracking-wider text-[var(--text-3)]">
            Recent events
          </h2>
          <ul className="flex flex-col gap-1">
            {recentEvents.map((e) => (
              <li
                key={e.id}
                className="flex items-baseline justify-between gap-3 text-xs text-[var(--text-2)]"
              >
                <span className="truncate">{e.text}</span>
                {e.fp !== null && (
                  <span
                    className={cn(
                      "shrink-0 font-mono font-bold",
                      e.fp > 0 ? "text-[var(--text)]" : "text-[#C47262]",
                    )}
                  >
                    {e.fp > 0 ? "+" : ""}
                    {e.fp.toFixed(2)} FP
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SlotRow({ slot, isFinal }: { slot: SlotLive; isFinal: boolean }) {
  const fp = isFinal ? slot.finalFp : slot.liveFp;
  const card = slot.card;
  const tok = slot.appliedToken;

  return (
    <li className="flex items-center justify-between gap-4 px-6 py-2.5 hover:bg-[var(--surface)]">
      <div className="flex items-center gap-4">
        <span className="w-8 font-mono text-[11px] uppercase tracking-wider text-[var(--text-3)]">
          {slot.position}
        </span>
        {card ? (
          <div className="flex flex-col">
            <span className="font-sans text-sm font-medium text-[var(--text)]">
              {card.playerName}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">
              {card.teamAbbreviation ?? "—"}
              {card.position && <span> · {card.position}</span>}
            </span>
          </div>
        ) : (
          <span className="text-sm text-[var(--text-3)]">empty</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {tok && (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              tok.triggered === true && "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]",
              tok.triggered === false && "border-[var(--muted)] text-[var(--muted)]",
              tok.triggered === null &&
                "border-[var(--tier-gold,#D4A647)] text-[var(--tier-gold,#D4A647)]",
            )}
            title={
              tok.triggered === true
                ? `${formatTokenLabel(tok.type)} triggered · +${tok.bonusFpAwarded} FP`
                : tok.triggered === false
                  ? `${formatTokenLabel(tok.type)} missed`
                  : `${formatTokenLabel(tok.type)} pending · +${tok.bonusFp} on trigger`
            }
          >
            {formatTokenLabel(tok.type)}
            {tok.triggered === true && " ✓"}
          </span>
        )}
        <span
          className={cn(
            "w-16 text-right font-mono text-sm font-bold",
            fp > 0 ? "text-[var(--text)]" : "text-[var(--text-3)]",
          )}
        >
          {fp.toFixed(2)}
        </span>
      </div>
    </li>
  );
}
