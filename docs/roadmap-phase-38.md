# Draft Deck — Phase 38 Roadmap (v1.23 — Drag feel + photo framing)

**Goal:** Four drag-feel polish items + one photo-framing fix.

**Estimated effort:** ~0.4 day.

---

## Milestones

| ID    | Milestone                                          | Target    |
|-------|----------------------------------------------------|-----------|
| P38.1 | Spring tuning (CardDragLayer + TokenDragLayer)     | 0.05 day  |
| P38.2 | Hide source fully on drag (BenchCard/Slot/Tray)    | 0.05 day  |
| P38.3 | Fast snap-back (150ms, no shake)                   | 0.05 day  |
| P38.4 | Drop-in settle bounce on LineupSlot                | 0.10 day  |
| P38.5 | Photo framing (URL size + object-position)         | 0.05 day  |
| P38.6 | Verify / lint / build / deploy + ADR-0038          | 0.10 day  |

---

## Notes

- P38.4 needs a `dropSettleKey: number` state that increments
  on each accepted drop. Motion keyframes rerun on key change.
- P38.5: leave `mlbamHeadshotUrl` signature as-is (still takes
  a size string) but bump the size → width mapping. All
  callers are transparent.
- `useReducedMotion()` already guards existing motion; keep
  it guarding the new drop-in bounce.
