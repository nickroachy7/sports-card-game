# ADR-0037 — Phase 37 (Remove-from-slot + token tooltips) Retrospective

**Status:** Accepted · **Date:** 2026-04-23
**Phase:** Phase 37 (v1.22)
**Companion specs:** `draft-deck-polish-spec.md` §113–§115,
`docs/roadmap-phase-37.md`.

---

## Context

Two discoverability gaps surfaced in the daily use of
`/lineup`:

1. No explicit way to remove a starter from a slot. Users
   could drag a card away, but the affordance wasn't obvious
   and required a lot of pointer travel.
2. Tokens show as compact pips with 2–3 letter labels (`QS`,
   `K8`, `HR`, `2H`, `SB`). New users can't tell what they
   do without memorizing the codes.

Both are pure polish — no server or data changes.

## Decision

- **§113 Remove-from-slot × button.** Small 20px circle in
  the top-left corner of every filled lineup slot. Hidden by
  default via `opacity-0`; fades in on `group-hover/slot` +
  `focus-visible`. Click routes through the existing
  `handleCardDropped(pos, null, null)` path — the same SQL
  path as a null-drop. Gated on `!locked` so started slots
  keep their lock glyph.

- **§114 Token hover tooltips.** New `src/components/ui/
  tooltip.tsx` (shadcn-style wrapper over `radix-ui`'s
  Tooltip) + a shared `TokenTooltipContent` body. Wrapped
  both the tray `TrayTokenPip` and the slot-card
  `AppliedTokenBadge` so hovering any token surface reveals
  the full name, bonus FP, and one-line rule from the
  existing `tokenRuleText()` helper.

## Consequences

**What got better:**

- Lineup moves are two taps now: click × on the starter,
  drag the new card in. Much faster than drag-out + drop-on-
  bench.
- Token meanings are self-explanatory — hover any pip and
  you get `Strikeout Game / +8 FP / If this pitcher records
  8+ strikeouts, +8 FP.`

**What's still open:**

- Touch devices fall back to no-tooltip UX (hover-only).
  Desktop-only launch, so we accept it; can add a
  long-press variant later.
- Remove button has no undo. Remove is already reversible
  by dragging the card back, but a toast with "undo" could
  save clicks. Deferred.

## Tricky bits

- **Tooltip token wiring.** The project had no Tooltip
  primitive. Building it over `radix-ui`'s `Tooltip` module
  (umbrella already installed) required a `TooltipProvider`
  wrapper — Radix expects one in the tree. Wrapped each
  `<Tooltip>` with its own provider inline so callers don't
  have to remember to add one at the page root. Default
  delay tuned to 400ms.
- **Remove-button placement vs. drag source.** The × sits
  on the outer `<section>` above the `slotDragRef` div so
  clicking it never starts a drag. `stopPropagation` on the
  click handler also prevents the card's detail-opener from
  firing.

## Alternatives considered

- **Always-visible × button.** Rejected — visible chrome on
  every filled slot reads as heavier UI than a lineup
  should need at rest. Hover-only keeps the slots clean.
- **CSS-only tooltip (same as the old `TokenBadge`
  implementation).** Rejected — the CSS-group-hover tooltip
  sits flush against the element, ignores viewport edges,
  and doesn't have focus/keyboard support. Radix's
  `Tooltip` handles portal + positioning + a11y correctly.
- **Confirm dialog for remove.** Rejected — drag-to-move
  is already lossless, and requiring a confirm on every
  lineup edit slows drafting unnecessarily.

## Links

- Commit: `795d41a8 feat(lineup): P37 one-click remove-
  from-slot + token hover tooltips`
- Polish spec: §113, §114
- Roadmap: `docs/roadmap-phase-37.md`
- Related: ADR-0036 (P36 shadcn-primitive token fix — same
  mistake avoided here).
