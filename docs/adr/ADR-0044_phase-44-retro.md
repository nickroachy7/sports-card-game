# ADR-0044 — Phase 44 (Pack reveal row redesign) Retrospective

**Status:** Accepted · **Date:** 2026-04-24
**Phase:** Phase 44 (v1.29)
**Companion specs:** `draft-deck-polish-spec.md` §154–§160,
`docs/roadmap-phase-44.md`.

---

## Context

Phase 43 landed the in-place reveal panel with sequential
multi-pack flow. The internal layout carried over from the
Phase 36 modal: a z-stacked peel pile with depth layers at top,
flipped cards sliding into a separate revealed row below, at
160×224 "medium" size — 30% bigger than any card the user ever
sees elsewhere.

User feedback: cards should match the lineup / collection grid
size, and flipping should be free-order — any card in the pack
should be clickable, not just "top of the stack."

## Decision

### §154 Single horizontal flex-wrap row

- `StackZone` component deleted. No more z-stacked depth layers.
- All cards render in one `flex-wrap justify-center` row. Each
  slot is fixed at `w-[120px]` (lineup width) — 5-pack fits on
  one row, 10-pack wraps cleanly to 5×2.
- Face-down and face-up states live in the same slot; cards
  flip in place instead of migrating between zones.

### §155 Lineup-slot card size

- `PackCardFlip` gains a `size: CardSize` prop. Defaults to
  `"medium"` for backwards compat; reveal passes `"lineup"`.
- `SIZE_SPECS` map scales width / height / radius / border /
  card-back font size so the brand mark doesn't dwarf the
  smaller reveal.
- `StarPullBurst` gets a `sizeScale` prop that multiplies
  particle distance + size. Reveal passes `0.75` (lineup is
  ~75% of medium).

### §156 Any-order flipping

- `peelIndex` state deleted. Flip decision is fully per-card:
  each `flipped[i]` boolean toggles independently when its
  slot gets clicked.
- `PackCardFlip`'s click handler directly fires `onFlip(i)` —
  no "top of stack" routing.
- Subtitle copy updates: `Tap any card to reveal · N of M left`
  replaces `Tap the top card to peel · N left`.

### §157 Inline dupe resolution

- New `compact` variant on `PackDupePanel` — two lineup-size
  cards side-by-side with tight Keep New / Keep Existing
  buttons. Sits in a single row slot (~252px wide) with a
  tier-gold border and muted header.
- Dupe card's slot swaps into the compact panel the instant
  the flip lands on a dupe; the other slots in the row
  flex-wrap around it.
- `DupeResolutionOverlay` (the modal-within-modal
  backdrop+scrim from Phase 43) deleted.
- After resolution:
  - `kept_new` → slot collapses back to the new card, normal
    slot width.
  - `kept_existing` → slot collapses to the new card dimmed
    40% (new instance was sold). Sell/Vault on it stays
    disabled.

### §158 Per-card action gating (unchanged)

- Per-card Sell / Vault buttons stay gated until
  `packComplete = allFlipped && allResolved`. Matches the
  §151 exit-gating philosophy: the reveal is a completion
  arc, not a trickle.

## Consequences

**What got better:**

- Cards finally match the rest of the app — lineup slots,
  collection grid, card detail drawer all use the same card
  size family. Reveal no longer reads as "a different
  ceremonial dimension."
- Any-order flipping lets users pick their own path —
  especially nice for 10-packs where the user wants to flip
  their "most exciting" card first.
- Inline dupes stop pausing the whole reveal. If the user
  flips a dupe they resolve it in place; meanwhile they can
  still see all the other cards around it.
- Row layout + flex-wrap scales gracefully: one row for
  5-packs, wraps to two rows for 10-packs, adapts to narrow
  viewports. No scroll.

**What's still open:**

- Non-dupe per-card actions still gate behind the full
  completion. If a future iteration wants immediate-action
  semantics ("flip card, sell it, move on"), we'd relax the
  gate — explicitly preserved for v1.29 per user direction.
- StarPullBurst's screen-darken for star-tier pulls
  (`fixed inset-0` scrim) still goes full-screen; unchanged,
  but worth revisiting if the scrim feels heavy at smaller
  card size.
- No mobile-specific layout. Desktop-first; the flex-wrap
  degrades OK on narrower viewports but the sidebar takes
  most of the main-content width on small screens.
- `PackDupePanel`'s original (non-compact) variant is still
  in the file. Not currently used anywhere — all dupe
  resolution flows through compact now. Left in place as a
  short-term fallback; could be deleted once confident.

## Tricky bits

- Dupe slot width swap: a normal slot is 120px; the compact
  dupe panel is ~252px with border + padding. Flex-wrap
  handles the row re-flow smoothly without any manual
  resizing logic. Tested with a 5-pack where slot 3 was a
  dupe — slots 1-2 stay in row, slot 3 expands, slots 4-5
  wrap below.
- `kept_existing` dim overlay: the new instance was sold, but
  we still render the new card in the slot (user saw it
  flip; hiding it would feel like the reveal ate the card).
  40% opacity + disabled buttons signal the state.
- `peelIndex` removal broke the subtitle copy — subtitle now
  derives from `(allFlipped, allResolved, activeDupeIdx,
  cardsRemaining)` instead of `(peelIndex, stackRemaining)`.
  More states to juggle but fewer layout bugs downstream.
- `StarPullBurst` scale 0.75: tuned by eye. At 0.75 the 12
  particles still feel celebratory without overflowing the
  120px-wide slot. Dropping lower (0.6) felt anemic.

## Alternatives considered

- **Keep the peel stack, just shrink to lineup size.**
  Rejected — the z-stacked metaphor implies forced order
  (top-down). User explicitly asked for free-order.
- **Fan the face-down cards in an arc.** Rejected — cute but
  takes more horizontal space than flex-wrap, and the arc
  angles are hard to hit-target on smaller cards.
- **Hover-to-peek preview of face-down cards.** Rejected —
  kills the surprise. The flip-to-reveal IS the moment.
- **Per-card action unlock on flip (no pack-complete gate).**
  Rejected per interview answer — user chose to keep the
  current gate. If we relax later, the change is ~3 lines in
  `RevealCardSlot` (remove `actionsEnabled` check).

## Links

- Commit: (forthcoming) `feat(pack): P44 reveal row redesign`
- Polish spec: §154, §155, §156, §157, §158, §159, §160
- Roadmap: `docs/roadmap-phase-44.md`
- Previous: ADR-0043 (Phase 43 in-place reveal) — the
  PackRevealPanel component landed there; Phase 44 rewrote its
  guts for the new layout.
