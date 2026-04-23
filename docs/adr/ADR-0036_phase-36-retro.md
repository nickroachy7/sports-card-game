# ADR-0036 — Phase 36 (Cards header + /shop kill + pack reveal redesign) Retrospective

**Status:** Accepted · **Date:** 2026-04-23
**Phase:** Phase 36 (v1.21)
**Companion specs:** `draft-deck-polish-spec.md` §108–§112,
`docs/roadmap-phase-36.md`.

---

## Context

Three user-flagged issues collapsed into one phase:

1. The Cards / Tokens section header had three stacked rows
   (count + position + search · tier chips · state chips) —
   ~120px of header chrome before any cards rendered. The
   user wanted it tightened, ideally to one row.
2. `/shop` was a dedicated page whose only regular action
   was "open a pack." The user wanted it killed, replaced
   by an FAB + modal with Daily + Standard × 1 / × 5 / × 10
   right on the lineup page.
3. Pack reveal was a carousel — one card at a time, progress
   dots, Next button. The user wanted a stacked deck with
   tap-to-peel + a revealed row with per-card Quick-sell
   and Add-to-vault actions + a Done button.

## Decision

Four coordinated changes shipped together.

- **§108 Header compaction.** New `FilterPopover` helper
  wraps the tier + game-state chip sets behind a labeled
  pill ("Tier: Gold · 6") that opens a popover on click.
  One flex-wrap row instead of three. Introduced a
  shadcn-style Popover primitive at `src/components/ui/
  popover.tsx` (thin wrapper over the bundled `radix-ui`
  umbrella package; matches the AlertDialog pattern).

- **§109 /shop kill.** Deleted `src/app/(app)/shop`. Removed
  the nav link + the header Package daily-pack chip. Added
  `BuyPacksFab` + `BuyPacksModal`:
  - FAB is a 56px gold circle bottom-right on /lineup,
    hidden only while a pack reveal is in flight.
  - Modal has a free Daily pack section + a Standard bundle
    section with quantity pills (×1/×5/×10) at flat per-
    pack cost. `Buy N packs (C coins)` confirm; `Need X
    more coins` when short.
  - Lineup page plumbs coin balance + daily-ready seconds
    + standard pack cost through `LineupViewProps`.

- **§110 `openPacksBatch`.** Server action that loops the
  existing `open_pack` SQL fn up to 10× server-side.
  Matches the P35 bulk-quick-sell pattern — partial
  failures reported, loop stops at the first error. Daily
  packs forced to quantity 1.

- **§111 Pack reveal redesign.** Rewrote `PackOpenerModal`
  around a peel-then-row stage machine. Face-down deck in
  the center (z-stacked with 2px offsets for depth); tap
  the top to flip via the existing `PackCardFlip` 3D
  Y-rotation. `StarPullBurst` still fires for star /
  starter tiers. Dupes open a modal-within-modal with the
  existing `PackDupePanel` so the peel flow pauses until
  resolved. Once the stack is empty + all dupes resolved,
  per-card Quick-sell / Add-to-vault buttons unlock under
  each revealed card. Done button disabled until canDone;
  Escape / click-outside can't dismiss mid-reveal.

LineupView flattens batch openings into a single synthetic
`OpenPackResult` so `PackOpenerModal` stays oblivious to
whether it's one pack or ten.

## Consequences

**What got better:**

- Cards section reclaimed ~80px of header vertical space.
  Filter state (Tier: Gold · 6) is visible at a glance on
  the pill even when the popover is closed.
- Shop is one click away via a visible FAB; daily-ready
  indicator is colocated with the only thing you'd do about
  it. Removing the `/shop` route also removes a whole
  navigation surface to maintain.
- Pack reveal feels like a real pack open — deck + peel +
  settle. Per-card action buttons remove the post-pull
  round-trip to the cards grid for triaging.
- Uniform bulk-action pattern across phases: P35 introduced
  bulk quick-sell / vault; P36 reused the same loop-the-
  SQL-fn pattern for bulk pack opens.

**What's still open:**

- Premium pack type still exists in the DB + `open_pack`
  SQL fn but doesn't appear in the buy modal. Easy to add
  a third section when there's a reason to offer it again.
- No bundle discount for 5× / 10×. Flat multiplication.
  Economy can tune pricing at the config level later.
- Pack reveal doesn't virtualize a 50-card row — fine at
  current max bundle (10 standard × 5 cards).
- No reveal-all / skip-all shortcut. Dropped from v1; users
  can click-through in rhythm.

## Tricky bits

- **Stack-zone → row handoff.** First pass had the peeled
  card visually "fly" from its stack position to the row
  slot using Framer Motion `layoutId`. Simplified to: the
  stack-zone holds the active card through its flip, then
  the parent advances `peelIndex` which hides it from the
  stack and shows it in the revealed-row slot. Minimal
  animation; clean state transitions.
- **Dupe panel timing.** Can't show the dupe panel before
  the flip completes (user doesn't know WHO they pulled
  yet). Solution: `handleFlipComplete` checks `isDupe`
  and parks `activeDupeIdx` if true; dupe panel renders
  as a modal-within-modal with scrim.
- **Biome a11y on the quantity selector.** Tried `role=
  "radio"` first — Biome flagged with `useSemanticElements`
  (suggests real `<input type="radio">`). Tried
  `aria-label` on a plain div — flagged with
  `useAriaPropsSupportedByRole`. Settled on a `<fieldset>`
  with an `sr-only` `<legend>`; biome-clean and it still
  gives a proper accessible label.

## Alternatives considered

- **Keep the three-row header.** Would've required no code
  churn but leaves ~80px of chrome unused. The popover
  pattern is widely understood and folds up cleanly.
- **Popover for the position pills too.** Rejected — "All
  / Hitters / Pitchers" is already compact and being a
  single primary filter makes it better always-visible.
- **New SQL fn for batch open.** Would've been atomic
  across the whole batch. Rejected — each pack open is
  already independent in the SQL fn; looping at the TS
  level keeps the code simple and matches P35 precedent.
- **Reveal row at fixed width.** Considered limiting the
  card size so 10 cards always fit without scroll.
  Rejected — cards are already medium at 160px; scaling
  them down further cheapens the reveal. The row gets a
  horizontal scroll on narrower viewports instead.

## Links

- Commit: `22311f90 feat(lineup): P36 cards header
  compaction + /shop kill + pack reveal redesign`
- Polish spec: §108, §109, §110, §111
- Roadmap: `docs/roadmap-phase-36.md`
- Related: ADR-0035 (Phase 35 multi-select + bulk server
  actions — precedent for the `openPacksBatch` loop
  pattern).
