# Draft Deck — Phase 40 Roadmap (v1.25 — Token trigger indicators)

**Goal:** Surface pending / hit / missed state for applied tokens
in three places: the lineup card's corner badge, the sidebar
roster row, and the Events tab.

Prereqs already landed:
- Migration 0043 removed the entry.status gate on scoring, so
  trigger evaluation actually runs now.

**Estimated effort:** ~0.5 day.

---

## Milestones

| ID    | Milestone                                              | Target    |
|-------|--------------------------------------------------------|-----------|
| P40.1 | Migration 0044 — mark misses at entry finalize         | 0.05 day  |
| P40.2 | Plumb `triggered` through `appliedToken` shape         | 0.10 day  |
| P40.3 | AppliedTokenBadge pending/hit/missed corner chip       | 0.15 day  |
| P40.4 | Roster row triggered glyph (AppSidebar)                | 0.10 day  |
| P40.5 | Event feed trigger row styling                         | 0.10 day  |
| P40.6 | Verify / lint / build / deploy + ADR-0040              | 0.10 day  |

---

## Notes

- **P40.2**: `tokenApplications` prop on LineupViewProps already
  comes from the DB with `triggered: boolean | null`. The
  client-side slot `appliedToken` shape strips it today — add
  it in. `tokenApps` useMemo + `slotFills` derivation cascade.
- **P40.3**: small 14px circle with Lucide `Check` / `X` icon
  in top-right of the badge, similar to the P37 X affordance
  for remove. Missed state also dims the whole badge to 50%.
- **P40.4**: tiny glyph after the FP cell in `RosterRow`.
  Simple colored character, not an icon.
- **P40.5**: requires wiring up token-trigger events through
  `LiveEventsProvider`. If not already streamed, skip for v1
  and note as follow-up.
