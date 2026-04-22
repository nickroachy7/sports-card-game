# Draft Deck — Phase 10 Roadmap (Unified Lineup View + Ceremony Fix)

**Goal:** Close two user-visible gaps. (1) Kill the page-flip
after lineup submit — the submitted lineup stays on the main
Lineup page with live score, box score, and event feed in the
sidebar. (2) Relax `commit_vault_selection` so pre-vaulted
(midseason) cards are accepted at ceremony time — the P7.4.7
carry-over that blocks the first real offseason.

**Estimated effort:** 3–4 days. The unified view is the
biggest slice (state machine + Realtime wiring); the ceremony fn
is half a day.

**Prerequisites:**
- Phase 9 shipped (ADR-0014) — real-game scoring pipeline works
  end-to-end.
- `draft-deck-polish-spec.md` §16–§17 signed off.
- Test account has a submitted lineup + real games in flight
  tonight (P9.5 residue) — lets us exercise the state
  transitions without a separate setup.

---

## Milestones

| ID    | Milestone                                 | Target  | Outcome |
|-------|-------------------------------------------|---------|---------|
| P10.1 | Route consolidation — `/lineup` always renders `<LineupShell>` | 0.25 day | `/app/(app)/lineup/page.tsx` stops branching on entry status; always passes props into one client view. `<LiveListView>` retired. |
| P10.2 | Sidebar state machine — box score + status chip | 1 day  | `<LineupSidebar>` grows a state-aware inner: building chrome vs submitted/live/final chrome. Live Score + per-slot Box Score + Status chip. |
| P10.3 | Event Feed — Realtime subscription + row component | 1 day  | `<EventFeed>` client component subscribed to `game_event` inserts. Filters client-side to lineup players. Formats one row per event (player · action · FP delta · time). Empty state + reconnect indicator. |
| P10.4 | Bench + tokens disabled state | 0.25 day | Pass `locked` all the way through `BenchCard` + `TrayTokenPip` so drag sources short-circuit. Visual: normal cards, reduced opacity, no grab cursor. |
| P10.5 | Ceremony fn tolerance (migration 0024)    | 0.5 day | `commit_vault_selection` accepts `is_vaulted=true AND vault_source='midseason'` as valid selections. DO-block smoke on prod. |
| P10.6 | ADR-0015 Phase 10 retro                   | 0.25 day | Retro covering what shipped, surprises, open items. |

---

## P10.1 — Route consolidation (Day 1)

### T10.1.1 Collapse status-branch in `/lineup/page.tsx`
- **What:** Currently `/app/(app)/lineup/page.tsx` conditionally
  renders `<LineupView>` for `entry.status === 'building'` and
  `<LiveListView>` otherwise. Kill that branch. Always render
  `<LineupView>`; pass the entry status as a prop; let the
  client component decide what chrome to show.
- **Acceptance:** route renders the same `<LineupShell>` shape
  regardless of status. `<LiveListView>` can stay in the tree
  for reference but is not rendered.

### T10.1.2 Retire `<LiveListView>` (or stub)
- **What:** Either delete `src/components/lineup/LiveListView.tsx`
  or mark it `@deprecated` with a one-line link to the unified
  view. Prefer deletion — dead code.
- **Acceptance:** no imports of `<LiveListView>` remain.

---

## P10.2 — Sidebar state machine (Day 1–2)

### T10.2.1 Extend `<LineupSidebar>` props
- **What:** Add `entryStatus`, `liveScore`, `finalScore` props.
  Import slot fills (existing). The component renders one of
  two inner layouts:
  - `entryStatus === 'building'` → existing chrome (Readiness /
    Projected FP / Auto-sub / Submit).
  - otherwise → new chrome (see below).
- **Acceptance:** building-state sidebar unchanged; submitted
  state renders new chrome; no visual flicker on transition.

### T10.2.2 Box Score section
- **What:** New `<BoxScoreSection>` that renders a 10-row
  table: position → player name → FP value. FP comes from
  the slot's `live_fp` during live, `final_fp` after. Pending
  slots show `—`.
- **Acceptance:** all 10 rows visible without scroll; mono
  font for numbers; totals row at the bottom.

### T10.2.3 Status chip
- **What:** New `<StatusChip>` block replacing the Submit
  button. Text varies per spec §16:
  - `submitted`: `Submitted · Waits for first pitch` (or
    countdown).
  - `live`: `Live · Top 5th, 3 games active` — inning from
    the most-recent game_event on a lineup player; games-active
    count derived from contest's games with `status='live'`.
  - `final`: `Final · 97.5 FP`.
- **Acceptance:** chip updates reactively as state changes;
  doesn't flicker between reads.

### T10.2.4 Live Score big number
- **What:** Above the box score — big mono numeric showing
  `entry.live_score` (or `final_score` once final). Format
  matches the Collection `Collection` section readout.
- **Acceptance:** reactive to slot FP changes.

---

## P10.3 — Event Feed (Day 2–3)

### T10.3.1 `<EventFeed>` client component
- **What:** Subscribes via `supabase.channel(...).on('postgres_changes', {...}).subscribe()` to inserts on
  `public.game_event`. Filters client-side:
  `batter_player_id OR pitcher_player_id IN (lineup player ids)`.
- On each matching event: prepend to an in-memory array
  (bounded at 50 entries) keyed on `provider_event_id` to
  dedupe.
- **Acceptance:** Realtime events land in the feed within ~1s
  of a real webhook-driven insert; dedup stable across
  reconnects.

### T10.3.2 Event row formatting
- **What:** One row per event: player last name + action
  (from `play_text` or `play_type` fallback) + FP delta +
  local-time HH:MM. Bold FP delta. Color-cue positive (cream)
  vs zero (muted).
- **Acceptance:** typography matches sidebar tokens; rows are
  scannable at a glance.

### T10.3.3 FP delta computation
- **What:** For each event, derive the FP contribution it
  would produce using the existing scoring math in
  `reconcile.ts` (singles = +3, HR = +10, etc.). Expose this
  as a pure `eventFpDelta(event)` fn in `src/lib/mlb/scoring.ts`.
  Unit test coverage.
- **Acceptance:** 8+ unit tests cover the hitter + pitcher
  delta paths.

### T10.3.4 Empty + reconnect states
- **What:**
  - Empty: `Waiting for first pitch…` centered in the feed.
  - Reconnecting: small dot indicator in the feed header
    (`live` vs `reconnecting…`).
- **Acceptance:** visual clearly distinguishes the three
  states (empty / live / reconnecting).

---

## P10.4 — Disabled bench + tokens (Day 3)

### T10.4.1 Thread `locked` to `<BenchCard>` drag source
- **What:** Already partially done — `locked` is passed in.
  Confirm `canDrag: !locked && !disabled` gates cleanly. No
  hover-grab cursor when locked.
- **Acceptance:** locked state prevents picking up any bench
  card; visual cue is present.

### T10.4.2 Tokens tray locked state
- **What:** `<TrayTokenPip>` + `<TokenTray>` already accept
  `locked`; confirm drag is gated + pips render with an extra
  "locked" opacity tier.
- **Acceptance:** visible but clearly non-interactive.

---

## P10.5 — Ceremony fn tolerance (Day 3–4)

### T10.5.1 Migration 0024
- **What:** Patch `public.commit_vault_selection(user_id,
  season_id, card_ids[])`. Per spec §17:
  - `is_vaulted=false` → existing path.
  - `is_vaulted=true AND vault_source='midseason'` → skip
    card update, still insert `vault_entry` snapshot.
  - `is_vaulted=true AND vault_source='ceremony'` → raise
    `vault_commit_already_processed`.
- **Acceptance:** migration applies + reverts cleanly.

### T10.5.2 DO-block smoke on prod
- **What:** Seed a pre-vaulted card on the test account;
  invoke `commit_vault_selection` with a mixed set (pre-
  vaulted + fresh); assert all show up in `vault_entry`;
  rollback via `RAISE 'TEST_OK …'`.
- **Acceptance:** TEST_OK rollback; no test data persists.

### T10.5.3 Unit tests
- **What:** If there's a pure helper, cover it. Otherwise
  integration-style (real DB) is the level — DO-block smoke
  is sufficient per repo convention.
- **Acceptance:** no test additions necessary if smoke
  passes; noted in ADR.

---

## P10.6 — Close-out (Day 4)

### T10.6.1 Reduced-motion audit
- **What:** Verify the Event Feed row insert has no CSS
  animation that defies reduced-motion. Verify FP delta
  updates don't tick with a counter animation. Document.
- **Acceptance:** N/A if nothing to change; note in ADR.

### T10.6.2 Playwright
- **What:** Optional — the `/lineup` state transition is
  realtime-driven and hard to test deterministically. Skip
  unless a stable seed path shows up; document decision.

### T10.6.3 ADR-0015
- **What:** `docs/adr/ADR-0015_phase-10-retro.md`. What
  shipped, what surprised us (realtime subscription quirks,
  state transition edge cases), open items for Phase 11.

---

## What's NOT in Phase 10 (scope guard)

Per polish spec §18:

- Onboarding flow pass.
- Empty + error state sweep.
- Accessibility audit.
- Tier foil motion.
- Dupe panel multi-instance picker.
- Mobile / sound / haptics / artwork.
- Dev-sim fixture with real-lineup seed.
- Webhook retry observability dashboard.

---

## Per-task checklist

Same as prior phases:
- Acceptance met.
- `pnpm typecheck` + `pnpm lint` + `pnpm test` clean.
- Supabase Realtime subscriptions tear down cleanly on unmount.
- Commit convention: `feat(<scope>): P10.N <slice>`.

---

## Dependencies between tasks

```
P10.1 ──► P10.2 ──► P10.3 ──► P10.4 ──► P10.6
           │
P10.5 ─────┴─────────────────────────────► P10.6
```

P10.1 unblocks the rest of the view work. P10.5 is independent
of the UI slices — shippable in parallel.

---

## Standing follow-ups (ride-along if convenient)

- `contest_entry.rank` display on the status chip (needs
  leaderboard query extension).
- Event feed sound cue on positive FP (haptics/sound parked).
- Diamond per-slot FP glow flash when an event lands on that
  player (visual tie-back between feed + diamond).
