# Draft Deck — Phase 42 Roadmap (v1.27 — Sidebar redesign)

**Goal:** Compress the right sidebar's top-fixed zone so Actions /
Events / Packs tabs get more vertical real estate. Promote Packs
from FAB+modal to a first-class tab.

Core intent (user):
> At the top of the right sidebar we could have the game slate in
> one line with the date, directly below that we could have the
> Roster / Box Score of the lineup set, and then below that we
> could have the project / final score section... Below that
> section, we should keep the tabs and have actions, events feed,
> and then Packs instead of the packs button we currently have.

**Estimated effort:** ~0.5 day.

---

## Milestones

| ID    | Milestone                                             | Target    |
|-------|-------------------------------------------------------|-----------|
| P42.1 | `gamesInSlate` prop threaded from page → sidebar      | 0.03 day  |
| P42.2 | `SlateLine` replaces `ContestHeader`                  | 0.05 day  |
| P42.3 | Compact two-line `SidebarHeadline`                    | 0.08 day  |
| P42.4 | Tighten `RosterSection` row padding                   | 0.03 day  |
| P42.5 | New `PacksTab` component — inline buy UI              | 0.15 day  |
| P42.6 | Remove `BuyPacksFab` + `BuyPacksModal` + wiring       | 0.05 day  |
| P42.7 | Daily-ready pulse indicator moves to Packs tab trigger| 0.04 day  |
| P42.8 | Verify / lint / build / deploy + ADR-0042             | 0.07 day  |

---

## Notes

- **P42.2** — uses `current_slate_date()` already available via the
  `contest` row's derived date. No new SQL. Weekday abbrev via
  `Intl.DateTimeFormat(undefined, { weekday: 'short', ... })`.
- **P42.3** — keeps `SidebarHeadline`'s state derivation (Drafting
  / Live / Final). Only visual shrink: drop the 3xl primary, drop
  the secondary column, merge to one line with parenthetical.
- **P42.5** — port the daily-pack card + × 1/5/10 toggle + buy
  button out of `BuyPacksModal` into a tab-body component. Tab
  width is ~304px so the existing modal layout mostly fits
  unchanged; quantity toggles may need a tighter compact variant.
- **P42.6** — lineup-view.tsx currently has three pack-related
  imports: `BuyPacksFab`, `BuyPacksModal`, `PackOpenerModal`. Only
  the first two delete; `PackOpenerModal` stays for Phase 42 and
  goes in Phase 43.
- **P42.7** — tab trigger gets a gold dot in its top-right corner
  when `dailyReady === true`, dismissed once claimed. Mirrors the
  existing FAB pulse.

---

## Target sidebar layout (after P42)

```
┌───────────────────────────────────────┐
│ FRI, APR 24 · 12 GAMES              │  ← SlateLine  (§140)
├───────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ DRAFTING · 3 / 10 filled        │ │  ← Compact    (§141)
│ │ 0.0 projected                    │ │     score
│ └─────────────────────────────────┘ │
├───────────────────────────────────────┤
│ C    Brady House     0.0             │
│ 1B   —                                 │   RosterSection
│ 2B   Jose Altuve     0.0             │   (§142)
│ ...  (10 rows, tighter)                │
├───────────────────────────────────────┤
│ [ Actions ] [ Events ] [ Packs ● ]     │  ← Tabs      (§143)
│                                         │
│  (active tab content here)              │
│                                         │
└───────────────────────────────────────┘
```

---

## Files touched

- `src/components/layout/AppSidebar.tsx` — SlateLine, compact
  SidebarHeadline, tightened RosterSection, 3-tab SidebarTabs.
- `src/components/pack/PacksTab.tsx` — NEW.
- `src/components/pack/BuyPacksFab.tsx` — DELETE.
- `src/components/pack/BuyPacksModal.tsx` — DELETE.
- `src/app/(app)/lineup/lineup-view.tsx` — drop FAB + modal
  imports + render sites; hand `gamesInSlate` + pack-buy props
  to `AppSidebar`.
- `src/app/(app)/lineup/page.tsx` — add `gamesInSlate` to the
  LineupViewProps payload (derived from contest row).
