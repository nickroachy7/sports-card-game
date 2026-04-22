"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createBrowserClient } from "@/lib/db/supabase-browser";
import {
  eventActionLabel,
  eventFpDelta,
  FEED_EVENT_TYPES,
  type FpDeltaRole,
} from "@/lib/mlb/event-fp-delta";

/**
 * Polish spec §21–§22 — shared live-event stream.
 *
 * Hoisted out of EventFeed so multiple surfaces (Event Feed,
 * per-slot diamond glow, status-chip inning narration) can
 * consume the same Realtime channel without duplicating the
 * subscription.
 *
 * Behavior preserved 1:1 from the original EventFeed
 * implementation:
 *   - Initial fetch: 20 most-recent matching game_event rows.
 *   - Realtime subscription prepends new INSERTs.
 *   - Dedupe via game_event.id (seen-set ref).
 *   - Bounded at 50 entries.
 *   - Filters to events touching any `lineupPlayers` via
 *     batter_player_id or pitcher_player_id.
 *
 * Scope: mount this provider only in post-submit state. The
 * provider early-returns on empty `playerIds` / `contestGameIds`
 * so it's safe to mount with empty arrays too, but there's no
 * reason to pay the channel cost before the user has submitted.
 */

export type FeedPlayer = {
  playerId: string;
  /** Short form name used in the feed row (e.g., "J. Lee"). */
  displayName: string;
};

export type FeedEvent = {
  id: string;
  playerId: string;
  player: string;
  action: string;
  delta: number;
  timeLabel: string;
  inning: number | null;
  inningHalf: "top" | "bottom" | null;
};

export type ConnectionStatus = "connecting" | "live" | "reconnecting";

type RawGameEvent = {
  id: string;
  event_type: string;
  play_type: string | null;
  batter_player_id: string | null;
  pitcher_player_id: string | null;
  event_at: string;
  inning: number | null;
  inning_half: string | null;
};

type LatestInning = { inning: number; half: "top" | "bottom" } | null;

type LiveEventsContextValue = {
  events: FeedEvent[];
  status: ConnectionStatus;
  latestByPlayerId: Map<string, FeedEvent>;
  latestInning: LatestInning;
};

const LiveEventsContext = createContext<LiveEventsContextValue | null>(null);

type Props = {
  lineupPlayers: FeedPlayer[];
  /** Filters the initial fetch to contest games only (reduces payload). */
  contestGameIds: string[];
  children: ReactNode;
};

export function LiveEventsProvider({ lineupPlayers, contestGameIds, children }: Props) {
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
        .select(
          "id, event_type, play_type, batter_player_id, pitcher_player_id, event_at, inning, inning_half",
        )
        .in("game_id", contestGameIds)
        .or(
          `batter_player_id.in.(${playerIds.join(",")}),pitcher_player_id.in.(${playerIds.join(",")})`,
        )
        .order("event_at", { ascending: false })
        .limit(20);
      if (cancelled || error) return;
      const rows = (data ?? []) as RawGameEvent[];
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

    // 2) Realtime subscription — three event sources (polish spec §47):
    //    - game_event INSERT: per-player batting/pitching narration.
    //    - game UPDATE: status transitions (scheduled → live, live →
    //      final) synthesized into game-start / game-end feed lines.
    //    - token_application UPDATE: triggered flip renders as a
    //      token fire/miss line.
    const contestGameIdSet = new Set(contestGameIds);
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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game" }, (payload) => {
        const prev = payload.old as Partial<RawGameRow>;
        const next = payload.new as Partial<RawGameRow>;
        const id = next.id;
        if (typeof id !== "string" || !contestGameIdSet.has(id)) return;
        const fe = projectGameTransition(prev, next);
        if (!fe) return;
        if (seenIdsRef.current.has(fe.id)) return;
        seenIdsRef.current.add(fe.id);
        setEvents((prevState) => [fe, ...prevState].slice(0, 50));
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "token_application" },
        (payload) => {
          const prev = payload.old as Partial<RawTokenAppRow>;
          const next = payload.new as Partial<RawTokenAppRow>;
          const fe = projectTokenTrigger(prev, next);
          if (!fe) return;
          if (seenIdsRef.current.has(fe.id)) return;
          seenIdsRef.current.add(fe.id);
          setEvents((prevState) => [fe, ...prevState].slice(0, 50));
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

  // Derive per-player latest + latest-inning from events. `events` is
  // already newest-first (we prepend on INSERT + initial fetch orders
  // by event_at DESC), so the first match wins.
  const value = useMemo<LiveEventsContextValue>(() => {
    const latestByPlayerId = new Map<string, FeedEvent>();
    let latestInning: LatestInning = null;
    for (const e of events) {
      if (!latestByPlayerId.has(e.playerId)) latestByPlayerId.set(e.playerId, e);
      if (latestInning === null && e.inning !== null && e.inningHalf !== null) {
        latestInning = { inning: e.inning, half: e.inningHalf };
      }
    }
    return { events, status, latestByPlayerId, latestInning };
  }, [events, status]);

  return <LiveEventsContext.Provider value={value}>{children}</LiveEventsContext.Provider>;
}

// ── Hooks ──────────────────────────────────────────────────────────────

/**
 * Full event list (newest-first, 50-bounded) + connection status.
 *
 * Throws if called outside `<LiveEventsProvider>` — the Event Feed
 * should never render in the building state. This is the loud-fail
 * on-the-wrong-side case we want.
 */
export function useLiveEvents(): { events: FeedEvent[]; status: ConnectionStatus } {
  const ctx = useContext(LiveEventsContext);
  if (!ctx) {
    throw new Error(
      "useLiveEvents must be used inside <LiveEventsProvider>. Wrap the post-submit subtree.",
    );
  }
  const { events, status } = ctx;
  return { events, status };
}

/**
 * Most-recent event for `playerId`, or null. Returns null gracefully
 * outside the provider — `LineupSlot` renders in every state
 * (building / submitted / live / final) but the provider only mounts
 * post-submit, so this hook has to survive both sides.
 */
export function useLatestPlayerEvent(playerId: string | null | undefined): FeedEvent | null {
  const ctx = useContext(LiveEventsContext);
  if (!ctx || !playerId) return null;
  return ctx.latestByPlayerId.get(playerId) ?? null;
}

/**
 * Inning from the most recent event with inning set, or null. Like
 * `useLatestPlayerEvent`, safe outside the provider.
 */
export function useLatestInning(): LatestInning {
  const ctx = useContext(LiveEventsContext);
  return ctx?.latestInning ?? null;
}

// ── helpers ────────────────────────────────────────────────────────────

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
    playerId: matched.playerId,
    player: matched.displayName,
    action: eventActionLabel(row.event_type, row.play_type),
    delta: eventFpDelta(row.event_type, row.play_type, role),
    timeLabel: new Date(row.event_at).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
    inning: row.inning,
    inningHalf: normalizeHalf(row.inning_half),
  };
}

function normalizeHalf(raw: string | null): "top" | "bottom" | null {
  if (raw === "top" || raw === "bottom") return raw;
  return null;
}

// ── Game-state + token narration (polish spec §47) ─────────────────────

type RawGameRow = {
  id: string;
  status: string;
  home_runs: number | null;
  away_runs: number | null;
  // Not all rows carry these; we only read them best-effort for final copy.
};

type RawTokenAppRow = {
  id: string;
  triggered: boolean | null;
  bonus_fp_awarded: string | number | null;
};

function projectGameTransition(
  prev: Partial<RawGameRow>,
  next: Partial<RawGameRow>,
): FeedEvent | null {
  const id = next.id;
  if (typeof id !== "string") return null;
  const prevStatus = prev.status ?? null;
  const nextStatus = next.status ?? null;
  if (prevStatus === nextStatus) return null;

  const now = new Date();
  const timeLabel = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  if (prevStatus === "scheduled" && nextStatus === "live") {
    return {
      id: `game-start-${id}`,
      playerId: id, // not a player — using game id so dedup works per game.
      player: "⚾ Game",
      action: "First pitch",
      delta: 0,
      timeLabel,
      inning: null,
      inningHalf: null,
    };
  }
  if (prevStatus === "live" && nextStatus === "final") {
    const score =
      typeof next.home_runs === "number" && typeof next.away_runs === "number"
        ? ` · ${next.home_runs}-${next.away_runs}`
        : "";
    return {
      id: `game-end-${id}`,
      playerId: id,
      player: "⚾ Game",
      action: `Final${score}`,
      delta: 0,
      timeLabel,
      inning: null,
      inningHalf: null,
    };
  }
  return null;
}

function projectTokenTrigger(
  prev: Partial<RawTokenAppRow>,
  next: Partial<RawTokenAppRow>,
): FeedEvent | null {
  const id = next.id;
  if (typeof id !== "string") return null;
  // Only fire on the null → true/false transition (initial resolve).
  if (prev.triggered !== null && prev.triggered !== undefined) return null;
  if (next.triggered === null || next.triggered === undefined) return null;

  const bonus = Number(next.bonus_fp_awarded ?? 0);
  const now = new Date();
  const timeLabel = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const action = next.triggered ? `Token hit · +${bonus.toFixed(1)} FP` : "Token missed";
  return {
    id: `token-app-${id}`,
    playerId: id,
    player: "🪙 Token",
    action,
    delta: next.triggered ? bonus : 0,
    timeLabel,
    inning: null,
    inningHalf: null,
  };
}
