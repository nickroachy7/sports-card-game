# ADR-0035 — Phase 35 (Pre-live sidebar + multi-select + scrollbars + detail cleanup) Retrospective

**Status:** Accepted · **Date:** 2026-04-23
**Phase:** Phase 35 (v1.20)
**Companion specs:** `draft-deck-polish-spec.md` §103–§107,
`docs/roadmap-phase-35.md`.

---

## Context

Four user-flagged issues landed in one phase after looking at
a screenshot of the lineup page during building state:

1. Building-state sidebar didn't mirror the live-state layout.
   The user wanted to watch the roster fill in as they dragged
   cards into slots — parity with the live-state BoxScore.
2. No bulk card actions. Users have 30+ cards and need to
   quick-sell or vault batches, not click-click-click through
   modal confirmations.
3. Scrollbars on the lineup page still took visible space
   after Phase 34's auto-fade — the fade briefly reserved
   width during the transition.
4. Card detail panel had a duplicate "Add to vault" button
   (once in Actions, once in "Lineup Actions"). Extend
   Contract didn't look like a button. Vault explainer was
   five lines of always-visible text.

All four were tracked into a single phase with a single
commit.

## Decision

- **§103 Pre-live sidebar three-block layout.** Building
  state now renders `DraftingHeadline` + `RosterSection` +
  `SubmitSection` in the same spatial positions as post-
  submit's `ScoreHeadline` + `BoxScoreSection` + `EventFeed`.
  Sidebar doesn't reflow on submit.
- **§104 Multi-select on cards grid.** Select chip in the
  filter row enters select mode; clicks toggle selection
  (drag disabled). Checkmark badge + gold ring on selected
  cards. New `SelectionPanel` swaps into the sidebar with
  count, totals, list, and bulk actions (Quick-sell, Vault,
  Clear). Esc exits.
- **§105 Invisible scrollbars scoped to lineup.** New
  `data-scroll-surface="lineup"` attribute on LineupShell;
  globals.css overrides P34 defaults inside that scope to
  `scrollbar-width: none` + `display: none` on the webkit
  pseudo-element. P34 `useScrollFade` hook still exists for
  other surfaces.
- **§106 Card detail cleanup.** Killed the Lineup Actions
  footer block in CardDetailPanel. Remove-from-slot folded
  into CardDetailView's Actions section via a new
  `lineupContext` prop. Extend Contract flipped from
  `variant="default"` → `"outline"` for equal weight with
  the other two buttons. Vault explainer collapsed into a
  `<details>` disclosure with a `(?)` summary icon.

Bulk server actions (`quickSellCards` + `vaultCardsMidseason`)
loop the existing per-card SQL fns server-side rather than
adding a new migration. Partial failures report per-card; a
`VAULT_CAP_FULL` mid-batch still commits the successful rows.

## Consequences

**What got better:**

- Sidebar is useful in building state. Watching the roster
  fill in as you drag gives the same satisfaction as
  watching live stats tick up.
- Bulk actions: selecting 10 zero-FP rookies at season start
  and quick-selling them in one flow is now 3 clicks
  (Select → click cards → Quick-sell) instead of 30.
- Zero scrollbar chrome on the lineup page. The cards grid
  feels like a single continuous canvas.
- Card detail panel is ~100px shorter and has no dupes.

**What's still open:**

- Projected FP in `DraftingHeadline` uses tier baselines for
  un-played cards — fine for v1, but a real projection pass
  would feel more trustworthy.
- Bulk server actions loop synchronously; at 100-card
  batches this could take a second. Acceptable for now.
- No select-all / filter-based bulk select shortcuts.
- Building-state sidebar is mostly-read (except drag
  targets) — didn't gain drag-from-roster support, which
  the user hasn't asked for.

## Tricky bits

- **`useOptimistic` + new Roster block.** The roster rows
  have to update optimistically when a card is dragged into
  a slot; `slotFills` already flowed through LineupView's
  `useOptimistic` overlay, so passing it down to
  `RosterSection` just worked.
- **Checkmark badge layering.** The "IN LINEUP" pill lives
  at `z-10`; the checkmark sits at `z-20` so it's visible
  even on rostered cards. Token badge (if present) hides
  in select mode — its click target would conflict.
- **Vault help disclosure.** Tried a `<Popover>` first (no
  primitive exists in the UI folder), then a local
  useState-driven panel (clunky with outside-click
  handling), then settled on native `<details>/<summary>`.
  Zero deps, keyboard accessible, escape-key works,
  anchored via absolute positioning.
- **Scoped CSS override.** P34's `[data-scroll]` rules
  still apply globally; this phase needed to NOT apply
  them on the lineup surface specifically. `data-scroll-
  surface="lineup"` on the shell + descendant-selector
  overrides keeps the general default intact for other
  surfaces.

## Alternatives considered

- **Transaction-wrapped bulk SQL function.** Would guarantee
  atomicity (all-or-nothing). Rejected for v1 because each
  card quick-sell / vault is independent of the others and
  partial success has clearer UX than "none of your 10
  cards got sold because 1 had a token applied." Can
  migrate later if needed.
- **Draft log in the third block instead of Submit.** Too
  novel — the Submit button is the user's primary action
  in building state, and it was already at the bottom.
  Moved it cleaner was the right call.
- **Select mode as a `?mode=select` URL param.** Would
  survive reloads. Rejected — non-persistent selection is
  the right default (intent lives in the moment), and the
  URL was already carrying `?card=id`.

## Links

- Commit: `e0c407ea feat(lineup): P35 pre-live sidebar +
  multi-select + invisible scrollbars + detail cleanup`
- Polish spec: §103, §104, §105, §106
- Roadmap: `docs/roadmap-phase-35.md`
- Related: ADR-0034 (Phase 34 sidebar redesign that set up
  the three-block post-submit layout this phase mirrors).
