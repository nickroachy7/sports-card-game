"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";

import { SidebarSection } from "@/components/layout/sidebar-card";
import { createBrowserClient } from "@/lib/db/supabase-browser";
import {
  eventActionLabel,
  eventFpDelta,
  FEED_EVENT_TYPES,
  type FpDeltaRole,
} from "@/lib/mlb/event-fp-delta";
import { cn } from "@/lib/utils";

/**
 * Polish spec §16.3 — Event Feed.
 *
 * Subscribes to `game_event` INSERTs via Supabase Realtime, filters
 * client-side to events where the batter_player_id or
 * pitcher_player_id matches a player in this lineup, and renders
 * one row per event in reverse-chronological order.
 *
 * Initial content: the 20 most recent matching events via a one-shot
 * `.select()`. After that, Realtime prepends as events land.
 *
 * Bounded at 50 entries. Dedupe keyed on game_event.id (which is
 * stable per row; we also have provider_event_id if we ever see
 * dupes from the webhook + initial-fetch race, but id suffices).
 */

type FeedPlayer = {
  playerId: string;
  /** Short form name used in the feed row (e.g., "J. Lee"). */
  displayName: string;
};

type FeedEvent = {
  id: string;
  player: string;
  action: string;
  delta: number;
  timeLabel: string;
};

type ConnectionStatus = "connecting" | "live" | "reconnecting";

type Props = {
  lineupPlayers: FeedPlayer[];
  /** Filters the initial fetch to contest games only (reduces payload). */
  contestGameIds: string[];
};

export function EventFeed({ lineupPlayers, contestGameIds }: Props) {
  const playerIds = useMemo(() => lineupPlayers.map((p) => p.playerId), [lineupPlayers]);
  const playerLookup = useMemo(() => {
    const map = new Map<string, FeedPlayer>();
    for (const p of lineupPlayers) map.set(p.playerId, p);
    return map;
  }, [lineupPlayers]);

  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const seenIdsRef = useRef<Set<string>>(new Set());
  const supabaseRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    const supabase = supabaseRef.current ?? createBrowserClient();
    supabaseRef.current = supabase;

    let cancelled = false;

    // 1) Initial fetch — get recent events touching the lineup.
    (async () => {
      if (playerIds.length === 0 || contestGameIds.length === 0) return;
      const { data, error } = await supabase
        .from("game_event")
        .select("id, event_type, play_type, batter_player_id, pitcher_player_id, event_at")
        .in("game_id", contestGameIds)
        .or(
          `batter_player_id.in.(${playerIds.join(",")}),pitcher_player_id.in.(${playerIds.join(",")})`,
        )
        .order("event_at", { ascending: false })
        .limit(20);
      if (cancelled || error) return;
      const rows = data ?? [];
      const mapped: FeedEvent[] = [];
      for (const row of rows) {
        const fe = projectRow(row, playerLookup);
        if (fe && !seenIdsRef.current.has(fe.id)) {
          seenIdsRef.current.add(fe.id);
          mapped.push(fe);
        }
      }
      setEvents(mapped);
    })();

    // 2) Realtime subscription — prepend incoming matching events.
    const channel = supabase
      .channel(`lineup-events-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_event" },
        (payload) => {
          const row = payload.new as RawGameEvent;
          const fe = projectRow(row, playerLookup);
          if (!fe) return;
          if (seenIdsRef.current.has(fe.id)) return;
          seenIdsRef.current.add(fe.id);
          setEvents((prev) => [fe, ...prev].slice(0, 50));
        },
      )
      .subscribe((subStatus) => {
        if (cancelled) return;
        if (subStatus === "SUBSCRIBED") setStatus("live");
        else if (subStatus === "CHANNEL_ERROR" || subStatus === "CLOSED") {
          setStatus("reconnecting");
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [playerIds, playerLookup, contestGameIds]);

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
              <li
                key={e.id}
                className="grid grid-cols-[1fr_auto] items-baseline gap-2 text-[11px] leading-tight"
              >
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
                <span className="col-span-2 -mt-0.5 text-[10px] text-[var(--text-3)]">
                  {e.timeLabel}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </SidebarSection>
  );
}

// ── helpers ────────────────────────────────────────────────────────────

type RawGameEvent = {
  id: string;
  event_type: string;
  play_type: string | null;
  batter_player_id: string | null;
  pitcher_player_id: string | null;
  event_at: string;
};

function projectRow(row: RawGameEvent, players: Map<string, FeedPlayer>): FeedEvent | null {
  if (!FEED_EVENT_TYPES.has(row.event_type)) return null;
  // A lineup player may be the batter, the pitcher, or both (rare but
  // possible if user owns both sides of a matchup). Prefer the player
  // that's actually in our lineup; if both, prefer the batter since
  // that's the more common display convention.
  const batter = row.batter_player_id ? players.get(row.batter_player_id) : undefined;
  const pitcher = row.pitcher_player_id ? players.get(row.pitcher_player_id) : undefined;
  const matched = batter ?? pitcher;
  if (!matched) return null;
  const role: FpDeltaRole = batter ? "batter" : "pitcher";
  return {
    id: row.id,
    player: matched.displayName,
    action: eventActionLabel(row.event_type, row.play_type),
    delta: eventFpDelta(row.event_type, row.play_type, role),
    timeLabel: new Date(row.event_at).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

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
