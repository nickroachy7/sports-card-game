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
import { applyGameStateTrustGate } from "@/lib/lineup/game-trust";
import type { LiveGameStateSnapshot } from "@/lib/lineup/types";
import {
  eventActionLabel,
  eventFpDelta,
  FEED_EVENT_TYPES,
  type FpDeltaRole,
} from "@/lib/mlb/event-fp-delta";

/**
 * Polish spec §21–§22 + §206-§212 (Phase 51) — shared live data
 * provider for the lineup page.
 *
 * Original scope: live event narration (the Event Feed).
 *
 * Phase 51 scope: also drives ALL realtime-derived UI on the
 * lineup page. The audit found that `contest_lineup_slot`,
 * `contest_entry`, and `game` updates were either not published
 * or had no consumer. This provider now subscribes to:
 *
 *   - `game_event` INSERT       — event feed narration
 *   - `game` UPDATE             — game-state pill (inning/outs/score)
 *   - `contest_lineup_slot` UPDATE — per-card live_fp + final_fp
 *   - `contest_entry` UPDATE      — sidebar big LIVE score
 *   - `token_application` UPDATE  — token fire/miss narration
 *
 * Initial state for each surface seeds from server-rendered
 * props; realtime UPDATEs override. Hooks (`useLiveSlotFp`,
 * `useLiveEntryScore`, `useLiveGameState`) expose the merged
 * state to components.
 *
 * Time-gate: events whose `created_at < game.scheduled_start`
 * are filtered out of the feed entirely, matching the live_fp
 * trigger gate from §202. Pre-sim BDL noise that doesn't credit
 * shouldn't appear in the user's feed claiming "+12 FP".
 *
 * Always mounted on the lineup page (any entry status). RLS
 * scopes broadcasts to the user's own rows.
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
  /** Polish spec §69 (Phase 23). Pre-formatted `"{away}@{home}"` for
   *  the game this event belongs to. Null if the game isn't in our
   *  matchup map (rare initial-render race). */
  gameMatchup: string | null;
};

export type ConnectionStatus = "connecting" | "live" | "reconnecting";

type RawGameEvent = {
  id: string;
  game_id: string;
  event_type: string;
  play_type: string | null;
  batter_player_id: string | null;
  pitcher_player_id: string | null;
  event_at: string;
  /**
   * Polish spec §206 (Phase 51). Used by the time-gate filter to
   * drop events whose row INSERT preceded the game's
   * `scheduled_start` — i.e. BDL pre-sim noise that doesn't credit
   * `live_fp`. Mirrors the predicate in `_apply_game_event_to_lineups`.
   */
  created_at: string;
  inning: number | null;
  inning_half: string | null;
};

type LatestInning = { inning: number; half: "top" | "bottom" } | null;

/**
 * Polish spec §208 (Phase 51). Per-game live state alias.
 * Re-exported for legacy callers; canonical shape lives in
 * `@/lib/lineup/types` so server-side prop consumers can import
 * it without dragging in a "use client" module.
 */
export type LiveGameState = LiveGameStateSnapshot;

/**
 * Polish spec §207 (Phase 51). Per-slot live FP data.
 * Subscribed via `contest_lineup_slot` UPDATE realtime channel.
 * Components consume via `useLiveSlotFp(slotId)`.
 */
export type LiveSlotFpData = {
  liveFp: number;
  finalFp: number;
};

type LiveEntryScore = {
  liveScore: number;
  finalScore: number;
};

type LiveEventsContextValue = {
  events: FeedEvent[];
  status: ConnectionStatus;
  latestByPlayerId: Map<string, FeedEvent>;
  latestInning: LatestInning;
  // §207-§208 (Phase 51).
  slotFp: Map<string, LiveSlotFpData>;
  entryScore: LiveEntryScore;
  gameState: Map<string, LiveGameState>;
};

const LiveEventsContext = createContext<LiveEventsContextValue | null>(null);

type Props = {
  lineupPlayers: FeedPlayer[];
  /** Filters the initial fetch to contest games only (reduces payload). */
  contestGameIds: string[];
  /** Polish spec §69 (Phase 23). `game.id → "{away}@{home}"` pre-built
   *  by the server. Events that arrive via Realtime use this to render
   *  the matchup chip inline with the inning. */
  gameMatchupById: Record<string, string>;
  /**
   * Polish spec §207 (Phase 51). Server-rendered seed of the user's
   * lineup-slot FP. Realtime UPDATEs override entries by slotId.
   */
  slotsInitial: { slotId: string; liveFp: number; finalFp: number }[];
  /**
   * Polish spec §207. Server-rendered seed of the entry's running
   * scores. Realtime UPDATE on `contest_entry` overrides.
   */
  entryScoreInitial: LiveEntryScore;
  /**
   * Polish spec §208. Server-rendered seed of per-game state.
   * Realtime UPDATE on `game` overrides. Time-gate filter for the
   * event feed reads `scheduledStart` from this map.
   */
  gameStateInitial: Record<string, LiveGameState>;
  /**
   * Polish spec §207. The user's contest_entry id. Used to filter
   * `contest_lineup_slot` realtime UPDATEs to only those owned by
   * this entry (RLS already scopes broadcasts, but the filter
   * narrows the contract for callers).
   */
  entryId: string;
  children: ReactNode;
};

export function LiveEventsProvider({
  lineupPlayers,
  contestGameIds,
  gameMatchupById,
  slotsInitial,
  entryScoreInitial,
  gameStateInitial,
  entryId,
  children,
}: Props) {
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

  // Phase 51 — live state Maps. Initial values seeded from props; the
  // Realtime channel's UPDATE handlers merge in fresh values.
  const [slotFp, setSlotFp] = useState<Map<string, LiveSlotFpData>>(() => {
    const m = new Map<string, LiveSlotFpData>();
    for (const s of slotsInitial) {
      m.set(s.slotId, { liveFp: s.liveFp, finalFp: s.finalFp });
    }
    return m;
  });
  const [entryScore, setEntryScore] = useState<LiveEntryScore>(entryScoreInitial);
  const [gameState, setGameState] = useState<Map<string, LiveGameState>>(() => {
    const m = new Map<string, LiveGameState>();
    for (const [id, gs] of Object.entries(gameStateInitial)) m.set(id, gs);
    return m;
  });

  // Re-seed when server-rendered props change (e.g. router.refresh()
  // after a mutation). Realtime UPDATEs after re-seed continue to
  // override.
  useEffect(() => {
    setSlotFp(() => {
      const m = new Map<string, LiveSlotFpData>();
      for (const s of slotsInitial) {
        m.set(s.slotId, { liveFp: s.liveFp, finalFp: s.finalFp });
      }
      return m;
    });
  }, [slotsInitial]);
  useEffect(() => {
    setEntryScore(entryScoreInitial);
  }, [entryScoreInitial]);
  useEffect(() => {
    setGameState(() => {
      const m = new Map<string, LiveGameState>();
      for (const [id, gs] of Object.entries(gameStateInitial)) m.set(id, gs);
      return m;
    });
  }, [gameStateInitial]);

  useEffect(() => {
    const supabase = supabaseRef.current ?? createBrowserClient();
    supabaseRef.current = supabase;

    let cancelled = false;

    // 1) Initial fetch — get recent events touching the lineup.
    // §206 — fetch a wider window (60) and post-filter via the
    // time-gate so the displayed feed stays full at 20 even when
    // many events get rejected as pre-sim noise.
    (async () => {
      if (playerIds.length === 0 || contestGameIds.length === 0) return;
      const { data, error } = await supabase
        .from("game_event")
        .select(
          "id, game_id, event_type, play_type, batter_player_id, pitcher_player_id, event_at, created_at, inning, inning_half",
        )
        .in("game_id", contestGameIds)
        .or(
          `batter_player_id.in.(${playerIds.join(",")}),pitcher_player_id.in.(${playerIds.join(",")})`,
        )
        .order("event_at", { ascending: false })
        .limit(60);
      if (cancelled || error) return;
      const rows = (data ?? []) as RawGameEvent[];
      const mapped: FeedEvent[] = [];
      for (const row of rows) {
        if (!passesTimeGate(row, gameStateInitial)) continue;
        const fe = projectRow(row, playerLookup, gameMatchupById);
        if (fe && !seenIdsRef.current.has(fe.id)) {
          seenIdsRef.current.add(fe.id);
          mapped.push(fe);
        }
        if (mapped.length >= 20) break;
      }
      setEvents(mapped);
    })();

    // 2) Realtime subscription — five event sources (polish spec
    //    §47 + §206-§208):
    //    - game_event INSERT: per-player batting/pitching narration.
    //    - game UPDATE: status transitions narrated in the feed AND
    //      gameState map updated for the SlotGameState pill.
    //    - contest_lineup_slot UPDATE: per-card live_fp / final_fp.
    //    - contest_entry UPDATE: entry-level live_score / final_score.
    //    - token_application UPDATE: triggered flip narrates in feed.
    const contestGameIdSet = new Set(contestGameIds);
    const channel = supabase
      .channel(`lineup-events-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_event" },
        (payload) => {
          const row = payload.new as RawGameEvent;
          // §206 — apply the same time-gate as the live_fp trigger.
          if (!passesTimeGate(row, gameStateRef.current)) return;
          const fe = projectRow(row, playerLookup, gameMatchupById);
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
        // §208 — update gameState map first so SlotGameState pill
        // re-renders inning/outs/score.
        applyGameStateUpdate(setGameState, next);
        // Then narrate status transitions in the feed.
        const fe = projectGameTransition(prev, next, gameMatchupById);
        if (!fe) return;
        if (seenIdsRef.current.has(fe.id)) return;
        seenIdsRef.current.add(fe.id);
        setEvents((prevState) => [fe, ...prevState].slice(0, 50));
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "contest_lineup_slot" },
        (payload) => {
          // §207 — RLS scopes the broadcast to the user's own rows;
          // additional entryId guard here is belt-and-suspenders.
          const next = payload.new as Partial<RawSlotRow>;
          const slotId = next.id;
          if (typeof slotId !== "string") return;
          if (next.contest_entry_id && next.contest_entry_id !== entryId) return;
          const liveFp = next.live_fp != null ? Number(next.live_fp) : 0;
          const finalFp = next.final_fp != null ? Number(next.final_fp) : 0;
          setSlotFp((prev) => {
            const m = new Map(prev);
            m.set(slotId, { liveFp, finalFp });
            return m;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "contest_entry" },
        (payload) => {
          // §207 — entry-level score broadcast.
          const next = payload.new as Partial<RawEntryRow>;
          if (next.id !== entryId) return;
          const liveScore = next.live_score != null ? Number(next.live_score) : 0;
          const finalScore = next.final_score != null ? Number(next.final_score) : 0;
          setEntryScore({ liveScore, finalScore });
        },
      )
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
  }, [playerIds, playerLookup, contestGameIds, gameMatchupById, gameStateInitial, entryId]);

  // Mirror of the `gameState` Map that lives on a ref so realtime
  // INSERT handlers (which capture `gameStateInitial` at mount time)
  // can read the freshest values without re-binding the channel.
  const gameStateRef = useRef<Map<string, LiveGameState>>(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

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
    return { events, status, latestByPlayerId, latestInning, slotFp, entryScore, gameState };
  }, [events, status, slotFp, entryScore, gameState]);

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

/**
 * Polish spec §207 (Phase 51). Live FP for a single slot.
 * Returns null outside the provider so callers can fall back to
 * server-rendered props gracefully.
 */
export function useLiveSlotFp(slotId: string | null | undefined): LiveSlotFpData | null {
  const ctx = useContext(LiveEventsContext);
  if (!ctx || !slotId) return null;
  return ctx.slotFp.get(slotId) ?? null;
}

/**
 * Polish spec §207. Entry-level live + final score.
 * Returns null outside the provider.
 */
export function useLiveEntryScore(): LiveEntryScore | null {
  const ctx = useContext(LiveEventsContext);
  if (!ctx) return null;
  return ctx.entryScore;
}

/**
 * Polish spec §208 (Phase 51). Live game state (inning/outs/score)
 * for a specific game. Each slot's pill calls this with the
 * gameId of its player's game. Returns null outside the provider
 * or when the gameId isn't tracked.
 */
export function useLiveGameState(gameId: string | null | undefined): LiveGameState | null {
  const ctx = useContext(LiveEventsContext);
  if (!ctx || !gameId) return null;
  return ctx.gameState.get(gameId) ?? null;
}

/**
 * Polish spec §211 (Phase 51). Connection status for the realtime
 * channel. Banner consumer reads this to render a "Reconnecting…"
 * indicator on disconnect.
 */
export function useLiveConnectionStatus(): ConnectionStatus {
  const ctx = useContext(LiveEventsContext);
  return ctx?.status ?? "connecting";
}

// ── helpers ────────────────────────────────────────────────────────────

/**
 * Polish spec §206 (Phase 51). Reject events whose row INSERT
 * preceded the game's `scheduled_start` — these are BDL pre-sim
 * noise that the live_fp trigger correctly skips. The feed
 * shouldn't display them either.
 *
 * Games not present in the gameState map (or with NULL
 * scheduled_start) are also rejected — without a known start
 * time we can't admit the event.
 */
function passesTimeGate(
  row: RawGameEvent,
  gameStateInitial: Record<string, LiveGameState> | Map<string, LiveGameState>,
): boolean {
  const gs =
    gameStateInitial instanceof Map
      ? gameStateInitial.get(row.game_id)
      : gameStateInitial[row.game_id];
  if (!gs?.scheduledStart) return false;
  return new Date(row.created_at).getTime() >= new Date(gs.scheduledStart).getTime();
}

/**
 * Polish spec §208 (Phase 51). Update the gameState Map in place
 * from a `game` UPDATE realtime payload.
 */
type RawGameUpdateRow = Partial<RawGameRow> & {
  scheduled_start?: string | null;
  current_inning?: number | null;
  current_inning_half?: string | null;
  current_outs?: number | null;
};

function applyGameStateUpdate(
  setter: React.Dispatch<React.SetStateAction<Map<string, LiveGameState>>>,
  next: RawGameUpdateRow,
): void {
  const id = next.id;
  if (typeof id !== "string") return;
  const status = (next.status ?? "scheduled") as LiveGameState["status"];
  setter((prev) => {
    const m = new Map(prev);
    const existing = m.get(id);
    // §213 (Phase 51 hotfix). Apply the trust predicate at the
    // realtime override too — without this, BDL's bogus 0-0 finals
    // bypass the SQL display CTE that the server-rendered prop
    // already demoted, and the pill regresses to "FINAL T 0-0".
    const merged: LiveGameState = {
      status,
      scheduledStart: next.scheduled_start ?? existing?.scheduledStart ?? null,
      currentInning:
        next.current_inning !== undefined ? next.current_inning : (existing?.currentInning ?? null),
      currentInningHalf: normalizeHalf(
        next.current_inning_half ?? existing?.currentInningHalf ?? null,
      ),
      currentOuts:
        next.current_outs !== undefined ? next.current_outs : (existing?.currentOuts ?? null),
      homeRuns: next.home_runs !== undefined ? next.home_runs : (existing?.homeRuns ?? null),
      awayRuns: next.away_runs !== undefined ? next.away_runs : (existing?.awayRuns ?? null),
    };
    m.set(id, applyGameStateTrustGate(merged));
    return m;
  });
}

type RawSlotRow = {
  id: string;
  contest_entry_id: string | null;
  live_fp: number | string | null;
  final_fp: number | string | null;
};

type RawEntryRow = {
  id: string;
  live_score: number | string | null;
  final_score: number | string | null;
};

function projectRow(
  row: RawGameEvent,
  players: Map<string, FeedPlayer>,
  gameMatchupById: Record<string, string>,
): FeedEvent | null {
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
    gameMatchup: gameMatchupById[row.game_id] ?? null,
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
  gameMatchupById: Record<string, string>,
): FeedEvent | null {
  const id = next.id;
  if (typeof id !== "string") return null;
  const prevStatus = prev.status ?? null;
  const nextStatus = next.status ?? null;
  if (prevStatus === nextStatus) return null;

  const now = new Date();
  const timeLabel = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const gameMatchup = gameMatchupById[id] ?? null;

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
      gameMatchup,
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
      gameMatchup,
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
    // Token applications don't carry game context; the matchup chip
    // is meaningless for a token-resolve event. Leave null — chip
    // doesn't render.
    gameMatchup: null,
  };
}
