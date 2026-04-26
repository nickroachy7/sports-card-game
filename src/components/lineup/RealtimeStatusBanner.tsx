"use client";

import { Loader2 } from "lucide-react";

import { useLiveConnectionStatus } from "@/components/lineup/LiveEventsProvider";
import { cn } from "@/lib/utils";

/**
 * Polish spec §211 (Phase 51). Realtime channel status indicator.
 *
 * Renders a slim banner at the top of the lineup shell when the
 * Supabase Realtime channel is in `connecting` or `reconnecting`
 * state. Live state hides the banner. Auto-clears once the channel
 * resubscribes (Supabase channel handles the retry).
 *
 * Design intent: a subtle "your data may be slightly behind" cue
 * during transient blips. Not a full-page error — most disconnects
 * resolve within a few seconds and we shouldn't block the UI.
 */
export function RealtimeStatusBanner() {
  const status = useLiveConnectionStatus();
  if (status === "live") return null;
  const label = status === "connecting" ? "Connecting…" : "Reconnecting…";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed top-0 left-0 right-0 z-50",
        "flex items-center justify-center gap-1.5 border-b border-[var(--border)]",
        "bg-[var(--surface-2)]/95 px-3 py-1 backdrop-blur",
        "font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]",
      )}
    >
      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      <span>{label}</span>
      <span className="ml-1 text-[var(--text-3)]/60">Live data paused — auto-retrying.</span>
    </div>
  );
}
