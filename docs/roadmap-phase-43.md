# Draft Deck — Phase 43 Roadmap (v1.28 — In-place pack reveal)

**Goal:** Stop the modal-over-app layer. Pack reveal takes over
the main content area, sequential per-pack flow with `Next pack`
gate between packs.

Core intent (user):
> What if we have the lineup get hidden and the pack pulling
> experience gets put in that section. Additionally, I want to add
> that if the user bought multiple packs, after revealing all the
> cards from one pack, they could have a next pack button in that
> section to easily get them to the next pack.

**Estimated effort:** ~0.8 day.

---

## Milestones

| ID    | Milestone                                             | Target    |
|-------|-------------------------------------------------------|-----------|
| P43.1 | Partition `openPacksBatch` result into per-pack array | 0.05 day  |
| P43.2 | `revealActive` state in LineupView drives main content| 0.05 day  |
| P43.3 | New `PackRevealPanel` — ports peel/flip/dupe from modal| 0.20 day |
| P43.4 | Sequential `currentPackIndex` + advance handler       | 0.08 day  |
| P43.5 | Progress header with segmented progress bar           | 0.08 day  |
| P43.6 | Footer swap: `Next pack` vs `Done` based on index     | 0.05 day  |
| P43.7 | Remove `PackOpenerModal` entirely                     | 0.05 day  |
| P43.8 | 150ms cross-fade between lineup content and reveal    | 0.05 day  |
| P43.9 | Verify / lint / build / deploy + ADR-0043             | 0.10 day  |

---

## Notes

- **P43.1** — today `LineupView` flattens `batch.openings[]` into a
  single synthetic `OpenPackResult` for the modal. The panel wants
  the opposite: an array of per-pack payloads. Partition logic
  lives in `LineupView` so the panel stays simple.
- **P43.3** — `PackRevealPanel.tsx` is mostly a lift-and-shift of
  `PackOpenerModal`'s body (peel stack, revealed row,
  per-card actions, dupe panel). The `<Dialog>` wrapper drops;
  layout becomes a full-height flex column that sits inside the
  lineup page's main content area.
- **P43.4** — per-pack reset: `peelIndex`, `flipped[]`,
  `resolution[]`, `perCardAction[]` all reset to per-pack-fresh
  state when `currentPackIndex` advances. No carryover view of
  previously-opened packs on screen.
- **P43.5** — progress bar uses segmented fill (one segment per
  pack). Active segment pulses with `--tier-gold`; completed
  segments solid `--tier-gold`; pending segments muted
  `--border`. Segment count = total packs.
- **P43.6** — `Next pack` button enabled state mirrors today's
  `canComplete` derivation (all cards flipped + all dupes
  resolved); when on final pack, same button renders `Done ·
  back to lineup` copy + triggers `revealActive = false`.
- **P43.7** — `PackOpenerModal.tsx` deletes once `PackRevealPanel`
  is feature-equivalent. Any shared subcomponents
  (`PackCardFlip`, `PackDupePanel`, `StarPullBurst`) stay and get
  reused by the panel.
- **P43.8** — cross-fade uses `motion/react` opacity transition.
  Duration 150ms. No vertical slide, no backdrop (per §147).

---

## Target reveal flow (multi-pack ×5)

```
[Buy packs tab] → click "Buy 5 packs"
  ↓ openPacksBatch resolves
[LineupView] setRevealActive(true); partition openings into packs[0..4]
  ↓ 150ms fade
[Main content area] <PackRevealPanel packs={packs} currentPackIndex={0} />
  ↓ user peels pack 1, resolves any dupes
[Footer] "Next pack (2 of 5)" unlocks
  ↓ click
[Panel] currentPackIndex++, peel/flip state resets, pack 2 loads
  ...
[Footer on pack 5] "Done · back to lineup" unlocks
  ↓ click
[LineupView] setRevealActive(false)
  ↓ 150ms fade
[Main content area] diamond + cards grid return
```

---

## Files touched

- `src/components/pack/PackRevealPanel.tsx` — NEW.
- `src/components/pack/PackOpenerModal.tsx` — DELETE at end of phase.
- `src/app/(app)/lineup/lineup-view.tsx` — `revealActive` state,
  partitioning logic, conditional render of main content.
- `src/app/(app)/lineup/LineupMainContent.tsx` (or inline in
  `lineup-view.tsx` if not already extracted) — swap between
  `<LineupDiamond /> + <CardsPanel />` and `<PackRevealPanel />`.

---

## Dependencies

- Phase 42 (sidebar redesign) — must land first. Phase 43 assumes
  the Packs tab is the entry point for buys; retiring the FAB /
  modal before building the in-place panel avoids a transient
  state where both entry points exist.
