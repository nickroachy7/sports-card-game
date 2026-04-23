"use client";

import { SidebarSection } from "@/components/layout/sidebar-card";
import {
  type ConnectionStatus,
  type FeedEvent,
  useLiveEvents,
} from "@/components/lineup/LiveEventsProvider";
import { cn } from "@/lib/utils";

/**
 * Polish spec §16.3 — Event Feed.
 *
 * Pure consumer of <LiveEventsProvider> — the Realtime
 * subscription + event projection logic lives there so multiple
 * surfaces (this feed + per-slot glow + status chip) share one
 * channel. See LiveEventsProvider.tsx for the subscription
 * contract; see polish spec §21 for the architecture rationale.
 */

export function EventFeed() {
  const { events, status } = useLiveEvents();

  return (
    <SidebarSection
      title={
        <span className="flex items-center gap-2">
          <span>Event Feed</span>
          <ConnectionDot status={status} />
        </span>
      }
      className="min-h-0 flex-1 overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        {events.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-[var(--text-3)]">
            Waiting for first pitch…
          </p>
        ) : (
          <ol className="flex flex-col gap-1">
            {events.map((e) => (
              <FeedRow key={e.id} event={e} />
            ))}
          </ol>
        )}
      </div>
    </SidebarSection>
  );
}

function FeedRow({ event: e }: { event: FeedEvent }) {
  // Polish spec §69 (Phase 23) — inline matchup chip. Rendered next to
  // the existing timeLabel so users can tell which game an event
  // belongs to without hunting. Chip tone mirrors the muted state
  // pills from §62. Null matchup = no chip (token events, initial
  // render races where the matchup map hasn't loaded).
  return (
    <li className="grid grid-cols-[1fr_auto] items-baseline gap-2 text-[11px] leading-tight">
      <span className="truncate text-[var(--text-2)]">
        <span className="font-medium text-[var(--text)]">{e.player}</span>
        {" · "}
        {e.action}
      </span>
      <span
        className={cn(
          "text-right font-mono tabular-nums",
          e.delta > 0 && "font-semibold text-[var(--text)]",
          e.delta < 0 && "text-[#C47262]",
          e.delta === 0 && "text-[var(--text-3)]",
        )}
      >
        {fmtDelta(e.delta)}
      </span>
      <span className="-mt-0.5 col-span-2 flex items-center gap-1.5 text-[10px] text-[var(--text-3)]">
        <span>{e.timeLabel}</span>
        {e.gameMatchup && (
          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0 font-mono text-[9px] uppercase tracking-wider">
            {e.gameMatchup}
          </span>
        )}
      </span>
    </li>
  );
}

// ── helpers ────────────────────────────────────────────────────────────

function fmtDelta(d: number): string {
  if (d === 0) return "0.0";
  if (d > 0) return `+${d.toFixed(1)}`;
  return d.toFixed(1);
}

function ConnectionDot({ status }: { status: ConnectionStatus }) {
  const tone =
    status === "live"
      ? "bg-emerald-400"
      : status === "connecting"
        ? "bg-amber-400"
        : "bg-[#C47262]";
  const label =
    status === "live" ? "live" : status === "connecting" ? "connecting…" : "reconnecting…";
  return (
    <span
      className="flex items-center gap-1 text-[9px] normal-case tracking-normal text-[var(--text-3)]"
      title={label}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", tone)} />
      {status !== "live" && <span>{label}</span>}
    </span>
  );
}
