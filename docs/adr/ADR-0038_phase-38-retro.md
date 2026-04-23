# ADR-0038 — Phase 38 (Drag feel + photo framing) Retrospective

**Status:** Accepted · **Date:** 2026-04-23
**Phase:** Phase 38 (v1.23)
**Companion specs:** `draft-deck-polish-spec.md` §116–§121,
`docs/roadmap-phase-38.md`.

---

## Context

Four drag-feel asks + one photo cutoff fix.

1. Cursor-follow lag was noticeable on the motion ghost.
2. Source cards dimmed to 40% opacity while being dragged —
   user wanted them fully gone, matching "the card is in
   your hand."
3. Invalid drops used a 0.55s shake that felt slow.
4. Valid drops appeared statically — no "card placed"
   feedback moment.
5. Player photos were clipping the chin on some headshots
   because `object-cover` + default `object-position:
   center` cropped top and bottom equally, and the photo
   area aspect ratio is shorter than MLBAM's portrait
   source.

## Decision

- **§116 Spring tuning.** `CardDragLayer` + `TokenDragLayer`
  bumped from `{ stiffness: 400, damping: 30, mass: 1 }` →
  `{ 700, 34, 0.7 }`. Tighter follow, less overshoot.
  Velocity-based card rotation coefficient bumped 0.003 →
  0.004 so the tilt responds on fast drags; still capped
  ±3°.

- **§117 Source hides fully on pickup.** `BenchCard` +
  `LineupSlot` (filled-slot drag source) + `TrayTokenPip`
  all switch `opacity-40` (or nothing, in the tray's case)
  → `opacity-0 pointer-events-none` while `isDragging`.

- **§118 Fast snap-back.** Both `BounceBack` components
  drop the 0.55s 6-keyframe shake for a single 150ms
  easeOut tween, 60ms fade tail.

- **§119 Drop-in settle bounce.** `LineupSlot` holds a
  `dropSettleKey` counter that increments on every
  accepted card or token drop. `useAnimate` runs a scale
  pulse (0.92 → 1.03 → 1 over 180ms) on a `motion.div`
  wrapping the Card. Reduced-motion safe.

- **§120 Photo framing.** `mlbamHeadshotUrl` bumps source
  width to 240px (small/medium) / 360px (large). `CardPhoto`
  adds `object-position: center 25%` so the crop window
  sits higher in the source image.

## Consequences

**What got better:**

- Drag feels more responsive — the ghost sits under the
  cursor instead of lagging behind.
- Picking up a card is visually unambiguous — the source
  vanishes, the ghost is the only copy. Matches the
  physical metaphor.
- Invalid drops return in under a quarter second — feels
  snappy.
- Successful drops have a small weighty punctuation beat.
- Player chins stay in frame.

**What's still open:**

- Photo crop is a single global value (`center 25%`).
  Some MLBAM shots are tighter or wider than others — a
  per-photo position override would be the next-level fix
  but needs manual tuning per player.
- Drop-in bounce fires only on LineupSlot. If a vault-
  ceremony surface ever wants the same feel, the pattern
  is portable (useAnimate + scope).
- No haptic / sound on drop. Desktop-only launch; phase
  punted.

## Tricky bits

- **`useAnimate` scope vs. react-dnd drag ref.** First pass
  tried to stack both on the same element via a callback
  ref that wrote `settleScope.current = el`. Didn't
  compile — scope's `.current` is read-only. Restructured
  to wrap the Card in a dedicated `motion.div` with
  `ref={settleScope}` and kept the drag ref on the parent
  div. Clean separation of concerns; no ref-merging gym.
- **`dropSettleKey` starts at 0.** The `useEffect` guards
  against that initial value so the first mount doesn't
  animate; only transitions caused by a real drop fire
  the pulse.

## Alternatives considered

- **Keep the side-to-side shake, just shorten it.**
  Rejected — the shake read as "jitter" more than "bounce
  back" at shortened durations. Straight tween + fade is
  cleaner.
- **`object-contain` for photos.** Would show the full
  headshot with letterboxing. Rejected — cards look best
  with a filled photo panel; the 25% offset preserves the
  fill while favoring faces over head-top whitespace.
- **Per-card `object-position` overrides.** Deferred.
  `center 25%` is good enough across the sample; case-by-
  case overrides need data.

## Links

- Commit: `0246cd82 feat(drag): P38 drag feel + photo
  framing polish`
- Polish spec: §116, §117, §118, §119, §120
- Roadmap: `docs/roadmap-phase-38.md`
- Related: ADR-0037 (P37 polish — same kind of feel-focused
  pass).
