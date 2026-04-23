# ADR-0039 — Phase 39 (Unified sidebar) Retrospective

**Status:** Accepted · **Date:** 2026-04-23
**Phase:** Phase 39 (v1.24)
**Companion specs:** `draft-deck-polish-spec.md` §122–§127,
`docs/roadmap-phase-39.md`.

---

## Context

The right sidebar had two different layouts gated by
`entry.status`:

- **Building** (pre-submit): DraftingHeadline + RosterSection
  + SubmitSection (with a lock countdown).
- **Post-submit**: ScoreHeadline + BoxScoreSection +
  EventFeed.

User feedback: because individual games start at different
times across the day, there's no single meaningful "lock
time" for the whole lineup. The Submit button and lock
countdown were misleading — what actually matters is the
per-slot lock when each player's game starts. Asked to
drop both and unify the sidebar.

## Decision

One persistent sidebar layout, used through the whole day:

1. **ContestHeader.** Name + date, no countdown.
2. **SidebarHeadline.** One adaptive block:
   - no slot locked → "Drafting · N/10 slots filled" +
     projected FP.
   - any slot locked + not all final → "Live · N live · M
     final" + live FP.
   - all final → "Final · Contest final" + final FP.
3. **RosterSection.** Persistent per-slot rows — `Pos ·
   Player · GameChip · FP`. FP cell adapts per game state
   (projected / live / final / em-dash).
4. **Tabs** (Actions / Events).
   - Actions: Auto-sub radios + warnings list (low-
     contract / IL / DFA / expired).
   - Events: existing EventFeed.

Supporting changes:

- Submit button + lock countdown removed entirely.
  `handleSubmit` + `useLockCountdown` + `canSubmit` +
  `submitting` state deleted from LineupView.
- `submitLineup` server action no longer imported.
- `LiveEventsProvider` + `CardContractEventsProvider` now
  mount unconditionally so the Events tab has a feed even
  pre-lock.

Backend `entry.status` lifecycle stays unchanged — the
status field still auto-transitions at `contest.lineup_locks_at`
for reconcile / auto-sub logic, it's just not surfaced in
the UI.

## Consequences

**What got better:**

- One sidebar shape all day. No reflow at submit time.
- User can focus on drafting without a looming countdown.
  The game "commits" cleanly as each slot's game starts.
- Events tab is available pre-lock for users who want to
  watch a feed of nothing warming up (or for partial-live
  scenarios where early games have fired events before the
  full contest goes "live").
- Fewer moving pieces in the component tree — removed
  `BuildingContent`, `PostSubmitContent`, `DraftingHeadline`,
  `ScoreHeadline`, `BoxScoreSection`, `SubmitSection`, and
  the original `RosterSection`. New unified components:
  `SidebarHeadline`, `Headline`, `RosterSection`,
  `SidebarTabs`, `LineupActions`.

**What's still open:**

- `entry.status` transitions happen at `contest.lineup_locks_at`
  server-side. If slot games start before that time, per-slot
  locks engage but `entry.status` may still show 'building'
  in the DB. UI doesn't care, but reconcile / auto-sub flows
  might. Haven't audited; deferring.
- Manual Priority sub-order UI still absent. Actions tab
  has the mode radio but no priority ordering interface.
- No filter chips in the Events tab — stream is the full
  lineup's events.
- Empty-slot behavior when its earliest eligible game
  starts: still fully editable (not auto-locked). Matches
  the user's intent ("stays editable until a specific game
  locks that position") but current logic doesn't actively
  lock empty slots at any point.

## Tricky bits

- **State derivation.** The three headline states derive
  from `slotFills[pos].locked` and each slot's
  `gameInfo.status`. Had to decide what happens when no
  slot has a game today (off days, all players OFF): lands
  in the "all final" branch with `final` score. That's
  probably fine (contest is a no-op), but worth noting.
- **`allFinal` for empty slots.** Empty slots return
  `true` from the "final?" check so the state doesn't
  stick in "Live" forever when half the roster is empty
  and the other half finished. If you have 5 slots all
  final and 5 empty, state = Final.
- **`filledCount` one-use.** Was used to gate the Submit
  button label; now only used inside the SidebarHeadline
  Drafting branch. Kept the var at the top of the
  component with a `void filledCount;` expression where
  TypeScript might otherwise complain (it doesn't, but
  left the alias for clarity).

## Alternatives considered

- **Keep the Submit button, just remove the countdown.**
  Rejected — user explicitly asked to remove the button.
  The mental model of implicit commit is cleaner.
- **Make the Box Score a third tab.** Rejected — roster
  is the thing users look at constantly; burying it
  behind a tab click adds friction.
- **Server-side auto-flip `entry.status` on first slot
  lock.** Punted. Backend current behavior is
  acceptable; UI no longer depends on it.

## Links

- Commit (forthcoming): `feat(sidebar): P39 unified
  sidebar`
- Polish spec: §122, §123, §124, §125, §126
- Roadmap: `docs/roadmap-phase-39.md`
- Related: ADR-0034 (P34 sidebar redesign introduced the
  post-submit three-block layout — this phase collapses
  that back into one shape), ADR-0035 (P35 added
  building-state parity — now merged).
