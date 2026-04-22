# ADR-0023 — Phase 18 (Gameplay Legibility) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 18 (Feel Pass v1.11)
**Companion specs:** `draft-deck-polish-spec.md` §44–§49,
`docs/roadmap-phase-18.md`.

---

## Context

User feedback during live testing: the post-submit contest
surface was functionally opaque.
1. Lock semantics felt wrong — the whole lineup locked when
   the first game started, even though many players' games
   were hours away. User wanted per-slot lock.
2. No game-state visibility — couldn't tell if a player's
   game was pre / live / final at a glance.
3. No opponent + time info to anchor management decisions.
4. Card FP always showed career, never live. The live FP
   existed (sidebar Box Score had it) but the cards on the
   diamond didn't reflect today's contribution.
5. Event feed narrow — only batter/pitcher events; no
   narration of games starting, games ending, or token
   triggers.

Estimate: ~3 days. Shipped in ~2 hours, 4 code commits.

## Decision

- Per-slot lock derived from each starter's game status +
  `scheduled_start`. SQL helper `is_slot_locked(slot_id)`
  does the same check server-side inside the mutation fns.
  No enum changes — just stopped using the `locked` status
  value.
- Slot footer game-state line (`<SlotGameState>`) — three
  visual states, color-coded, palette matching the
  existing Event Feed tones.
- `LineupCardVM.contestFp` optional prop — lineup page
  populates it post-submit; Card component has a clean
  fallback to `careerFp` in other contexts.
- `<LiveEventsProvider>` extended with two more Realtime
  subscriptions on the same channel (game UPDATE + token_
  application UPDATE). Client-side projection into
  FeedEvents.
- Box Score row gained the chip variant of `<SlotGameState>`.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `5112e598` | Polish spec §44–§49 + `docs/roadmap-phase-18.md`. |
| P18.1 | `5be95acd` | Migration 0029 (is_slot_locked helper + token_application realtime) + 0030 (mutation fns per-slot lock). Both applied to prod via supabase db push --linked. Action layer maps SLOT_LOCKED error. |
| P18.2-P18.5 | `0de649a7` | Game data pipeline (page.tsx gains join query), SlotGameState component, LineupSlot per-slot lock + padlock glyph + footer, Card contestFp, Box Score chip column. |
| P18.6 | `bfb4d463` | LiveEventsProvider gains game + token_application subscriptions. projectGameTransition + projectTokenTrigger helpers synthesize game-start/end + token hit/miss FeedEvents. |
| Deploy | *(vercel)* | Phase 18 live on draft-deck.vercel.app. |
| P18.7 | *(this)* | ADR-0023. |

## What went well

1. **SQL helper + relaxed fn guards was a minimal change.**
   Each mutation fn went from `entry.status = 'building'` +
   `contest.lineup_locks_at > now()` to
   `entry.status IN (...building..live)` + per-slot lock
   check. Logic flows cleanly; error message prefixed with
   `SLOT_LOCKED:` for the action layer to match.
2. **SlotGameState as one component with two variants.**
   Same render logic powers the slot footer + the Box Score
   chip. Kept the game-state copy + palette in one place.
3. **Card component extension kept backward compatible.**
   `contestFp` is optional on `CardViewModel`; every caller
   that doesn't set it continues to render career FP. No
   migration of collection/vault/pack code needed.
4. **Three Realtime sources, one channel.** The
   `LiveEventsProvider` already had the `game_event` stream;
   adding `game` + `token_application` UPDATEs was two more
   `.on("postgres_changes", ...)` chains on the same
   subscription. Same seenIds dedup covers all three.
5. **Dedup via synthetic IDs worked cleanly.** Game
   transitions keyed as `game-start-{id}` / `game-end-{id}`;
   token triggers as `token-app-{id}`. The existing `Set`
   handles both the initial-fetch vs. subscription race AND
   the multi-source dedup.
6. **Per-slot lock restored a whole class of gameplay
   decisions.** Post-submit, the user can still swap a
   later-game SS if their earlier-game SP1 has been live
   for hours. That's the actual fantasy-sports behavior
   users expect.

## What surprised us

1. **The `locked` prop name shift was subtle.** Old meaning:
   "contest is past lineup-lock time → nothing's editable."
   New meaning: "contest is final → truly nothing can be
   done." Middle state (submitted / live) now has per-slot
   lock, so bench + tokens stay draggable. Had to rename
   the contest-entry-status gate to `submitted` for the
   sidebar/header UI. One subtle rename; no regressions.
2. **Enum cleanup deferred.** Spec §44 talked about
   collapsing `contest_entry_status` to 4 values (dropping
   'locked'). Postgres enum changes are a migration chore;
   left the enum alone + just stopped transitioning INTO
   the 'locked' state. Existing entries at 'locked' (if
   any) behave identically to 'live' under the new mutation-
   fn rules. Clean enough to skip the rename.
3. **Game-state data is ONE extra query.** I was worried
   about N+1 on game lookup, but since the contest's
   `included_game_ids` is known up-front, the join is a
   single "select all games in that array + left-join
   teams" round-trip. Mapped to a `team_id → game` lookup
   in memory. ~10 rows max.
4. **SlotGameState `chip` vs `footer` variants share
   nothing but the state-word helper.** Almost different
   components. Kept them under one export since the state
   logic + palette stay in sync that way.
5. **Inning / score data on `game` isn't populated by
   BDL consistently yet.** `homeRuns` + `awayRuns` do
   flow during reconcile, but live in-game innings aren't
   tracked on the `game` row. Slot footer's LIVE copy
   falls back to just "LIVE · {score}" without inning.
   StatusChip (Phase 12) inning narration driven by
   `game_event` still works separately.

## What we deliberately simplified

1. **No auto-transition of entry.status `submitted → live`
   server-side.** That state change used to happen via the
   contest-lock cron; Phase 18 didn't rewire the trigger.
   Works fine for testing because the mutation fns now
   accept any of building/submitted/locked/live. A future
   phase should clean up the status flow if/when it
   matters.
2. **Padlock glyph is minimal.** No animation, no
   tooltip. Just the lock icon in the corner of locked
   slots. Clearly communicates "this is frozen."
3. **No integration test for per-slot lock.** Phase 11's
   test harness could cover this — scenario where slot's
   game is live but other slots are still editable. Added
   to the open items.
4. **Inning-switch events omitted from feed.** User's
   interview answer was "skip inning switches — Status
   Chip handles it." Held to that.
5. **Token-trigger FeedEvent doesn't include player
   name.** Just `🪙 Token · Token hit · +8.0 FP`. The
   target card is implied by the user's own mental model.
   Could add `(Skubal)` as a qualifier later; simpler as-is.
6. **Game-state doubleheader edge.** Per spec §45 trade-
   off: we pick the first scheduled game per team. Second
   games of doubleheaders won't render until the first one
   finalizes. Rare edge case; fine for launch.
7. **Kept `contest.lineup_locks_at` column + its write
   path.** Old "when does the lineup lock" timestamp is
   still displayed in the header countdown during building.
   Post-submit it's ignored — the per-slot logic handles
   everything. Could retire the column + its cron entirely
   in a later cleanup.

## What's ready for the next polish pass

- **`is_slot_locked` is composable.** Any future SQL fn
  that wants to gate on a slot being unlocked imports the
  helper. Keeps the predicate definition in one place.
- **`<SlotGameState>` chip variant could power a future
  game-state timeline visualization** (e.g., "your 10 games
  ordered by start time") — same semantics, different
  presentation.
- **Three Realtime sources × one channel** is the new
  upper bound on what the LiveEventsProvider does. If a
  fourth source ever lands (live inning data?), the
  pattern is the same — add `.on()`, add a `project*`
  helper, let dedup handle the rest.
- **Game + token_application now have REPLICA IDENTITY
  FULL.** Future features that want UPDATE payloads from
  those tables don't need a migration.

## Open items

1. **Integration test for per-slot lock.** tests/fixtures/
   seed already covers entry/contest/slot/card/game — add
   a scenario that sets game status = live, invokes
   update_lineup_slot on that slot, expects 23514
   SLOT_LOCKED.
2. **Drop the `locked` value from contest_entry_status
   enum.** Cosmetic; value is unused after Phase 18.
   Combined migration: stop writing it in the cron, then
   ALTER TYPE ... RENAME or enum recreate.
3. **Auto-transition submitted → live.** Should fire when
   any included_game's status flips to live. Probably a
   trigger on game UPDATE + per-contest scan.
4. **Entry status enum collapse + contest.lineup_locks_at
   retirement** as a combined cleanup.
5. **Doubleheader second-game handling.** Surface the
   second game's info when the first finalizes.
6. **Inning / score live-tracking on the `game` row.**
   BDL webhook handler doesn't currently populate these
   fields during live games — only home_runs / away_runs
   at final time. Would make LIVE slot footer richer
   ("LIVE · T5 · 2-1" instead of just "LIVE · 2-1").
7. **Onboarding pass** — still the biggest parked
   user-facing item.
8. **Standard parked items** — a11y, sound, tier foil,
   dupe picker, rank display.

## Estimate vs reality

Estimate: ~3 days. Shipped: 4 code commits + plan + ADR in
one session (~2 hours). Significantly under estimate — the
biggest risks (SQL fn rewrites, per-slot lock propagation
through drag-drop) both landed cleanly. The UI layer
changes were mostly pass-through (new props on existing
components, one new small component).

## Consequences

- Post-submit lineup management now matches user
  expectation — swap later-starting players after earlier
  games have gone live, apply tokens right up until each
  slot locks, remove & re-add freely.
- At-a-glance the diamond now tells the user everything:
  each slot shows opponent + time pre-game, live score
  during, final result after. Padlock glyph for locked.
- The card face reflects today's contribution in real
  time — no more "0 FP" while the player scores +3 over
  there.
- Event feed narrates the full contest arc: game starts,
  token triggers, per-player events, game ends. User
  scrolling back through history can reconstruct the
  contest.
- Future features that need per-slot behavior (e.g., late
  swaps, trade window) have a clean server-side primitive
  to compose against.

## Related ADRs

- ADR-0014 — Phase 9 Retrospective (Real-Game Scoring).
  Established slot.live_fp + slot.final_fp which Phase 18
  surfaces on the card face.
- ADR-0015 — Phase 10 Retrospective (Unified Lineup View).
  Event Feed + Status Chip Phase 18 extends.
- ADR-0017 — Phase 12 Retrospective (Live-View Liveness).
  LiveEventsProvider pattern Phase 18's multi-subscription
  extension builds on.
