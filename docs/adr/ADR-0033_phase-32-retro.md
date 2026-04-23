# ADR-0033 — Phase 32 (Unified lineup + cards) Retrospective

**Status:** Accepted · **Date:** 2026-04-23
**Phase:** Phase 32 (v1.19)
**Companion specs:** `draft-deck-polish-spec.md` §94–§98,
`docs/roadmap-phase-32.md`.

---

## Context

User-proposed redesign: kill `/collection`. Put all cards in
one responsive grid below the lineup. Tokens above the grid.
Solve drag-and-drop for cards that scroll below the fold.

The proposal condensed two surfaces (lineup + collection)
into one, removed a whole page from the nav, and introduced
one real design challenge: HTML5 DnD doesn't auto-scroll the
parent container, so dragging a card from row 5 of the grid
up to a lineup slot at the top of the page requires solving
scroll-during-drag.

## Decision

Four coordinated changes shipped as one commit.

- **§94 CardsPanel** (replaces BenchDrawer + /collection).
  Responsive CSS grid, 2 cols narrow → 8 cols on 2K+. Shows
  every card (assigned + unassigned); assigned cards get an
  "IN LINEUP" pill overlay + 60% opacity. Rostered cards are
  still draggable — `cardToSlotPosition` map on props
  propagates to BenchCard which includes `fromPosition` in
  the drag item so drops route through `swap_lineup_slots`.
- **§95 LineupShell reorder.** `grid → tokens → cards` (was
  `grid → bench → tokens`). Tokens + cards both stack in
  the left column; the `<main>` element in `(app)/layout.tsx`
  is the scroll ancestor.
- **§96 useAutoScrollOnDrag hook.** Single top-level
  `useEffect`, listens to document `dragover`, checks pointer
  Y against an 80px edge zone, scrolls main at 14px/frame via
  `requestAnimationFrame`. Stops on drop/dragend. No third-
  party dependency.
- **§97 `/collection` deletion.** 3 files deleted + sidebar
  nav link removed. Card deep-links on `?card=id` still work
  under `/lineup` per Phase 30's modal pattern. BenchDrawer
  also deleted (its role was absorbed).

Filters on the grid: Hitters/Pitchers + Tier (Bronze / Silver
/ Gold / Diamond) + Game-state + Search. Counts update live
across other active filters.

## What shipped

| Slice | Delivers |
|---|---|
| Plan | Polish spec §94–§98 + roadmap (`481b25a1`). |
| P32.1–P32.5 | CardsPanel + autoscroll hook + shell reorder + /collection deletion + sidebar nav cleanup. 1 commit, ~400 lines added / ~350 deleted. |
| P32.6 | ADR-0033 (this). |

Deploy: `draft-deck-juoqflb9j-nickroachy7s-projects.vercel.app` → READY.

## What went well

1. **Survey caught the DnD challenge upfront.** The scout
   report explicitly flagged "HTML5Backend doesn't auto-scroll
   — you'll need a hook or library." That framed the interview
   question so the user could choose the auto-scroll path
   deliberately, rather than discovering the problem post-ship.
2. **Custom hook beats library.** `react-dnd-scrolling` would
   have worked but brings its own abstractions. ~50-line hook
   matches our single-container single-scroll-direction need.
   No new dependency; zero API surface exposed.
3. **`cardToSlotPosition` + BenchCard `fromPosition` prop** —
   the smallest change that makes rostered cards in the grid
   behave like cards in a slot for swap semantics. The drag
   item already supported `fromPosition`; we just route it
   through BenchCard now.
4. **Sort: unassigned first.** Small touch — the available
   pool visually leads, rostered cards sink to the bottom.
   Maintains the "what can I play" focus.
5. **Filter count bookkeeping.** Tier and game-state counts
   each ignore their own filter axis but honor the others.
   Matches the pattern from P22's bench chips; users can
   always see how many options exist in each bucket without
   collapsing to the current selection.

## What surprised us

1. **Biome flagged an `&&` I was going to write manually.**
   `scrollContainer && scrollContainer.isConnected` → `?.`
   The linter is doing the review; I just ran the autofix.
2. **`/collection/[cardId]/page.tsx` was a tiny redirect.**
   Survey called it legacy — it was. Deleted cleanly with
   zero callers.
3. **`grid-cols-*` cascade reads cleanly.** Tailwind's
   `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6
   xl:grid-cols-7 2xl:grid-cols-8` maps the 2→8 range across
   breakpoints without extra CSS.

## What we deliberately accepted

1. **No virtualization.** At collection_cap = 100, rendering
   all cards is cheap. Revisit if the cap grows or if
   frame-time regressions appear.
2. **No breadcrumb / "no cards" empty state polish.** The
   existing copy is functional; full empty-state sweep stays
   parked.
3. **`/collection` returns 404, no redirect.** Pre-launch
   surface with no external users; any internal bookmarks
   break and that's fine.
4. **`/collection/[cardId]` → 404 too.** Card deep-links now
   live on `/lineup?card=id` (Phase 30's modal URL param).
5. **BenchDrawer name retired in favor of CardsPanel.** The
   "bench" metaphor doesn't fit a full-collection grid.
6. **Baserunners + pitcher-on-mound (Phase 31 spec) remains
   parked.** Still spec'd, still unbuilt. Next candidate.

## What's ready for the next polish pass

- **`useAutoScrollOnDrag`** is generic — any future drag surface
  that extends below the fold benefits. Token tray drags, for
  example, already work with it.
- **`cardToSlotPosition` inverse map** as a pattern — any
  component downstream of `slotFills` that needs to know where
  a card is can use it directly instead of re-deriving.
- **Responsive-grid-at-max-cols shape** (`2xl:grid-cols-8`)
  is the default for any future grid-of-cards surface.

## Open items

1. **Baserunners + pitcher-on-mound** — Phase 31 spec, still
   the next candidate.
2. **Onboarding flow pass** — largest parked item for launch.
3. **Empty / error state sweep** — consistently parked.
4. **Cards grid virtualization** — not needed today.
5. **Mobile / tablet layout for the cards grid** — desktop-
   first v1 scope.
6. **Standard parked items.**

## Estimate vs reality

Estimate: ~1.5 days. Shipped in ~1 hour of code + spec/ADR
time. The scout's upfront survey of DnD infrastructure + the
user's clear answers on scoping questions ("auto-scroll, max
8 cols, tier filter, delete the page") eliminated most of
the uncertainty that would have slowed the build.

## Consequences

- Draft Deck now has one canonical page for managing your
  roster + browsing your collection. Context-switching
  between tabs is gone.
- The "IN LINEUP" marker + opacity + bubble-to-top sort
  keeps the lineup-building focus even when showing the full
  collection.
- Auto-scroll during drag removes the only usability regression
  the merge would have introduced.
- Nav is slimmer: Lineup / Shop / Vault / Milestones /
  Leaderboards (was Lineup / Collection / Shop / Vault /
  Milestones / Leaderboards).
- Baserunners is the next launch-path item. Onboarding
  remains the biggest pre-launch gap.

## Related ADRs

- ADR-0032 — Phase 30. Unified AppSidebar + CardDetailModal.
  P32 inherits the modal URL-param pattern and the
  AppSidebar shape (summary variant now goes away since
  there's no /collection, but the component structure stays).
- ADR-0026 — Phase 21. Shipped the BenchDrawer priority sort
  by game state. P32's CardsPanel inherits that sort logic
  and extends it with the "unassigned first" tiebreaker.
