# Draft Deck — Phase 12 Roadmap (Feel Pass v1.6 — Live-View Liveness)

**Goal:** Close the diamond ⇄ Event Feed feedback loop. When
a `game_event` fires for a player in the user's lineup, the
corresponding slot on the diamond reacts visually (green/red
halo + floating FP delta). Secondary: the status chip gets
inning + games-active narration detail.

**Estimated effort:** 1.5–2 days. Pure client-side work. No
SQL changes beyond one tiny `ALTER PUBLICATION` migration.

**Prerequisites:**

- Phase 10 shipped — `EventFeed` + Realtime subscription on
  `game_event` already exist.
- `eventFpDelta` + `eventActionLabel` already compute deltas
  from event_type + play_type + role.
- `createBrowserClient` module (ADR-0015's split) is the
  supported import path.
- `motion` (framer-motion) already in deps.

---

## Milestones

| ID    | Milestone                                | Target   | Outcome |
|-------|------------------------------------------|----------|---------|
| P12.1 | Per-slot FP glow on the diamond          | 1 day    | Shared `<LiveEventsProvider>` owns the Realtime channel; EventFeed + each LineupSlot consume via hooks. Halo + floating delta animate per event. Reduced-motion respected. |
| P12.2 | Status chip enrichment (inning + count)  | 0.5 day  | Chip reads `latestInning` + `gamesActive` from the provider + a game-table Realtime subscription. Migration 0027 adds `public.game` to `supabase_realtime`. |
| P12.3 | ADR-0017 retro                           | 0.25 day | What shipped, what surprised us, open items. |

---

## P12.1 — Per-slot FP glow (Day 1)

### T12.1.1 Lift the Realtime subscription into a provider

- **What:** Create `src/components/lineup/LiveEventsProvider.tsx`.
  Moves the current `EventFeed`'s Realtime subscription + event
  state here. Exposes:
  ```ts
  useLiveEvents(): FeedEvent[]            // full list, 50-bounded
  useLatestPlayerEvent(playerId): FeedEvent | null
  useLatestInning(): { inning: number; half: 'top' | 'bottom' } | null
  ```
  Provider accepts the same props `EventFeed` does today
  (`lineupPlayers`, `contestGameIds`), opens one channel per
  mount.
- **Acceptance:**
  - Exactly one Realtime subscription per `/lineup` page mount
    (verify via console log or network inspector — one
    `lineup-events-*` channel).
  - `EventFeed` re-implemented as a pure consumer of
    `useLiveEvents()` — no subscription logic inside it.
  - The 20-row initial fetch + 50-row cap + dedup-via-id all
    live in the provider.
  - `lineupPlayers` / `contestGameIds` change → subscription
    re-establishes (same as today).
  - Building state (`entryStatus='building'`): provider still
    mounts (harmless — no events will match), or the parent
    skips mounting it entirely (either is fine; pick the
    simpler one).

### T12.1.2 `<SlotFpGlow>` motion overlay

- **What:** New component `src/components/lineup/SlotFpGlow.tsx`.
  Reads `useLatestPlayerEvent(playerId)` for a given slot's
  starter card's player id. Animates whenever `event.id`
  changes:
  - Halo: absolutely positioned inside the slot (parent has
    `relative`), `scale(1) → scale(1.15)`, opacity `0 → 0.6
    → 0`, 1200ms. Color = emerald if delta > 0, `#C47262`
    if delta < 0, skip entirely if 0.
  - Floating delta: absolutely positioned above the slot
    (pointer-events: none, z-index above sibling slots),
    `y: 0 → -16`, opacity `1 → 0`, 1200ms. Monospace
    tabular-nums.
  - `prefers-reduced-motion: reduce` → skip both.
- **Acceptance:**
  - Live lineup + simulated event (console-dispatched or a
    real webhook during dev) → visible halo + delta pill on
    the target slot.
  - Zero-delta event: nothing animates.
  - Rapid-fire events on the same slot: latest replaces in
    flight (Framer Motion's key-based re-mount handles this
    — use `event.id` as key).
  - Reduced-motion test (`chrome://settings` or emulate via
    DevTools → Rendering → Emulate CSS media feature) →
    neither halo nor delta animates.

### T12.1.3 Wire `<SlotFpGlow>` into `LineupSlot`

- **What:** `LineupSlot` renders `<SlotFpGlow>` as a sibling
  of the slot card, gated on:
  - `locked === true` (post-submit states only — aligns with
    `entryStatus IN ('live', 'final')` via existing plumbing)
  - `card !== null` (empty slots don't glow)
  - `card.playerId` resolvable — it's already on
    `LineupCardVM`, no new prop.
- **Acceptance:**
  - Unfilled slots never glow.
  - Bench drawer cards never glow (they're in `BenchCard`,
    not `LineupSlot`).
  - Building mode: no glow (locked is false).
  - Switching from building → submitted via actual submit
    flow: glows begin firing on subsequent events.

### T12.1.4 `DiamondGrid` wraps in provider

- **What:** The `LineupView` (in `LineupShell.tsx` or wherever
  it currently composes `DiamondGrid` + `LineupSidebar` +
  `EventFeed`) wraps everything post-submit in
  `<LiveEventsProvider>`. Pre-submit: provider is either
  skipped or renders with empty-array props.
- **Acceptance:**
  - Unified `/lineup` page: one provider instance for the
    whole page (not nested).
  - React DevTools shows `LiveEventsProvider` wrapping the
    subtree.

### Per-task checklist

Same as prior phases:
- `pnpm typecheck` + `pnpm lint` + `pnpm test` clean.
- Commit convention: `feat(lineup): P12.1.N <slice>`.
- Deploy after each sub-task if it has user-visible delta —
  T12.1.1 is invisible internal refactor so can batch with
  T12.1.3; T12.1.3 is the first user-visible change.

---

## P12.2 — Status chip enrichment (Day 2)

### T12.2.1 Migration 0027 — game table in Realtime publication

- **What:** New migration:
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE public.game;
  ```
  Matches the pattern from migration 0024 (which added
  `game_event`).
- **Acceptance:**
  - `pnpm db:push` locally applies cleanly.
  - `SELECT * FROM pg_publication_tables WHERE pubname =
    'supabase_realtime' AND schemaname = 'public' AND
    tablename = 'game';` returns one row.
  - Prod apply deferred until P12.2.3 ships (or applied
    via MCP `apply_migration` with the same 0027 timestamp —
    follow runbook drift-avoidance).

### T12.2.2 `useGamesActive` hook

- **What:** Hook `src/components/lineup/useGamesActive.ts`.
  Takes `contestGameIds: string[]`, returns `{ count, ready }`.
  - Initial fetch on mount: `supabase.from('game').select
    ('id', { count: 'exact', head: true }).in('id',
    contestGameIds).eq('status', 'live')`.
  - Realtime subscription on `public.game` UPDATE events
    where the row id is in `contestGameIds` (client-side
    filter since Postgres changes doesn't support `IN`
    filters on subscriptions). On each update, recompute
    the count by refetching or by applying the status
    delta locally.
  - Decrements when status flips from 'live' → 'final'.
  - Increments when status flips from 'scheduled' → 'live'
    (mid-session reload edge case).
- **Acceptance:**
  - Returns correct count on mount.
  - Updates within ~1s of a `game` row status flip in the DB.
  - Handles `contestGameIds: []` gracefully (ready: true,
    count: 0).

### T12.2.3 StatusChip reads inning + count

- **What:** `LineupSidebar.tsx` `<StatusChip>` accepts two
  new props or reads them via the provider:
  - `latestInning` from `useLatestInning()`.
  - `gamesActive` from `useGamesActive(contestGameIds)`.
  - Format per polish spec §22:
    - `Live · Top 5th · 3 games active`
    - `Live · 3 games active` (no inning yet)
    - `Live · Games ending` (gamesActive=0)
- **Acceptance:**
  - Matches spec copy exactly.
  - Ordinal helpers tested (1st/2nd/3rd/4th … 11th/12th).
  - Width stable — tabular-nums on the inning portion;
    chip doesn't jump when digits change.
  - Pre-game / submitted / locked / final states render
    the same as before.

### Per-task checklist

- `pnpm typecheck` + `pnpm lint` + `pnpm test`.
- Commit convention: `feat(lineup): P12.2.N <slice>`.
- Deploy after T12.2.3 (ties all three together).

---

## P12.3 — ADR-0017 retro (Day 2)

### T12.3.1 `docs/adr/ADR-0017_phase-12-retro.md`

- **What:** Follow the ADR-0015 / ADR-0016 template:
  - Context (what motivated the phase).
  - Decision (provider + hook architecture).
  - What shipped (three slice commits + plan commit).
  - What went well.
  - What surprised us.
  - What we deliberately simplified.
  - Open items.
  - Estimate vs reality.
- **Acceptance:** ADR lands on `main`; spec §21–§22 + this
  roadmap are reachable from it.

---

## Dependencies between tasks

```
P12.1.1 (Provider)  ──► P12.1.2 (SlotFpGlow)
                    ──► P12.1.3 (Wire into LineupSlot)
                    ──► P12.1.4 (LineupView wraps in provider)
                                              │
P12.2.1 (Migration 0027) ──► P12.2.2 (useGamesActive)
                                              │
                                              ▼
                                       P12.2.3 (StatusChip)
                                              │
                                              ▼
                                       P12.3 (ADR-0017)
```

P12.1 and P12.2 are mostly independent once the provider
lands — P12.2.3 only needs `useLatestInning` from the provider
(cheap add in T12.1.1). Order doesn't strictly matter beyond
"provider first."

---

## What's NOT in Phase 12 (scope guard)

Per spec §23:

- Onboarding pass / empty-error sweep / a11y / tier foil /
  dupe picker / mobile / sound / haptics / artwork.
- Rank display on status chip.
- Webhook retry observability dashboard.
- CI integration for fixture suite.
- Per-slot contract-depletion animation (needs another
  Realtime publication + provider consumer).
- Sound cue on positive FP (parked again per ADR-0015).
