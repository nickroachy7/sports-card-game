# ADR-0026 — Phase 21 (Bench Legibility) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 21 (Feel Pass v1.12.1)
**Companion specs:** `draft-deck-polish-spec.md` §58–§61,
`docs/roadmap-phase-21.md`.

---

## Context

User feedback: "we're making a lot of great changes for
people to monitor their cards in the lineup, but the cards
on the bench don't show that information." For a start-
order decision, users need to know at bench-scan time
whether a player:
- Has a game today (vs. off-day)
- When it starts (pre-game) or what state it's in (live /
  final)
- Which players to focus on for last-minute swaps before
  per-slot lock

Estimate: ~0.5 day. Shipped in ~40 minutes (one commit,
zero migrations).

## Decision

- Extend `<SlotGameState>` with a `"bench"` variant that
  renders a muted `OFF` when info is null. Default
  "footer" behavior unchanged (lineup slots still render
  null for missing info, preserving the existing tight
  diamond layout).
- Thread the `slotGameByCardId` prop (already computed
  by the Phase 18 lineup page + passed to `LineupView`)
  down through `<BenchDrawer>` to `<BenchCard>`.
- Reorder `BenchDrawer.filtered` by game-state priority:
  `scheduled → live → final → off`, pre-game by earliest
  start, alphabetical within each bucket.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `6463c0ba` | Polish spec §58–§61 + roadmap. |
| P21.1–P21.3 | `2e2913a4` | SlotGameState bench variant + BenchCard footer + priority sort + prop threading. 113 insertions, 40 deletions across 4 files. |
| P21.5 | *(this)* | ADR-0026. |

Prod verification — each bench card now renders one of:
- `vs LAD · 7:40p` (pre-game, muted grey)
- `LIVE · T5 · 2-1` (emerald, with inning from P20's
  `current_inning`)
- `FINAL W 5-2` (neutral)
- `OFF` (muted, no contest game today)

Sort verified: pre-game cards at the front of the bench
scroll, final + off drift to the right.

## What went well

1. **Everything plugged into existing primitives.**
   `slotGameByCardId` was already computed in P18 +
   threaded to `LineupView`. `<SlotGameState>` was already
   shared between slot footer + box-score chip. Adding a
   third variant was a 10-line branch; thread through
   bench was two props. Zero new data flows.
2. **OFF variant is a clean degenerate case.** Rendering
   `<SlotGameState info={null} variant="bench"/>` returns
   the muted `OFF` span inline with the other variants.
   Lineup slots pass no variant → continue to render null
   on missing info (unchanged).
3. **Priority sort is 6 lines.** `stateRank()` helper +
   the `.sort((a, b) => { ... })` comparator slot in
   cleanly over the existing filter chain. Pre-game
   start-time tiebreak handles NULL scheduled_start
   gracefully.
4. **BenchCard flex rewrap was minimal.** Original was a
   `<div class="relative shrink-0">` with the button + an
   absolute-positioned AppliedTokenBadge. Flex-col wrap
   lets the footer sit below; the button-relative subtree
   keeps the token badge positioning intact.
5. **User flow restored.** The user's concern — "how do
   I decide who to start without info?" — collapses with
   the bench now showing the same game-state glance as
   the lineup diamond.

## What surprised us

1. **Zero schema or data work required.** Every Phase
   since 18 has had at least one migration or data source
   addition; Phase 21 was pure UI composition. The
   previous phases did the plumbing; Phase 21 just
   rendered.
2. **`OFF` vs. null ambiguity.** A card whose player has
   no game today in the contest passes `info={null}` to
   the bench variant. A card whose player DOES have a
   game but the game info is missing data (e.g., schedule
   failed to sync) also passes null. Both show `OFF`.
   Acceptable — the data-quality edge is rare post-P19.
3. **Pre-game sort ordering when all starts are NULL.**
   Prior to P19, every game row's `scheduled_start` was
   null. Sort would've fallen through to alpha inside the
   pre-game bucket. Post-P19 the starts are populated +
   the tiebreak works. No code change needed — the null-
   safe tiebreak degrades cleanly.

## What we deliberately simplified

1. **No bench filter chips for game state.** Spec §61
   explicitly parks them. Priority sort puts actionable
   cards first; a filter chip ("show only pre-game") is
   the natural next step if sorting proves insufficient.
2. **Card height grew.** ~14px per bench card. Horizontal
   scroll still works. No attempt to save space via chip
   overlay.
3. **OFF cards stay draggable.** A user can still add an
   off-day player to their lineup — maybe for a future
   contest day, maybe just to park them in a slot. UI
   doesn't gate it.
4. **Collection page untouched.** Per spec §60. Different
   surface, different context.
5. **No sort-stability concern.** Priority sort re-runs
   on every filter/search change via the memo. Minor
   re-render; negligible.

## What's ready for the next polish pass

- **`<SlotGameState>` three-variant shape** (footer / chip
  / bench) is a clean template. Any fourth surface that
  wants a game-state render (contest preview? opponent's
  lineup?) copies the pattern.
- **BenchCard composition** of card + metadata footer is
  reusable — if TokenTray ever wants a "this token is
  rostered elsewhere" line or a similar metadata footer,
  same flex-col wrap applies.
- **Priority-sort recipe** (`stateRank` enum mapping +
  tiebreaker comparator) works for any ordered-state UI.
  Leaderboard by contest activity, etc., could use the
  same shape.

## Open items

1. **Bench filter chips** by game state (parked).
2. **Collection page "Has game today" filter** (parked).
3. **Full doubleheader support** (parked).
4. **Outs / baserunners** (parked).
5. **`contest_status` enum cleanup** (parallel to P20's
   `contest_entry_status`).
6. **Onboarding pass** — still the biggest user-facing
   parked item.
7. **Standard parked items.**

## Estimate vs reality

Estimate: ~0.5 day (~3-4 hours). Shipped: ~40 minutes
wall time for the code; ADR 10 minutes. Way under
estimate. The UI composition-only shape + zero data work
made this one of the cleanest phases in recent memory.

## Consequences

- Users scanning the bench see immediately which cards
  have actionable games tonight, which are already
  locked in progress, and which are off-day (no game).
- Priority sort puts "still draftable" cards at the
  leftmost positions — the natural scanning entry point.
- `<SlotGameState>` now renders for both the lineup and
  bench surfaces, keeping the design language consistent.
- Off-day cards stay visible + draggable; they just
  carry an honest "no game tonight" label.

## Related ADRs

- ADR-0023 — Phase 18 Retrospective. Shipped the slot
  footer game-state line + `slotGameByCardId` prop that
  Phase 21 reuses.
- ADR-0025 — Phase 20 Retrospective. Populated
  `current_inning` + `current_inning_half` which flow
  through to the bench footer LIVE branch unchanged.
