# ADR-0028 — Phase 23 (Lineup layout + surface cleanup) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 23 (Feel Pass v1.14)
**Companion specs:** `draft-deck-polish-spec.md` §68–§73,
`docs/roadmap-phase-23.md`.

---

## Context

User feedback shortly after Phase 22 shipped:

> "The way the lineup cards are laid out right now just
> don't work. I wanted to do something with the cards on a
> real field or something but I just don't think it's
> working. Maybe we could do them in rows and ordered in a
> way that works?"

Plus four narrower fixes in the same feedback batch:

1. Event feed rows don't say which game they belong to.
2. Bench + Tokens horizontal scrollbars are ugly — replace
   with arrow buttons, hide the scrollbar.
3. Box score shows `—` for 0 FP even after the game goes
   live — show `0.0` for played-but-scored-nothing.
4. "Tonight's Slate" header eats a top bar; relocate into
   the sidebar as a pre-cleanup ahead of a larger sidebar
   reorg.

Estimate: ~0.5 day. Shipped in about an hour.

## Decision

Five slices, no migrations, pure UI + type extensions.

- **P23.1 — Three-role-row layout.** Replace the
  `DiamondGrid` 5×4 CSS-grid-with-position-overrides with
  three labeled rows. Row 1 = Rotation (SP1, SP2). Row 2
  = Infield (C, 1B, 2B, 3B, SS). Row 3 = Outfield (OF1,
  OF2, OF3). Row 1 + Row 3 center-justify against Row 2.
  Card size uniform across roles. LineupShell's `diamond`
  prop renamed `grid`.
- **P23.2 — Event feed matchup chip.** New
  `fetchGameMatchupsById` server helper. New
  `gameMatchupById: Record<string, string>` prop on
  `LineupViewProps`. `FeedEvent.gameMatchup` field
  preformatted as `"AWAY@HOME"`. `EventFeed` renders a
  compact pill next to the time label. game_event SELECT
  now includes `game_id` so Realtime INSERTs wire through.
- **P23.3 — HorizontalScroller primitive.** New
  `src/components/ui/horizontal-scroller.tsx`. Hides the
  scrollbar via `[scrollbar-width:none] +
  [&::-webkit-scrollbar]:hidden`; renders
  `<ChevronLeft>/<ChevronRight>` buttons at the edges;
  page-scrolls by the visible width on click; auto-
  disables at ends via `scroll` + `ResizeObserver`.
  `BenchDrawer` + `TokenTray` both wire into it.
- **P23.4 — Box score 0-for-played.** One-condition
  change: `showNumber = hasPlayerInSlot && gameStarted`
  where `gameStarted` is `status === "live" || status ===
  "final"`. Pre-game / off-day still shows `—`; played
  games with 0 FP show `0.0` (muted).
- **P23.5 — Contest header → sidebar.** Drop the
  `header` prop from `<LineupShell>`. New
  `<ContestHeaderCard>` at the top of `<LineupSidebar>`
  with the same contest name + status/countdown copy as
  the old top bar.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `62d2f6ba` | Polish spec §68–§73 + roadmap. |
| P23.1 + P23.2 + P23.4 + P23.5 | `a99a9d83` | Layout, matchup chip, box-score zeros, header relocation. 10 files; 329 insertions, 150 deletions. |
| P23.3 | `54300930` | HorizontalScroller + 2 wire-ups. 3 files; 166 insertions, 4 deletions. |
| P23.7 | *(this)* | ADR-0028. |

Prod verification after deploy:
- Lineup page renders three role rows; top bar gone;
  contest header in sidebar above the score block.
- Bench + tokens show arrow buttons, no horizontal
  scrollbar, disable-at-ends works.
- Event feed rows carry matchup chips when events have
  a game context; token events show no chip.

## What went well

1. **Four-slices-in-one-commit was the right call.** The
   four UI fixes all touched `lineup-view.tsx` /
   `LineupSidebar.tsx` / `LineupShell.tsx`. Splitting into
   four commits would have created file-overlap pain with
   minor value. One coherent commit, one scroller commit,
   done.
2. **Shared primitive at the start, not after.**
   `HorizontalScroller` has two consumers from day one
   (`BenchDrawer` + `TokenTray`). Skipped the usual "ship
   it once and refactor later" cycle.
3. **ResizeObserver on children makes the scroller
   self-correcting.** Bench filter changes shrink or grow
   the row; observing every child element means the
   arrow-disabled state stays in sync without manual
   refresh. Two lines of ObserverWiring, bulletproof.
4. **LiveEventsProvider extension was cheap.** Adding
   `gameMatchupById` as a prop + threading through three
   `projectRow` / `projectGameTransition` /
   `projectTokenTrigger` paths was 15 lines. The provider
   was already designed to accept static server-side data
   as props.
5. **Three-role-row reads as a roster.** The diamond was
   always fighting the user's left-to-right scan. Three
   labeled rows match the mental model, lose the field
   metaphor (which wasn't carrying weight), and give the
   pitcher row room to breathe.
6. **Box-score zero fix surfaced a latent bug.** The old
   `hasScored = fp !== 0 || fill.finalFp !== 0` check
   treated "game hasn't happened" and "game happened and
   player did nothing" identically. The `showNumber`
   rewrite disambiguates — and `fp === 0` during live play
   now has the correct meaning.

## What surprised us

1. **Hiding the scrollbar needed three separate CSS
   rules.** `scrollbar-width: none` (Firefox + modern),
   `-ms-overflow-style: none` (legacy IE / Edge), and
   `&::-webkit-scrollbar { display: none }` (Chrome +
   Safari). All three in one Tailwind arbitrary-selector
   chain works but the cross-browser coverage needs all
   three.
2. **`FeedEvent` had no `game_id`.** The previous code
   filtered to `contestGameIds` at subscription scope but
   never surfaced the game id on the event record. Adding
   it to the SELECT + the RawGameEvent type was a three-
   line change; the matchup lookup then composes
   trivially.
3. **`TokenTray` had an `opacity-50` class on the old
   wrapper for the locked state.** The `<HorizontalScroller>`
   wrap preserved the outer div but passed the opacity via
   `className`. Verified in the locked-final path.
4. **Reserved arrow-width matters.** Rendering the arrow
   buttons even when `!hasOverflow` (via `invisible` +
   `pointer-events-none`) keeps the inner row's width
   stable. Without reserving, the inner row would
   reflow by ~56px every time a filter toggle crossed the
   overflow threshold.

## What we deliberately simplified

1. **`ContestHeaderCard` is a band-aid.** A larger sidebar
   reorganization is coming; this commit moves the info
   with minimum chrome. Bigger reorg subsumes this block.
2. **Matchup chip has no hover / click.** Future work
   could open a per-game summary panel; for now it's
   display-only.
3. **Role row labels are muted.** Bench uses the same
   font-mono-uppercase-tracked-wider style; mirror for
   visual consistency without introducing a new style.
4. **No new migrations.** Entire phase is UI + types. The
   lineup query didn't need changes; `fetchGameMatchupsById`
   is a new helper but reads the same tables.
5. **No feed-chip click-to-filter.** Spec §69 parks it as
   future work. Chip is information-only.

## What's ready for the next polish pass

- **`<HorizontalScroller>`** is the standard carousel
  primitive. Any future row-of-things (pack history,
  milestone timeline, etc.) composes in cleanly.
- **`<ContestHeaderCard>` inside `<LineupSidebar>`**
  establishes the "first thing in the sidebar is contest
  identity" pattern. Larger reorg can swap the rest of
  the sidebar without touching this block.
- **`FeedEvent.gameMatchup`** opens the door for a
  per-game filter (spec §69 parked). Hover states,
  matchup-based grouping, expanded game summaries all
  compose off this field.
- **Three-role-row shape** could extend cleanly if we
  ever support alternate roster shapes (NL / AL, mid-
  season trades, etc.) — rows are independent data.

## Open items

1. **Deep sidebar reorganization** (parked, larger
   follow-on).
2. **Per-game filter on event feed** (parked, hooks off
   the new `gameMatchup` field).
3. **Collection multi-day schedule view** — parked.
4. **Onboarding** — still the largest user-facing parked
   item.
5. **Baserunners live tracking** — parked.
6. **Pitcher-on-mound indicator** — parked.
7. **Standard parked items.**

## Estimate vs reality

Estimate: ~0.5 day. Shipped in about an hour of code + one
~2-minute deploy. The phase's "only UI + types" shape
kept it fast; no migration pauses, no server round-trips
to debug. Zero follow-up fix commits (compared to Phase
22's two same-day hotfixes).

## Consequences

- Lineup page reads as a clean roster instead of a diamond
  — matches how users actually scan the starters.
- Every event-feed row carries enough context to know
  which game it's from; no more hunting.
- Bench + Tokens trays no longer show a browser scrollbar
  artifact; carousel arrows are discoverable + keyboard-
  focusable.
- Box score scores are honest numbers once play begins;
  pre-game dashes remain as "no data yet."
- Top bar is gone; the lineup grid starts at the top of
  the content area. Contest identity lives in the sidebar
  where the larger reorg can iterate.

## Related ADRs

- ADR-0023 — Phase 18 Retrospective. Shipped the
  `<LiveEventsProvider>` that Phase 23 extends with
  `gameMatchupById`.
- ADR-0026 — Phase 21 Retrospective. Polished the bench
  footer + priority sort; Phase 23's `<HorizontalScroller>`
  replaces the native scrollbar on the row the Phase 21
  work populated.
- ADR-0027 — Phase 22 Retrospective. Shipped the
  `fetchSlotGameByCardId` helper that Phase 23 extends
  with `fetchGameMatchupsById` (same module, new function).
