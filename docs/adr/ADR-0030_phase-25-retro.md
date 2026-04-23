# ADR-0030 — Phase 25 (Match bench card size) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 25 (Feel Pass v1.15.1)
**Companion specs:** `draft-deck-polish-spec.md` §76–§77,
`docs/roadmap-phase-25.md`.

---

## Context

User feedback after Phase 24 shipped:

> "My bad if I misunderstood what you were saying but a lot
> of people are going to use our web app at a smaller
> normal laptop size. Ideally, all the cards in the lineup
> would always remain the same size as the cards in the
> bench. We can do better here as this does not look nice."

Phase 24's fit-to-pane math reserved 70px per slot for
chrome (position label + pill + remove button + gaps). At
a typical 1440×900 laptop viewport:

```
usableH = 660 - 48 - 32 - 66 - 210 = 304
rowCardH = 304 / 3 = 101
widthFromHeight = 101 / 1.396 = 72px   ← smaller than bench 96
```

The math floored cards to ~72px wide — SMALLER than the
bench's fixed 96. User saw tiny lineup cards above larger
bench cards, which looks precisely wrong.

The correction direction landed in the interview: drop
scaling entirely, pin lineup to bench size exactly.

## Decision

One slice, all revert + polish.

- **LineupSlot reverts** the transform-scale shell. Both
  empty (`h-[134px] w-[96px]` dashed box) and filled
  (`<Card size="small" />` = 96×134) variants go back to
  their pre-P24 sizing. All P24 references to
  `--card-w-px` and `--card-scale` removed.
- **LineupGrid rewrites** to a shared-width layout:
  - Drop the `ResizeObserver`, `useEffect`, `useState`,
    `LAYOUT` constants, and `computeCardWidth` helper.
  - The three RoleRows sit inside a fixed 544px-wide
    container (infield's natural width = 5 × 96 + 4 × 16).
  - Labels are block `<h3>` elements inside that
    container → flush to the same left edge across all
    three rows.
  - Rotation (2 cards) and Outfield (3 cards) rows
    `justify-center` their cards within the 544px shared
    width; Infield (5 cards) fills it.
  - Outer wrapper: `flex h-full w-full flex-col
    items-center justify-center gap-6 p-6` so the shared
    container centers both horizontally and vertically in
    the pane.
- **LineupShell drops** the P24 `overflow-hidden` on the
  grid pane. Content at fixed size (~620px tall) fits in
  realistic laptop flex-1 allocations.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `f3fce022` | Polish spec §76-§77 + roadmap. |
| P25.1 + P25.2 + P25.3 | `e083a753` | Full revert of P24 scaling; shared-container layout; shell overflow default. 3 files; 88 insertions, 182 deletions (net removal). |
| P25.4 | *(this)* | ADR-0030. |

Deploy: `draft-deck-qifuvyr3o-nickroachy7s-projects.vercel.app` →
READY.

Prod verification:
- Lineup cards render at exactly 96×134 — identical to
  bench cards directly below.
- Drag from bench to slot shows no size transition.
- Row labels (ROTATION / INFIELD / OUTFIELD) flush-left
  to the same x-coordinate across rows.
- No internal scroll on the lineup grid at typical
  viewport heights.

## What went well

1. **Clear user priorities make reverts easy.** Once the
   interview locked "match bench exactly," the entire P24
   apparatus had to go. A scope that started "maybe this
   could be salvaged with different constants" became
   "delete the scaling code cleanly." Net: -94 lines
   deleted across three files.
2. **544px shared-width container.** One inline style
   anchors the whole layout. All three rows inherit the
   width; labels naturally flush-left because they're
   block elements; cards naturally center because the
   inner flex has `justify-center`. No math, no state, no
   observers.
3. **Card.tsx still untouched.** Phases 23 → 24 → 25 all
   avoided the Card refactor. The component's hardcoded
   tier-based inline styles are load-bearing across the
   whole app (lineup, bench, collection, pack ceremony,
   vault ceremony, selected-card sidebar). Not touching
   it kept Phase 25 a localized change.
4. **Drag motion now feels correct.** Pre-P25 the bench
   card (96×134) would grow or shrink during the drag →
   drop visual as it landed on a scaled slot. Post-P25 the
   drag ghost and drop target are identical dimensions —
   no size shift. Small but satisfying.

## What surprised us

1. **The P24 bug was chrome reservation, not the
   approach.** Initial instinct was "the transform-scale
   approach is flawed." Actually the approach worked;
   `SLOT_CHROME_H = 70` was just too aggressive (real
   chrome is ~40-50px). Had we picked 40 instead, cards
   would have computed larger than bench on the same
   viewport. But the user's updated preference is bench-
   matching, not "as large as possible" — so the chrome
   tweak would've fixed one viewport but missed the new
   design intent entirely.
2. **Shared-container approach reads cleaner than
   row-by-row.** Initially considered each row as a self-
   sized flex container with its own width. Going with a
   single 544px parent that all three rows inherit turned
   the label-alignment problem into a non-problem: labels
   are block-level text inside a fixed-width container,
   flush-left is automatic.
3. **Net-negative lines of code.** P25 removed 94 more
   lines than it added. Rare for a feature commit; this
   one counts as debt reduction.

## What we deliberately accepted

1. **Wide-screen horizontal waste returns.** On 4K+
   displays the 544px container sits centered with
   substantial empty gutter. Acknowledged; the eventual
   deep sidebar reorg or matchup-context side panels can
   use that space productively.
2. **Short-viewport page scroll.** Below ~780px tall, the
   outfield row may push below the fold and the document
   scrolls. Normal laptop minimum heights (900+) fit
   without scroll. Not optimizing for sub-13" viewports.
3. **Card.tsx still hardcoded.** A proper fluid Card
   refactor is still the long-term win if we ever want
   truly responsive card sizes across every surface. Not
   worth the scope for this phase.

## What's ready for the next polish pass

- **The 544px shared-container pattern** works for any
  roster-shaped layout. Future "your opponent's lineup"
  or "historical roster" surfaces compose in directly.
- **The revert-to-simple-fixed approach** is a useful
  reminder that fluid systems aren't always the right
  answer. Sometimes the constraint is "match this other
  fixed thing" and the simplest code wins.

## Open items

1. **Deep sidebar reorganization** — parked since P23.
2. **Card.tsx fluid refactor** — still the long-term path
   if future surfaces need it; no pressure now.
3. **Matchup-context side panels on wide screens** —
   future work that would use the extra real estate the
   fixed-size layout leaves.
4. **Baserunners live tracking** — parked.
5. **Pitcher-on-mound indicator** — parked.
6. **Collection multi-day schedule view** — parked.
7. **Onboarding flow pass** — largest parked item.
8. **Standard parked items.**

## Estimate vs reality

Estimate: ~0.15 day. Shipped in ~15 minutes of code + one
2-minute deploy. Zero hotfixes. Zero test failures.

## Consequences

- Lineup and bench cards are visually identical at every
  viewport. Drag-from-bench-to-slot is a zero-transition
  motion.
- Layout reads as a structured roster — three labeled
  rows, labels aligned, cards uniform.
- The "canvas treatment" user flagged is gone. No vast
  empty middle, no inconsistent sizing, no floating-in-
  void impression.
- P24's scaling experiment stands as a lesson: fluid
  sizing requires more than a ResizeObserver hook; it
  requires honest accounting of every chrome element, and
  even then "fluid" may not be the right design direction.

## Related ADRs

- ADR-0028 — Phase 23 Retrospective. Shipped the three-
  role-row structure that Phase 25 pins to fixed sizes.
  The row shape is unchanged; only the sizing reverted.
- ADR-0029 — Phase 24 Retrospective. Shipped the fluid
  scaling this phase reverts. Keep for archival; the
  transform-scale pattern may still apply to other
  surfaces where fit-to-pane actually matters (e.g. a
  full-screen ceremony view).
