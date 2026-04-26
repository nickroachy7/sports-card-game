# ADR-0050 — Phase 51 (Live Score & Game-State Realtime) Retrospective

**Status:** Accepted · **Date:** 2026-04-25
**Phase:** Phase 51 (v1.35)
**Companion specs:** `draft-deck-polish-spec.md` §206–§212.

---

## Context

User feedback after the P49 (token hygiene) + P50 (live FP
time-gate) work:

> "The game statuses are not updating, the players FP is not
> updating … This is a fantasy sports game but its core
> tracking and information populating is not working. We need
> to dig into this and spec out a solution."

The spotted symptoms had me chasing individual layers (filter
pre-sim events, backfill on entry creation, etc.) without
seeing the systemic gap. The user pushed for a step back. I
ran a deep audit of the live pipeline and found the real
problem: `contest_lineup_slot` and `contest_entry` were never
added to the realtime publication. The DB trigger correctly
applied FP updates to those tables; the client just had no
broadcast signal to know they'd changed.

A second gap: the existing `game` UPDATE realtime channel
fired correctly (with `current_inning` / `current_inning_half`
/ `current_outs` updated by the webhook handler), but
`SlotGameState` had no consumer of that broadcast. The pill's
data came from a server-rendered `SlotGameInfo` prop, frozen
at page load.

Net result before P51: only the event feed narrated live
plays. The big LIVE score, per-card FP, sidebar roster FP,
and game-state pill were all stale until refresh.

## Decision

User-confirmed scope (interview):

1. Auto-update **all** lineup-page surfaces in real-time:
   big LIVE score, per-card FP, sidebar roster FP, game-state
   pill (each pill subscribes to its own game via `useLiveGameState`).
2. Apply the §202 P50 pre-sim time-gate to the event feed too,
   so users don't see "+12 FP" lines for events that don't credit.
3. Wait for DB realtime push (no optimistic UI) — user said
   "as long as stats update within a minute or two." Realtime
   is sub-second; well within tolerance.
4. Show a "Reconnecting…" banner during channel disconnects.

Implementation:

- Migration 0068 adds `contest_lineup_slot` + `contest_entry`
  to `supabase_realtime` with `REPLICA IDENTITY FULL`.
- `LiveEventsProvider` (formerly the event-feed-only provider)
  now drives ALL realtime UI on the lineup page. New
  subscriptions on slot + entry; existing `game` UPDATE handler
  extended to update a `gameState` Map for `SlotGameState`.
- New hooks: `useLiveSlotFp`, `useLiveEntryScore`,
  `useLiveGameState`, `useLiveConnectionStatus`.
- `SlotGameState`, `LineupSlot`, `AppSidebar` updated to consume
  the hooks (with prop fallback).
- `RealtimeStatusBanner` mounted inside the provider tree.
- Event feed time-gate: filters initial fetch + realtime inserts
  on `event.created_at >= game.scheduled_start`.

## Consequences

**What got better:**
- Live game state (inning, outs, score) ticks in real-time on
  each slot's pill, with each pill independently watching its
  own game.
- Per-card FP updates on the lineup grid as the user's players
  score, with no refresh needed.
- Sidebar big LIVE number + per-position roster FP update from
  realtime broadcasts.
- Event feed only shows events that credit `live_fp` — no more
  fake "+12 FP" claims.
- Disconnect banner gives users a signal during channel blips;
  channel auto-recovers.

**What's still open:**
- `useGamesActive` hook (count of live contest games) still
  does its own fetch + subscribe. Could be folded into the
  provider but it's narrow + working — left for later.
- Reconcile path (game-end box-score writes to `final_fp`)
  also UPDATEs `contest_lineup_slot`. The new realtime
  subscription picks those up too — same channel as the
  trigger updates. Verified: post-final, the displayed value
  flips from `liveFp` to `finalFp` via the existing
  `gameInfo.status === 'final' ? finalFp : liveFp` selector
  in components.
- No telemetry on channel disconnect frequency. If we see lots
  of reconnects in production, may want to add a Sentry breadcrumb
  on transition.

## Tricky bits

- **RLS scopes broadcasts.** `contest_lineup_slot` and
  `contest_entry` already had owner-only SELECT policies. Supabase
  Realtime respects RLS, so users only receive UPDATE events
  for their own rows. Verified via direct policy inspection.

- **Replica identity FULL required for UPDATE payloads.** Default
  replica identity (primary key only) makes UPDATE broadcasts
  useless to the client — the payload's `new` object has only the
  PK. `FULL` replicates the entire row so the client sees the new
  values. Same pattern as `0027_realtime_game.sql` shipped earlier.

- **Hooks must run unconditionally.** `RosterRow` had an early
  return for empty slots before the new `useLiveSlotFp` call.
  React linter caught it; moved the hook above the early return.
  Hook returns null gracefully when slotId is empty / unknown.

- **gameStateRef for the time-gate.** The realtime INSERT handler
  for `game_event` captures `gameStateInitial` at mount time and
  doesn't see fresh `game` UPDATEs that arrive after. We mirror
  the live `gameState` Map onto a ref so the handler reads the
  current map without re-binding the channel on every game
  state change.

- **Re-seed on prop change.** When `router.refresh()` fires after
  a mutation, server-rendered props update but the provider's
  internal state would otherwise drift. `useEffect` blocks re-seed
  the slotFp / entryScore / gameState maps from updated props.
  Realtime UPDATEs after re-seed continue to override.

- **Component-prop pattern.** `LineupSlot` and the sidebar's
  `RosterRow` accept `slotId` so they can call `useLiveSlotFp`.
  This decouples the live override from the server-rendered
  `slotFills` computation in `lineup-view` (which can't use hooks
  itself, since it's the parent of the provider).

## Alternatives considered

- **Polling instead of realtime.** Considered a 5-second poll
  on `entry.live_score`. Rejected because Supabase Realtime is
  already wired and gives sub-second updates with less server
  load.
- **Optimistic client-side increment.** Compute FP delta on the
  client when an event lands, increment locally. Rejected per
  user — wait for DB push is simpler and within latency tolerance.
- **One channel per table.** Considered separate Supabase
  channels for slot/entry/game. Rejected: more WS connections
  for no benefit. The existing `lineup-events-${Date.now()}`
  channel handles all five subscriptions on one connection.
- **Move slotFills computation inside provider.** Would let
  lineup-view's slotFills consume hooks directly. Rejected as
  too invasive — moving 200 lines of logic + state. The
  prop-pass + leaf-consumer pattern is smaller.

## Links

- Commit: (forthcoming)
- Migration: `0068_realtime_lineup_score.sql`
- Polish spec: §206-§212
- Audit notes: live-pipeline gaps mapped end-to-end before
  any code changes — covered in this session's transcript.
- Related: ADR-0049 (P50 live_fp time-gate) — same problem
  domain (BDL pre-sim noise) but trigger-side; this ADR
  closes the client-side mirror gap.
