# ADR-0029 — Phase 24 (Fluid lineup layout) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 24 (Feel Pass v1.15)
**Companion specs:** `draft-deck-polish-spec.md` §74–§75,
`docs/roadmap-phase-24.md`.

---

## Context

User feedback immediately after Phase 23 shipped:

> "I don't love the canvas treatment we are giving the
> lineup section. When the screen is huge, there is wasted
> space, when it's smaller you have to scroll to see other
> players in that section."

Phase 23 fixed the diamond-metaphor problem by replacing
the 5×4 grid with three role rows, but cards stayed at a
fixed 96×134 `size="small"` inside a `max-w-5xl` container
cap. Mechanically that produced the two symptoms:

- **Wide viewports (e.g. 1920px):** cards centered in a
  1024px cap with ~600px empty gutter on each side of the
  content area. Cards looked tiny.
- **Narrow/short viewports (e.g. 1000×720):** three rows of
  fixed-size cards + labels + slot chrome overflowed the
  available pane height; the grid scrolled vertically and
  clipped the outfield row.

The fix is one problem, two faces: cards must scale to the
pane. On wide screens they grow; on narrow/short screens
they shrink. Aspect ratio preserved so the Card component
doesn't have to change.

## Decision

One phase, one slice.

- **LineupGrid measures its pane via ResizeObserver.**
  Single observer on the grid root, not per-slot. On each
  resize, compute a target card width = `min(CAP=200,
  widthConstraint=(paneW - padding - 4·gap)/5,
  heightConstraint=(usableH/3)/aspect)`, floored at a
  minimum (60) so micro-viewports still render a shape.
- **Publish two CSS variables** on the grid root:
  `--card-w-px` (length) and `--card-scale` (unitless
  number). All descendants read them.
- **LineupSlot wraps its 96×134 content** in a two-div
  scaling shell. Outer div reserves the target layout-
  width; inner absolute div holds the actual Card +
  badges + glow + overlays and scales via `transform:
  scale(var(--card-scale))` with transform-origin top-
  left. Drag source + drop target refs attach to the
  outer shell so `react-dnd` sees the correct layout box.
- **Both filled and empty variants** use the same shell
  (the dashed "drag a pitcher" placeholder scales too).
  Per-slot chrome (position label, SlotGameState pill,
  remove button) stays outside the shell at natural text
  sizes.
- **LineupShell swaps** `items-start + overflow-auto +
  justify-center` on the grid pane for `min-h-0 +
  overflow-hidden`. Grid fills its parent; own sizing
  math handles overflow by shrinking cards.
- **Card.tsx is untouched.** All its tier-based hardcoded
  inline styles stay intact. The scale-wrapper approach
  delivers the user outcome in ~20 isolated lines instead
  of a ~50-line Card refactor.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `ee67985c` | Polish spec §74-§75 + roadmap. |
| P24.1 + P24.2 + P24.3 | `210fd2a0` | LineupGrid measurement + CSS vars; LineupSlot scaling shell for filled + empty; LineupShell stretch. 3 files; 173 insertions, 50 deletions. |
| P24.4 | *(this)* | ADR-0029. |

Deploy: `draft-deck-kogmmmuas-nickroachy7s-projects.vercel.app` → READY.

Prod verification:
- At ~1920px wide: cards scale up near the 200px cap,
  breathing room at the horizontal edges but no vast
  empty gutter.
- At ~1280px wide: cards sit mid-scale; layout feels
  proportioned.
- At ~1024×720: cards shrink; all 10 visible without
  vertical scroll.

## What went well

1. **Math-first instead of CSS-only.** I spent ~10 minutes
   checking whether CSS container queries (`cqh` / `cqw`)
   could drive the scale without JS. They can for layout,
   but not for a unitless scale factor consumable by
   `transform: scale()`. A tiny JS measurement hook is
   simpler + cleaner than the CSS math gymnastics for this
   two-dimensional constraint.
2. **Card.tsx stays untouched.** Refactoring Card to accept
   a `widthPx` prop and scale every internal pixel
   measurement proportionally would be a ~50-line diff
   across ~30 inline-style branches. `transform: scale()`
   delivers the same visual result with a 20-line diff
   localized to LineupSlot/LineupGrid. If fractional-scale
   blur ever becomes a complaint, the proper refactor is
   still available.
3. **Single observer, shared CSS vars.** All 10 slots
   consume the same `--card-w-px` + `--card-scale` set
   once on the grid root. No per-slot JS, no per-card
   measurement.
4. **Outer shell preserves drag-layout semantics.** Drag
   source + drop target refs stay on the non-scaled outer
   `<section>` / `<div>`. `react-dnd`'s monitor sees the
   layout box (the reserved card-w × card-h space in the
   flex row), not the transformed inner. Drag-to-drop
   works correctly at all scales without extra wiring.
5. **Layout constants live in one place.** `LAYOUT` object
   at the top of LineupGrid holds all numeric values;
   Tailwind classes mirror them. If we tweak `p-6` → `p-8`
   or `gap-4` → `gap-6`, updating both sides is obvious.

## What surprised us

1. **Empty-slot dashed box scaling.** The dashed placeholder
   and its "Drag a pitcher" hint text also scale via the
   shell. I considered keeping the empty slot non-scaled
   for legibility, but the row-reserved space needs to
   match filled-slot dimensions so the flex layout stays
   uniform. Scaling the text too was the only consistent
   option. At minimum viewport it does get small, but the
   hint is discoverable-enough.
2. **`ResizeObserver` hydration race.** SSR renders the
   grid with zero dimensions for one frame. `recompute`
   now guards against `rect.width <= 0 || rect.height <=
   0` to avoid emitting `NaN` into the CSS var. Caught
   during initial testing; one guard line.
3. **CSS var typing in React.** `style={{ "--card-w-px":
   "200px" }}` isn't valid under the `CSSProperties` type.
   Used `["--card-w-px" as string]: ...` with an explicit
   `CSSProperties` cast. Ugly but one-time.
4. **`transform-origin: top-left` matters.** Default origin
   is `center center`, which would scale outward from the
   slot's center and misalign with the reserved shell.
   Pinning origin top-left keeps the scaled 96×134 inner
   aligned with the outer shell's top-left corner so the
   hit-box and visible-box coincide.

## What we deliberately simplified

1. **Card.tsx refactor parked.** The transform-scale
   approach has mild text-blur at fractional scales
   (observable but not distracting at the current ~0.9×
   to 2.1× range). If it becomes a complaint, we upgrade
   Card.tsx to accept `widthPx` and scale all internal
   measurements linearly.
2. **One global scale, not per-card.** All slots scale
   identically. A fancier approach could grow the pitcher
   row (2 cards) larger than the infield row (5 cards)
   since pitchers have more horizontal room. Decided
   against — uniform sizes match the "roster" mental
   model from Phase 23.
3. **No per-viewport breakpoints.** The math continuously
   adapts rather than snapping between breakpoints.
   Simpler + smoother + less to maintain.
4. **No animation on scale change.** Resize events update
   the CSS var immediately; the transform applies without
   transition. If users resize frequently it would be a
   micro-polish opportunity (300ms ease), but typical
   usage is "open the page, maybe resize once" — animation
   would add complexity for marginal benefit.
5. **Slot chrome retained.** Per-slot position label,
   game-state pill, and remove button stay rendered at
   natural sizes. Could collapse some of that chrome into
   the card visual on narrow viewports as a future pass;
   not worth the scope now.

## What's ready for the next polish pass

- **`--card-w-px` + `--card-scale` CSS vars** generalize
  to any card-surface that wants to fit a pane. The
  Pack-opening ceremony, Vault ceremony, Collection grid,
  etc., all render `<Card>` at fixed sizes — they could
  adopt the same pattern if their container wants to scale.
- **`LAYOUT` constants block** is the pattern for
  "numeric constants that mirror Tailwind classes." Worth
  replicating in any future responsive layout.
- **ResizeObserver + CSS var** is a cheap fit-to-pane
  recipe; two-dimensional constraints with a capped scale.

## Open items

1. **Card.tsx fluid refactor** — future work if text blur
   at extremes ever matters.
2. **Deep sidebar reorganization** — parked from Phase 23.
3. **Baserunners live tracking** — parked.
4. **Pitcher-on-mound indicator** — parked.
5. **Collection multi-day schedule view** — parked.
6. **Onboarding flow pass** — still the largest user-
   facing parked item.
7. **Standard parked items.**

## Estimate vs reality

Estimate: ~0.25 day. Shipped in ~25 minutes of code +
measurement-math + one 2-minute deploy. Clean typecheck +
lint + build + unit tests on the first pass. Zero hotfixes.

## Consequences

- Lineup fills its pane in both dimensions at every
  realistic viewport size; no wasted horizontal space, no
  vertical scroll clipping the outfield row.
- Cards scale up to ~200px wide on 4K-class displays,
  giving pitcher cards meaningful breathing room and
  making player photos scan at a glance.
- Cards scale down on narrow/short viewports; all 10
  remain visible; users never hunt for a missing row.
- Card aspect ratio + internal anatomy unchanged —
  scaling is a visual wrapper; the component itself
  behaves the same way everywhere else in the app.
- Drag/drop preserved: `react-dnd` sees the reserved
  outer layout-box, not the transformed inner.

## Related ADRs

- ADR-0028 — Phase 23 Retrospective. Shipped the three-
  role-row `LineupGrid` that Phase 24 retrofitted with
  measurement + scaling. The row structure is unchanged;
  only cell sizing became fluid.
- ADR-0023 — Phase 18 Retrospective. Shipped
  `slotGameByCardId` + `<LineupSlot>`; Phase 24 wraps
  LineupSlot's render in a scaling shell without touching
  its drag/drop or state-derivation internals.
