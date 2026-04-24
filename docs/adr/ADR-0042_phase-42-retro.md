# ADR-0042 — Phase 42 (Right sidebar redesign) Retrospective

**Status:** Accepted · **Date:** 2026-04-24
**Phase:** Phase 42 (v1.27)
**Companion specs:** `draft-deck-polish-spec.md` §140–§146,
`docs/roadmap-phase-42.md`.

---

## Context

The right sidebar's top-fixed zone ate ~240px before the tabs
started: a contest-header card with a redundant "Slots lock at
game time" subtitle, a 3xl-font Drafting/Live/Final score block,
then the 10-row roster. The score block read big but pushed
Actions + Events far below the fold, and the contest name was
duplicated by the nav (§50 guarantees one active contest per
user per slate).

Pack buying lived in a separate layer entirely: a bottom-right
FAB opened `BuyPacksModal`, which sat over the app with a
backdrop, with its own decision surface (daily pack + ×1/5/10
standard quantity + buy button). Worked, but the FAB floated on
top of scroll content and the modal competed with the reveal
modal for "thing that covers your lineup" visual real estate.

## Decision

Compress the top zone to three tight rows and promote Packs from
floating action to a first-class sidebar tab.

### Top zone (all visible, never changes based on state)

- **§140 SlateLine** — replaces ContestHeader. Single-line:
  `FRI, APR 24 · 12 GAMES`. Mono, 11 px, uppercase tracking.
  Server formats the date in ET (`Intl.DateTimeFormat` with
  `timeZone: "America/New_York"`) so there's no client drift.
  Count derives from `contest.included_game_ids.length`, already
  on the props bag — no new SQL.
- **§141 Compact score** — two-line block, half the height of
  the prior 3xl treatment. Keeps the outlined `--surface-2`
  frame; inlines the primary number with its unit label
  (`47.2 LIVE`) and the secondary as a parenthetical
  (`(proj 52.1)`). Retains the state derivation (Drafting / Live
  / Final with anySlotLocked + allFinal).
- **§142 Tightened roster** — dropped the "ROSTER" header
  (redundant), switched from `gap-0.5` to `divide-y` separators
  at 50% border-color for consistent rhythm. Per-row `py-0.5`
  confirms the vertical padding is intentional. 10 rows, same
  cells (position / name / warning pill / game-state chip / FP
  cell + ✓/✗ glyph).

### Tabs (variable content)

- **§143 Packs tab** — new third tab joins Actions + Events.
  Tab trigger has a gold pulse dot in the top-right when
  `dailyPackReady` — same visual affordance as the retired FAB.
  Tab body is the full buy UI: coin balance chip, daily pack
  card with claim/countdown state, ×1/5/10 standard pack
  selector, single buy button.
- `PacksTab.tsx` is a lift-and-adapt of the retired
  `BuyPacksModal` body (minus the `<Dialog>` wrapper). Compacted
  for ~304px sidebar width — section padding `p-2.5` (down from
  `p-3`), button size `sm`, card copy tightened.

### §144 Deletions

- `BuyPacksFab.tsx` deleted.
- `BuyPacksModal.tsx` deleted.
- `<BuyPacksFab>` + `<BuyPacksModal>` render sites removed from
  `lineup-view.tsx`. The `buyOpen` state and its setter removed.
- `props.contestName` dropped from `LineupViewProps` (no
  consumer post-P42).

### §145 Server-side

- `page.tsx` formats `slateDate` via `Intl.DateTimeFormat` with
  ET timezone, derived from `contest.lineup_locks_at`. Passed
  down as a new `slateDate: string` prop.
- `contestGameIds` was already on the props bag; sidebar
  derives `gamesInSlate = contestGameIds.length` inline.
- No new SQL, no new migration.

## Consequences

**What got better:**

- Top-fixed zone shrank from ~240px to ~140px. Roughly 100
  additional vertical pixels available for tabs content — more
  events visible before scroll on the Events tab; the whole
  Packs tab fits in a single viewport without scroll.
- Score block reads as "status bar" rather than "hero number"
  — appropriate for its role as a live indicator, not the main
  event.
- Pack buying is discoverable inline rather than as a floating
  island. Coin balance sits right above the buy buttons in the
  same visual frame, which was separated in the FAB → modal
  flow.
- Sidebar has a consistent three-tab grammar (Actions / Events
  / Packs) — Packs is no longer a visual exception.

**What's still open:**

- PackOpenerModal still renders as a dialog over the app. Phase
  43 swaps it for an in-place panel.
- Daily-ready pulse is a small 6px dot on the tab trigger; the
  FAB's dot was bigger (10px) and more visible. Could
  re-evaluate after user feedback.
- The "Pack odds in economy config" footer in PacksTab is a
  placeholder — possibly link to a future odds-explainer page.
- No pack history / recent pulls surface. Spec §143 out of scope.

## Tricky bits

- Sidebar layout is `flex-col` with `mt-auto flex-1` on the
  Tabs so tabs push to fill remaining vertical space. With the
  new compact headline + tightened roster, the tabs' usable
  height varies more by state — needed to verify the Packs tab
  doesn't overflow on narrow screens. Ended up with
  `overflow-y-auto` on the packs TabsContent for safety.
- `Intl.DateTimeFormat` timezone work happens server-side in
  `page.tsx`. Node supports the `America/New_York` timezone
  natively, so no extra dep. Client never sees the raw
  timestamp for the slate date.
- `DetailSidebar` wraps `AppSidebar` in two other paths
  (selectMode + card-detail), but neither renders AppSidebar
  directly — just peer sidebars. So the prop surface change is
  isolated to one render site in `lineup-view.tsx`.
- Dropped `contestName` from `LineupViewProps` + `page.tsx`
  call — found no other consumer via grep. Previously it fed
  the ContestHeader.

## Alternatives considered

- **Keep `Roster` header but shrink to 9px.** Rejected — the
  role is self-describing from the rows themselves. Dropping
  the label saved ~18px vertical without loss of clarity.
- **Lightweight Packs tab (button that still opens the old
  modal).** Rejected in interview round 1 — the user picked
  the full inline buy UI. The decision surface is small enough
  to fit without cramming.
- **Merge score block into the slate line.** Rejected — the
  score block still needs a distinct affordance (state changes
  visibly matter; user sees it transition Drafting → Live →
  Final throughout the day). Merging would muddy that.
- **Preserve `contestName` on the props bag as a forward-
  compatibility cushion.** Rejected — YAGNI; Phase 50's season
  rework may reintroduce named contests, and re-adding a prop
  is a 2-line change. No reason to keep dead data.

## Links

- Commit: (forthcoming) `feat(sidebar): P42 compact top zone + Packs tab`
- Polish spec: §140, §141, §142, §143, §144, §145, §146
- Roadmap: `docs/roadmap-phase-42.md`
- Next: ADR-0043 (Phase 43 in-place pack reveal) — depends on
  the FAB + modal deletion shipped here.
