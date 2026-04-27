"use client";

import {
  type ConnectionStatus,
  type FeedEvent,
  useLiveEvents,
  usePlayerMeta,
  useUpcomingGames,
} from "@/components/lineup/LiveEventsProvider";
import { TIER_FRAME } from "@/lib/card/tiers";
import { cn } from "@/lib/utils";

/**
 * Polish spec §226 (Phase 58) — hierarchical event feed.
 *
 * Two render tiers:
 *
 *   Tier 1: PlayerEventCard
 *     - Player events that move FP (hits, HRs, walks, Ks, HBP, SBs)
 *       and token resolutions.
 *     - Card-styled with player photo (or team-abbr fallback), name,
 *       FP delta, action line, tier-colored left edge.
 *
 *   Tier 2: GameMarker
 *     - Game-state transitions (first pitch, end-of-inning, final).
 *     - Subtle horizontal divider with centered muted text. Acts as
 *       a chapter marker, not an event itself.
 *
 * The discriminator is `event.kind`. Token events render as Tier 1
 * with a 🪙 glyph in place of the photo (no player to depict).
 *
 * Pre-§226 the feed was a single flat-styled list; everything had
 * the same weight, so player events drowned in the inning-marker
 * noise.
 */

export function EventFeed() {
  const { events, status } = useLiveEvents();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
          Event Feed
        </span>
        <ConnectionDot status={status} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        {events.length === 0 ? (
          <EmptyState />
        ) : (
          <ol className="flex flex-col gap-1.5">
            {events.map((e) => (
              <FeedRow key={e.id} event={e} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function FeedRow({ event }: { event: FeedEvent }) {
  if (event.kind === "game-marker") {
    return <GameMarker event={event} />;
  }
  return <PlayerEventCard event={event} />;
}

// ── Tier 1 ─────────────────────────────────────────────────────────────

/**
 * §226 (Phase 58). Tier-1 player event card. Layout:
 *
 *   ┌──┬─────────────────────────────────┬───────────┐
 *   │  │ Player name           Action…   │ +10.0 FP  │
 *   │📷 │ (timeLabel · matchup)            │           │
 *   └──┴─────────────────────────────────┴───────────┘
 *
 * Left edge is tier-colored (matches the player's card frame).
 * Token events render the same shape with a 🪙 glyph.
 */
function PlayerEventCard({ event }: { event: FeedEvent }) {
  const meta = usePlayerMeta(event.playerId);
  const isToken = event.kind === "token";
  const tier = meta?.tier ?? null;
  const frameColor = tier ? TIER_FRAME[tier].fill : "var(--border)";
  const photoUrl = meta?.photoUrl ?? null;
  const teamAbbr = meta?.teamAbbr ?? null;

  return (
    <li
      className={cn(
        "relative flex items-center gap-2 rounded-md border bg-[var(--surface-2)] py-1.5 pr-2 pl-2.5",
        "border-[var(--border)]",
      )}
      style={{
        borderLeftColor: frameColor,
        borderLeftWidth: 3,
      }}
    >
      <div
        className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface)] text-[10px] font-mono uppercase tracking-wider text-[var(--text-3)]"
        aria-hidden="true"
      >
        {isToken ? (
          <span className="text-base" role="img" aria-label="token">
            🪙
          </span>
        ) : photoUrl ? (
          // biome-ignore lint/performance/noImgElement: realtime feed avatars don't benefit from Next/Image (small, ephemeral)
          <img src={photoUrl} alt="" className="size-full object-cover" />
        ) : (
          <span>{teamAbbr ?? "??"}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12px] font-medium text-[var(--text)]">
            {event.player}
          </span>
          <FpDelta delta={event.delta} />
        </div>
        <div className="flex items-baseline gap-1.5 text-[10px] text-[var(--text-3)]">
          <span className="truncate">{event.action}</span>
          <span className="shrink-0">·</span>
          <span className="shrink-0 font-mono">{event.timeLabel}</span>
          {event.gameMatchup && (
            <span className="shrink-0 font-mono uppercase tracking-wider">{event.gameMatchup}</span>
          )}
        </div>
      </div>
    </li>
  );
}

function FpDelta({ delta }: { delta: number }) {
  if (delta === 0) {
    return <span className="font-mono text-[10px] text-[var(--text-3)] tabular-nums">—</span>;
  }
  const positive = delta > 0;
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-[11px] font-semibold tabular-nums",
        positive ? "text-emerald-400" : "text-[#C47262]",
      )}
    >
      {positive ? "+" : ""}
      {delta.toFixed(1)} FP
    </span>
  );
}

// ── Tier 2 ─────────────────────────────────────────────────────────────

/**
 * §226 (Phase 58). Tier-2 game-state divider. Subtle horizontal rule
 * with centered muted text. No card chrome, no FP delta — these are
 * chapter markers, not events.
 */
function GameMarker({ event }: { event: FeedEvent }) {
  const text = event.gameMatchup ? `${event.action} · ${event.gameMatchup}` : event.action;
  return (
    <li className="flex items-center gap-2 py-0.5" aria-label={text}>
      <span className="h-px flex-1 bg-[var(--border)]" />
      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-3)]">
        {text}
      </span>
      <span className="h-px flex-1 bg-[var(--border)]" />
    </li>
  );
}

// ── Empty state (§227 Phase 58) ────────────────────────────────────────

/**
 * §227. Replaces the bare "Waiting for first pitch…" copy with an
 * upcoming-games preview. During the daytime window before any of
 * today's games start, the user sees the slate's scheduled games
 * with start times instead of dead air.
 *
 * When there are no upcoming games (final state or off-day with
 * an empty slate), falls back to a quiet idle line.
 */
function EmptyState() {
  const upcoming = useUpcomingGames(8);

  if (upcoming.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <span className="text-[11px] text-[var(--text-3)]">No live events.</span>
        <span className="text-[10px] text-[var(--text-3)]">
          Check back when today's games start.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
          Coming up
        </span>
        <span className="font-mono text-[9px] text-[var(--text-3)]">
          {upcoming.length} {upcoming.length === 1 ? "game" : "games"}
        </span>
      </div>
      <ol className="flex flex-col gap-1">
        {upcoming.map((g) => (
          <li
            key={g.gameId}
            className="flex items-baseline justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5"
          >
            <span className="font-mono text-[11px] text-[var(--text-2)] uppercase tracking-wider">
              {g.matchup}
            </span>
            <span className="font-mono text-[10px] text-[var(--text-3)] tabular-nums">
              {formatGameTime(g.scheduledStart)}
            </span>
          </li>
        ))}
      </ol>
      <p className="pt-1 text-center text-[10px] text-[var(--text-3)] italic">
        Live events appear here once games start.
      </p>
    </div>
  );
}

function formatGameTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // ET-friendly short time. The user's own browser timezone is
  // close enough — most users live in ET; PT users will see their
  // local time anyway. Avoid hard-coding a TZ to respect the
  // user's locale.
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Connection dot ─────────────────────────────────────────────────────

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
