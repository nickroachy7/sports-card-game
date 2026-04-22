# Draft Deck — Phase 18 Roadmap (Feel Pass v1.11 — Gameplay Legibility)

**Goal:** Make the live-contest surface actually playable.
Per-slot lock model, game-state visibility, live FP on
cards, richer event feed, richer box score.

**Estimated effort:** ~3 days.

**Prerequisites:**

- Phase 17 roster-sync + audit stable; no outstanding
  data issues.
- Phase 12's `<LiveEventsProvider>` is the growth surface
  for the event feed additions.
- `game` table already in `supabase_realtime` publication
  (migration 0027).
- Contest state machine + SQL fns (`update_lineup_slot`,
  `swap_lineup_slots`, `apply_token`, `remove_token`)
  all ship with `locked` semantics today; will adapt.

---

## Milestones

| ID    | Milestone                                 | Target   | Outcome |
|-------|-------------------------------------------|----------|---------|
| P18.1 | Per-slot lock — SQL + server actions      | 0.75 day | `is_slot_locked` helper, migration 0030, action validation. Contest-status enum collapsed. |
| P18.2 | Per-slot lock — UI                        | 0.25 day | LineupSlot locked-state derived per slot; drag + click gated accordingly. |
| P18.3 | Game-state data pipeline                  | 0.5 day  | Server query joins `game` to lineup players' teams; threads through `LineupViewProps`. |
| P18.4 | Slot footer game-state line               | 0.25 day | `<SlotGameState>` component rendering pre/live/final copy. |
| P18.5 | Card contest FP + Box Score chip          | 0.25 day | `LineupCardVM.contestFp` threaded; Card footer adapts. Box Score row gains chip. |
| P18.6 | Event Feed — game + token narration       | 0.75 day | Migration 0029 adds `token_application` to realtime. `<LiveEventsProvider>` gains 2 subscriptions. |
| P18.7 | ADR-0023 retro                            | 0.25 day | Standard retro. |

---

## P18.1 — Per-slot lock (SQL + actions)

### T18.1.1 Migration 0030 — is_slot_locked helper

- **What:** New SQL function in a migration:
  ```sql
  CREATE OR REPLACE FUNCTION public.is_slot_locked(p_slot_id uuid)
  RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
      (SELECT
         g.status IN ('live','final') OR
         g.scheduled_start_time <= now()
       FROM public.contest_lineup_slot s
       JOIN public.contest_entry ce ON ce.id = s.contest_entry_id
       JOIN public.contest c ON c.id = ce.contest_id
       JOIN public.card crd ON crd.id = s.starter_card_id
       JOIN public.player p ON p.id = crd.player_id
       JOIN public.game g ON g.date = CURRENT_DATE
         AND (g.home_team_id = p.team_id OR g.away_team_id = p.team_id)
         AND g.id = ANY(c.included_game_ids)
       WHERE s.id = p_slot_id
       LIMIT 1),
      false
    );
  $$;
  ```
  (Exact column names + scheduled_start_time availability
  to verify during build; might need to query today's game
  via `game.date = CURRENT_DATE`.)
- **Acceptance:**
  - Migration applied locally + to prod via
    `supabase db push --linked`.
  - Function returns `true` for slots whose player's
    contest-game has started.

### T18.1.2 Update mutation SQL fns

- **What:** `update_lineup_slot`, `swap_lineup_slots`,
  `apply_token`, `remove_token` fns (existing) gain a
  call to `is_slot_locked(target_slot_id)` early in the
  body. If true, `RAISE EXCEPTION 'SLOT_LOCKED: ...'`
  with errcode `P0001` (or a custom code like `23514`).
  `swap_lineup_slots` checks both slots.
- **Acceptance:**
  - Invoking the fn on a locked slot errors cleanly.
  - Unlocked-slot path unchanged.

### T18.1.3 Contest status enum collapse

- **What:** Drop `locked` from `contest_entry_status`
  enum. Update `submitLineup` action so `submitted → live`
  transitions happen when any game starts (via a cron or
  webhook handler — or just defer the status change
  until reconcile sees the game flip).
- **Acceptance:**
  - No `locked` state remains in the DB.
  - Existing contest entries at `locked` get migrated to
    `live` (if any — probably none right now).

### T18.1.4 Action contract + error code

- **What:** `src/lib/contracts/` gain a `SLOT_LOCKED`
  error code. `updateLineupSlot`, `swapLineupSlots`,
  `applyToken`, `removeToken` map the Postgres exception
  to this code + a friendly message.
- **Acceptance:**
  - Client receives a well-shaped error; toast renders
    without confusion.

---

## P18.2 — Per-slot lock (UI)

### T18.2.1 Derived `isSlotLocked` in LineupView

- **What:** For each slot, compute `isSlotLocked` from
  the game data (threaded via P18.3) — same logic as the
  SQL helper but client-side for instant UI feedback.
  Pass to `LineupSlot` as a replacement for the
  contest-level `locked` prop (per-slot now).
- **Acceptance:**
  - Slots whose game is live/final render in locked
    state.
  - Slots whose game is pre (or no game today) render as
    editable.

### T18.2.2 LineupSlot respects per-slot lock

- **What:** `LineupSlot` currently takes a single `locked`
  prop. Rename to `slotLocked` or keep the name but
  drive it from the per-slot value. Drag source, drop
  target, and click-to-remove all gate on this.
- **Acceptance:**
  - Locked-slot drag refused with the invalid-drop
    bounce.
  - Click-to-open-detail still works (detail is read-only
    on a locked slot).
  - Bench drag → locked slot: rejected.

### T18.2.3 Lock visual indicator

- **What:** Per-spec §44: small padlock glyph in the
  slot's top-right corner when `slotLocked=true`. Matches
  the bench/tokens P10.4 "Locked" chip aesthetic.
- **Acceptance:** Visible on live/final slots only.

---

## P18.3 — Game-state data pipeline

### T18.3.1 Server query for lineup-day games

- **What:** `src/app/(app)/lineup/page.tsx` gains a join
  query fetching `game` rows whose `date = CURRENT_DATE`
  AND (`home_team_id` or `away_team_id`) IN the lineup's
  player team_ids AND `id = ANY(contest.included_game_ids)`.
  Shape: `{ gameId, playerTeamId, opponentAbbr,
  isHome, scheduledStartTime, status, inning, inningHalf,
  homeRuns, awayRuns }` per slot.
- **Acceptance:**
  - Query returns one row per starter with a game today.
  - Performant (≤ 3 queries total for the page).

### T18.3.2 Thread into LineupViewProps

- **What:** Add `slotGameByCardId: Record<cardId,
  GameStateInfo>` to `LineupViewProps`. Consumer
  components read from it.
- **Acceptance:** TypeScript compiles; server →
  component shape clean.

---

## P18.4 — Slot footer game-state line

### T18.4.1 `<SlotGameState>` component

- **What:** New component
  `src/components/lineup/SlotGameState.tsx`. Renders:
  - Pre-game: `vs LAD · Fri 7:10p`
  - Live: `LIVE · T5 · 2-1`
  - Final: `FINAL W 5-2`
- Palette: muted grey / emerald / neutral.
- Handles null `slotGameInfo` → renders nothing.
- **Acceptance:** Three visual states render cleanly
  inside a 96px-wide slot column.

### T18.4.2 Wire into LineupSlot

- **What:** LineupSlot renders `<SlotGameState>` below
  the existing "remove" link, inside the filled-slot
  branch.
- **Acceptance:** No layout shift relative to current;
  slot height grows ~14px to accommodate.

---

## P18.5 — Card contest FP + Box Score chip

### T18.5.1 `LineupCardVM.contestFp`

- **What:** Extend the type with an optional
  `contestFp: number | null`. Server computes it as
  `liveFp + finalFp` per slot, threads through the view
  model.
- **Acceptance:** Field present in the VM + populated
  correctly for slots.

### T18.5.2 Card footer displays contestFp

- **What:** `<Card>` component: if `card.contestFp !==
  null && card.contestFp !== undefined`, render that
  instead of `card.careerFp`. Different label: `LIVE`
  during live games, `FINAL` during final, else the
  default "FP".
- **Acceptance:**
  - Building mode: career FP, label "FP".
  - Submitted + no games started: contestFp=0, label
    "LIVE" / "0.0 LIVE".
  - Live: slot FP renders.
  - Final: slot FP renders, label "FINAL".

### T18.5.3 Box Score row chip

- **What:** `<BoxScoreSection>` row gets a small state
  chip after the position abbreviation. Uses
  `slotGameByCardId` from P18.3.
- **Acceptance:** Chip renders per row; matches the slot
  footer state.

---

## P18.6 — Event Feed — game + token narration

### T18.6.1 Migration 0029

- **What:**
  ```sql
  ALTER TABLE public.token_application REPLICA IDENTITY FULL;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.token_application;
  ```
- **Acceptance:** Applied locally + prod.

### T18.6.2 `LiveEventsProvider` game-transition events

- **What:** Subscribe to `game` UPDATEs (filtered
  client-side to `contestGameIds`). When `status` flips
  `scheduled → live` or `live → final`, emit a synthetic
  FeedEvent of event_type `mlb.game.start` /
  `mlb.game.end` with pretty copy.
- **Acceptance:** Feed shows start/end lines for
  contest games.

### T18.6.3 `LiveEventsProvider` token-trigger events

- **What:** Subscribe to `token_application` UPDATEs
  filtered to current user + contest. When `triggered`
  flips null → true/false, emit a synthetic FeedEvent.
- **Acceptance:** Feed shows token fire/miss lines on
  reconcile.

### T18.6.4 Copy + icons

- **What:** Use `eventActionLabel` extension for new
  event types. Emoji prefix (⚾ / 🪙) matches the
  playful tone.
- **Acceptance:** Strings match the spec's examples.

---

## P18.7 — ADR-0023

Standard template.

---

## Dependencies between tasks

```
P18.1 (sql + actions) ──► P18.2 (ui lock)
P18.3 (game data) ──► P18.2 + P18.4 + P18.5
P18.4 (slot footer) ──► independent after P18.3
P18.5 (card + box chip) ──► after P18.3
P18.6 (feed breadth) ──► independent
                                        │
                                        ▼
                                   P18.7 (ADR)
```

P18.1 → P18.2 chain. P18.3 is pre-req for P18.2 / P18.4 /
P18.5. P18.6 runs parallel. P18.7 closes.

---

## What's NOT in Phase 18

Per spec §49:

- Onboarding / empty-error / a11y / foil motion / dupe
  picker / mobile / sound / haptics / artwork.
- Rank display.
- Webhook retry observability.
- CI integration for fixtures.
- Inning-switch events in feed.
- Doubleheader second-game handling.
- Auto-creation of MLB-only rows.
- Drift alerting.
