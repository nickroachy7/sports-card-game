# ADR-0034 — Phase 34 (Sidebar redesign + subtle scrollbars) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 34 (v1.19.2)
**Companion specs:** `draft-deck-polish-spec.md` §100–§101,
`docs/roadmap-phase-34.md`.

---

## Context

After Phase 33 landed (sidebar-swap card detail + independent
scroll containers), two issues were immediately visible:

1. The sidebar had accumulated density — contest header +
   live score + status chip + team summary + box score + event
   feed + submit controls all stacked on top of each other,
   with no clear visual hierarchy. User flagged it directly:
   "that right side bar is kind of a mess."
2. The sidebar-swap card detail had no Back button. Once you
   clicked a card, the only way to dismiss detail was to click
   a different card or navigate away.
3. Scrollbars on both columns sat visible whether or not you
   were scrolling, adding persistent visual noise.

The user-run interview surfaced four concrete fixes: cut the
redundant team summary, merge score+status into one headline,
add a Back button at the top of the detail panel, and make
scrollbars behave like macOS native overlay bars (hidden
until you scroll).

## Decision

Three coordinated changes shipped as one commit.

- **§100 AppSidebar rewrite.** Full rewrite.
  - Cut the team summary block entirely. Team identity lives
    in the top-bar header; career stats live in the profile
    drawer. The sidebar was duplicating both.
  - Dropped the `summary` variant that used to render on
    `/collection` before Phase 32 deleted the route. Props
    type is now lineup-only.
  - New `ScoreHeadline` component at the top of the post-
    submit sidebar: label row (Live/Final + status text) and
    a big tabular-numerals score number. Collapses what used
    to be two separate blocks (Live Score + StatusChip) into
    one. Status text is computed in-sidebar based on
    `entryStatus` + games-state counts.
  - Post-submit order is now: ScoreHeadline → BoxScoreSection
    → EventFeed. (Was: LiveScore + StatusChip + TeamSummary
    + BoxScore + EventFeed.)
- **§100 Back button on card detail.** Local `DetailSidebar`
  component in LineupView wraps `CardDetailPanel` with a
  Back button row above. Ghost-variant button, `<ArrowLeft />
  Back`, `-ml-2` offset so it aligns flush with the panel's
  left edge. `onClose` strips `?card` from the URL; the
  sidebar swap effect handles the rest.
- **§101 Subtle auto-fading scrollbars.**
  - Global CSS on `[data-scroll]` containers: scrollbar
    hidden by default via `scrollbar-color: transparent` +
    `::-webkit-scrollbar-thumb { background: transparent }`.
  - On `[data-scrolling="true"]`, thumb becomes
    `color-mix(in oklab, var(--text-3) 55%, transparent)`.
    300ms transition on both layers so the bar glides rather
    than pops.
  - `useScrollFade` hook (new, in `src/components/lineup/`)
    listens for document scroll events in the capture phase,
    flips the attribute, and clears it ~700ms after the last
    tick via a per-element WeakMap timer. Called in LineupView
    next to `useAutoScrollOnDrag`.

Team-summary helper (`src/lib/profile/team-summary.ts`) was
deleted; its caller chain (LineupViewProps →
`LineupPage.fetch` → helper) was pruned top-down.

## Consequences

**What got better:**

- Sidebar visual hierarchy. The most important post-submit
  signal (score + status) sits at the top, single line, huge
  number. Team summary's deletion freed ~100px of vertical
  space, so BoxScore + EventFeed got more real estate.
- Card detail has an obvious dismiss affordance. Users don't
  have to guess or remember the URL trick.
- Scrollbars match macOS native overlay behavior everywhere.
  On a fresh page load, neither column shows a visible track
  or thumb; both appear only when actively scrolling.
- Cleanup as side-effect: one dead file removed
  (`team-summary.ts`) and the sidebar props type shrunk.

**What's still open:**

- Building-state sidebar layout (Readiness / Projected /
  Auto-sub / Submit) wasn't touched. If it feels dense too,
  a follow-up phase can address it separately.
- ScoreHeadline only renders post-submit. Building state
  still uses the separate Readiness + Projected blocks.
- No virtualization on EventFeed or BoxScore. Fine at current
  volumes (≤ 10 cards × ≤ 15 events/game); revisit if contest
  sizes grow.

## Tricky bits

- **Scroll events don't bubble.** Initial instinct was to add
  an event listener on each `[data-scroll]` element via
  React. Capture-phase `document.addEventListener("scroll", ...,
  { capture: true })` catches them centrally and lets us
  gate on `el.hasAttribute("data-scroll")`. One hook, any
  number of scrollers.
- **Per-element timers.** Using a single shared timer would
  mean the left column's scroll resets the sidebar's fade-out
  (or vice-versa). `WeakMap<Element, number>` keeps a timer
  per scroller and garbage-collects automatically if an
  element unmounts.
- **Spec section numbering collision.** Phase 33 code
  references `§99 (Phase 33)` for the independent scroll
  containers. This phase uses `§100` (sidebar redesign +
  Back button) and `§101` (scrollbars) to avoid clobbering
  the existing P33 references. Noted in the spec.

## Alternatives considered

- **Permanent thin scrollbar.** Would've been one CSS rule
  (`scrollbar-width: thin`) and zero JS. Rejected — user
  asked specifically for "fade away shortly after scroll
  action is completed." A static thin bar still adds visual
  noise.
- **Close button in the top-right of the detail panel.** Rejected
  — a Back button at the top-left reads as a navigation
  affordance (where you came from) and matches iOS/Android
  conventions better. Close buttons are for modals; this is
  a sidebar swap.
- **Collapsing the status chip into ScoreHeadline in the
  building state too.** Rejected — ScoreHeadline's structure
  (live-vs-final label + running score) doesn't map to
  building-state semantics. Left it for a dedicated building-
  state pass if needed.

## Links

- Commit: `cc41f544 feat(lineup): P34 sidebar redesign +
  subtle auto-fading scrollbars`
- Polish spec: §100, §101
- Roadmap: `docs/roadmap-phase-34.md`
- Related: ADR-0033 (Phase 32 unified lineup + cards, which
  set up the independent scroll containers this phase styles).
