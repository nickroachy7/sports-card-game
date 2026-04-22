# ADR-0017 — Phase 12 (Live-View Liveness) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 12 (Feel Pass v1.6 — per-slot FP glow + status chip enrichment)
**Companion specs:** `draft-deck-polish-spec.md` §21–§23,
`docs/roadmap-phase-12.md`.

---

## Context

Phase 9 shipped real-game scoring. Phase 10 narrated events
textually in a sidebar Event Feed. But the diamond itself sat
static during live play — a Meidroth walk showed up as "BB +2"
in the feed while the 2B slot gave no visual response. ADR-
0015's "ready for next polish pass" list flagged this
explicitly: *"Per-slot FP glow on the diamond when an event
fires for that slot — ties the Event Feed back to the diamond
visually."*

Secondary: ADR-0015 also deferred status-chip detail —
"Status chip inning + games-active detail — has a Phase 11+
home." Phase 12 picked up both.

Estimate: 1.5–2 days. Shipped in 4 commits in one session.

## Decision

One shared `<LiveEventsProvider>` at the LineupView level owns
the single Realtime channel. Both consumers — EventFeed +
SlotFpGlow — read via hooks (`useLiveEvents`,
`useLatestPlayerEvent`, `useLatestInning`). Status chip
adds a second Realtime subscription (on `public.game` via the
new hook `useGamesActive`) — separate concern, separate
channel, keeps the chip decoupled from event projection.

Per-slot glow is a motion overlay component (`<SlotFpGlow>`)
rendered inside each filled, post-submit `LineupSlot`. Keys
on `event.id` via `AnimatePresence` so rapid-fire events
replace mid-flight (latest-wins, no queue).

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `0f12afc6` | Polish spec §21–§23 + `docs/roadmap-phase-12.md`. |
| P12.1.1 | `b0585fad` | `LiveEventsProvider` refactor — subscription lifted out of EventFeed; three hooks exposed; `shortName` helper exported. Invisible change; pure prep for downstream consumers. |
| P12.1.2 | `5589da26` | `<SlotFpGlow>` — 1200ms halo (emerald/rose) + floating ±N.N pill. Wired into `LineupSlot` behind `locked` gate. `prefers-reduced-motion` returns null. Zero-delta events skip the animation. |
| P12.2   | `a59e7a80` | Migration 0027 (`game` → `supabase_realtime` + `REPLICA IDENTITY FULL`), `useGamesActive` hook, extracted `liveLabel` + `ordinal` helpers, 11-case unit test, `<StatusChip>` rewrites the live copy ("Live · Top 5th · 3 games active"). |
| P12.3   | *(this)* | ADR-0017. |

## What went well

1. **Provider lift was a pure refactor with zero UX regression.**
   EventFeed became 100 lines thinner, the subscription logic
   lives once, and the new consumers (glow, status chip) just
   call hooks. Consumer code is shorter than pre-Phase-12.
2. **`AnimatePresence` + `key={event.id}` handled the rapid-
   fire case for free.** No queue, no state machine, no
   manual timers — Framer unmounts the old motion div as the
   new one mounts with a fresh animation. The spec call-out
   "latest wins, don't queue" is literally the default
   behavior.
3. **Extracting `liveLabel` + `ordinal` to a pure module paid
   off.** Not because the helpers are complex — they're 20
   lines — but because the 11/12/13-th edge case is the kind
   of thing that silently breaks under a Biome refactor. A
   named unit test locks in the expectation.
4. **Two Realtime subscriptions, one per concern.** I
   considered wiring games-active into the same provider,
   but the chip's game-status stream is semantically
   independent from the event stream. Separate hook =
   separate concern = one less coupling when either needs
   to change.
5. **REPLICA IDENTITY FULL was the right default.** Without it
   the UPDATE payload would've been just `{id, ...}` — the
   `status` column would be missing. Found via docs review
   before shipping; added to the migration comment so the
   next person understands why it's there.
6. **Slice ordering matched the dep graph cleanly.** P12.1.1
   (refactor) unblocked everything. P12.1.2 (glow) and P12.2
   (chip) are independent consumers of the provider. P12.3
   closed. No revisions to prior slices.

## What surprised us

1. **Docker was hung for the entire session (same as Phase 11).**
   Couldn't smoke the SlotFpGlow animation locally or verify
   the Realtime subscription against a local event insert.
   Shipped straight to prod, relying on the typecheck + lint
   + unit-test gate. Same fallback as prior polish phases;
   user validates in the browser.
2. **`supabase db push --linked` worked fine without Docker.**
   Pleasant surprise — the linked-push path connects directly
   to the remote DB without spinning up the local stack.
   Migration 0027 applied in one command; no drift from MCP
   path. The runbook's drift-avoidance guidance ("prefer
   local files + db push --linked") held up.
3. **`EventFeed` no longer needs the `lineupPlayers` +
   `contestGameIds` props.** Dropping them simplified the
   `LineupSidebar` call site — one less pair of props
   threaded through. Didn't anticipate that small win; it's a
   signal that the right extraction often removes more code
   than it adds.
4. **React 18's context vs. Jotai/Zustand question was a
   non-issue for this surface.** One provider, three memoized
   derivations, no cross-component writes — plain context
   with `useMemo` fits exactly. Would reach for Jotai if a
   future surface needed per-slot *writes* back to the stream,
   but one-way read is trivial.
5. **`bench cards never glow` was free** — `LineupSlot`
   renders `<SlotFpGlow>` inside its own render tree only
   when `card` is present, and `BenchCard` is a different
   component entirely. Didn't need a bench-check branch.

## What we deliberately simplified

1. **No Playwright for the glow animation.** Same ADR-0015
   posture — Realtime-driven UI is hard to test
   deterministically. The unit test on `liveLabel` covers the
   deterministic bit; the animation is eyeballed.
2. **No sound cue on positive FP.** Still parked (explicit
   in spec §23). Phase 12 is visual-only.
3. **No rank display on the status chip.** Parked for a
   future leaderboard-aware slice.
4. **Most-recent-event inning, not max-inning across live
   games.** Spec §22 made the call; the chip is narration,
   not scoreboard.
5. **Games-active count recomputes from a per-id map on every
   update.** Could've maintained a delta counter, but contest
   sizes are small (≤ ~15 games) and the Map iteration is
   microseconds. YAGNI held.
6. **No per-slot contract-depletion animation.** A card
   losing a play would be a natural sibling to the FP glow,
   but it'd need the `card` table added to the Realtime
   publication + another hook in the provider — out of scope
   for Phase 12, good shape for Phase 13+ if it earns a
   complaint.
7. **Graceful null outside provider (via `useContext` +
   null-check), not a default-value context.** Slightly more
   verbose but the intent is clearer per hook:
   `useLiveEvents` throws (EventFeed shouldn't render
   pre-submit), `useLatestPlayerEvent` returns null
   (LineupSlot renders in every state).

## What's ready for the next polish pass

- **`<LiveEventsProvider>` is a general primitive.** Any
  future surface that wants per-player or per-game event
  narration (opponent view, shared watch-along, live
  contest board) wraps its subtree and adds a consumer
  hook. No subscription code needed.
- **`SlotFpGlow` is template-able.** A future "contract
  tick" animation (a play consumed) can copy the 1200ms
  halo pattern with a different event source. Maybe
  literally: rename `<SlotFpGlow>` → `<SlotPulse>` with a
  variant prop.
- **`liveLabel` + `ordinal` extracted + tested.** If the
  chip ever needs a fourth format ("Live · Top 5th · 3
  games · rank #42") the extension point is one function.
- **Migration 0027's publication + REPLICA IDENTITY FULL
  pattern is reusable.** When a future Realtime consumer
  wants UPDATE-scoped data for another table, one migration
  + one hook copies the shape.

## Open items

1. **Per-slot contract-depletion animation.** Natural sibling
   to FP glow. Needs `card` in the Realtime publication.
2. **Sound cue on positive-FP events.** Still parked.
3. **Rank display on status chip.** Parked.
4. **Onboarding flow pass.** Still the highest-impact
   remaining polish item for new-user retention; Phase 12
   didn't touch it.
5. **Empty/error state sweep + a11y audit + tier foil
   motion + dupe multi-picker** — all still parked.
6. **CI integration for `pnpm test:integration`.** Phase 11
   carry-over.

## Estimate vs reality

Estimate: 1.5–2 days. Shipped: 4 commits + 1 plan commit in
one session (~90 minutes of actual work). Under the estimate.
The provider lift was the biggest unknown going in; turned
out to be a mechanical extraction with no architectural
surprises. Motion work was routine — Framer's `AnimatePresence`
semantics are well-established.

## Consequences

- The diamond now reacts to every event that scores (or
  un-scores) a user's lineup. The feedback loop between what
  the user built and what the world is doing to it is closed.
- Status chip narrates to the second ("Top 5th · 3 games
  active"), not minute-stale loading strings. Users get
  live inning context without needing to look elsewhere.
- `<LiveEventsProvider>` becomes the canonical shape for any
  future event-driven UI on the lineup page. New consumers
  add one hook call.
- The shared-provider pattern will likely repeat in the
  opponent-view / watch-along / leaderboard-live surfaces
  if those ever land. Architecture's ready for it.
- Migration 0027 is the second "add to supabase_realtime"
  migration (after 0024 for game_event). The pattern is
  established: when a new UI needs Realtime for a table,
  one-line migration + REPLICA IDENTITY FULL if UPDATEs
  matter.

## Related ADRs

- ADR-0014 — Phase 9 Retrospective (Real-Game Scoring). The
  event stream Phase 12 consumes landed here.
- ADR-0015 — Phase 10 Retrospective (Unified Lineup View).
  EventFeed primitive Phase 12 extracts + extends; two open
  items closed (per-slot glow + status chip detail).
- ADR-0016 — Phase 11 Retrospective (Integration Test
  Harness). Phase 12 touched no SQL fns so the harness
  wasn't exercised, but the new migration 0027 is trivial
  enough that a smoke wouldn't have earned its keep.
