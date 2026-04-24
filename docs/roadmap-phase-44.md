# Draft Deck — Phase 44 Roadmap (v1.29 — Pack reveal row redesign)

**Goal:** Retire the peel stack; reveal cards in a single
horizontal row at lineup slot size with any-order flipping
and inline dupe resolution (no overlay).

Core intent (user):
> The cards should be the same size in the pack pulling
> experience as they are in the lineup and cards section.
> Here's how it should look: All cards are stacked
> horizontally in the center and the user can flip over the
> cards one by one, it does not matter what order they go
> through.

**Estimated effort:** ~0.5 day.

---

## Milestones

| ID    | Milestone                                              | Target    |
|-------|--------------------------------------------------------|-----------|
| P44.1 | `PackCardFlip` accepts `size` prop (lineup default)    | 0.05 day  |
| P44.2 | `StarPullBurst` scales to match card size              | 0.03 day  |
| P44.3 | Drop `StackZone` + `peelIndex`, one flip row           | 0.10 day  |
| P44.4 | Face-down cards render clickable, any-order flip       | 0.05 day  |
| P44.5 | Inline dupe swap in row (compact PackDupePanel variant)| 0.12 day  |
| P44.6 | Progress header subtitle copy tweaks                   | 0.03 day  |
| P44.7 | Verify / lint / build / deploy + ADR-0044              | 0.07 day  |

---

## Notes

- **P44.1** — `PackCardFlip` is the animated flip primitive.
  Add a `size: CardSize` prop that passes through to the inner
  `Card` component. Existing callers (the old PackOpenerModal
  flow that's been retired) don't need updates — only the
  panel will set the new prop.
- **P44.3** — The current panel has two layout zones: a
  `StackZone` at top (face-down z-stacked cards) and a
  `RevealedRow` below (flipped cards + Sell/Vault buttons).
  Phase 44 merges both into one row. Each slot's state is
  derived from `flipped[i]` (face-down vs face-up). Dupe
  expansion handled by giving the slot a wider flex-basis
  when `activeDupeIdx === i`.
- **P44.4** — Face-down cards become the click target directly
  (replacing the top-only peel click). On flip-complete, the
  slot transitions from `faceUp={false}` → `faceUp={true}`
  in-place.
- **P44.5** — `PackDupePanel` today is a wide side-by-side
  comparison built for the modal. Need a compact variant: two
  lineup-size cards stacked vertically or side-by-side, small
  Keep New / Keep Existing buttons. Compact variant fits in
  the expanded slot footprint (~252px wide).
- **P44.6** — Progress header subtitle changes:
  - From: `Tap the top card to peel · N left`
  - To:   `Tap any card to reveal · N of M left`
  - `Resolve the dupe to continue` stays.

---

## Expected layout (after P44)

5-pack:
```
            [🂠]  [🂠]  [🂠]  [🂠]  [🂠]
        ←  tap any card to reveal  →
```

Mid-reveal (3 flipped, 2 face-down, 1 dupe in comparison):
```
  [Card A]  [🂠]  [NEW vs EXIST · Keep ·]  [🂠]  [Card E]
           tap · resolve dupe · tap · flipped
```

10-pack wraps to 5×2:
```
  [🂠] [🂠] [🂠] [🂠] [🂠]
  [🂠] [🂠] [🂠] [🂠] [🂠]
```

---

## Files touched

- `src/components/pack/PackRevealPanel.tsx` — main rewrite
- `src/components/pack/PackCardFlip.tsx` — `size` prop
- `src/components/pack/PackDupePanel.tsx` — compact variant
- `src/components/pack/StarPullBurst.tsx` — size-aware scaling

---

## What stays the same

- `handleBatchOpened` partitioning in LineupView
- Sequential multi-pack flow (pack-level order locked)
- Progress header segmented bar
- Done / Next Pack footer button + gating (all flipped + all
  dupes resolved)
- LineupShell `mainOverride` prop + cross-fade transition
- Sidebar staying visible during reveal
