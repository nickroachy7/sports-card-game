# Draft Deck — Phase 39 Roadmap (v1.24 — Unified sidebar)

**Goal:** One sidebar layout used all day — no building vs
post-submit split, no Submit button, no lock countdown.
Persistent top section (contest header + adaptive
headline + roster) with tabs (Lineup Actions + Live Events)
below.

**Estimated effort:** ~0.6 day.

---

## Milestones

| ID    | Milestone                                          | Target    |
|-------|----------------------------------------------------|-----------|
| P39.1 | Rewrite AppSidebar unified structure               | 0.10 day  |
| P39.2 | SidebarHeadline adaptive block                     | 0.10 day  |
| P39.3 | RosterSection single persistent rows               | 0.10 day  |
| P39.4 | Tabs (Lineup Actions + Live Events)                | 0.15 day  |
| P39.5 | Drop Submit button + lock countdown                | 0.05 day  |
| P39.6 | Mount LiveEventsProvider unconditionally           | 0.05 day  |
| P39.7 | Verify / lint / build / deploy + ADR-0039          | 0.10 day  |

---

## Notes

- **P39.1**: `AppSidebar` loses the `BuildingContent` /
  `PostSubmitContent` branch entirely. One render tree for
  all states.
- **P39.2**: Three-way state derivation:
  - `anySlotLocked = slotFills.some(s => s.locked)`
  - `allFinal = slotFills.every(s => s.gameInfo?.status === "final")`
  - `state = allFinal ? "final" : anySlotLocked ? "live" : "drafting"`
- **P39.3**: Merge `RosterRow` + `BoxScoreRow` into one
  `RosterRow`. FP cell inspects `gameInfo.status` and
  `slot.liveFp` / `slot.finalFp` to pick color.
- **P39.4**: Use the existing `Tabs` primitive. Default tab
  = Lineup Actions. Tab labels don't need badges.
- **P39.5**: Straight deletion. Props plumbing (types.ts)
  cleans up too.
- **P39.6**: `LiveEventsProvider` + `CardContractEventsProvider`
  currently only mount in `isPostSubmit`. Change to always
  mount so the Events tab has a feed pre-lock. Subscribe is
  cheap when no games are live.
- Existing per-slot lock rules (spec §44) already work —
  no behavior change, just trust them.
- Backend entry-status flow unchanged. Auto-submit at
  contest-lock time still happens server-side; it's just
  not user-visible anymore.
