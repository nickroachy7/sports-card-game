# ADR-0032 — Phase 30 (Unified sidebar + card detail modal) Retrospective

**Status:** Accepted · **Date:** 2026-04-23
**Phase:** Phase 30 (v1.17)
**Companion specs:** `draft-deck-polish-spec.md` §88–§90,
`docs/roadmap-phase-30.md`.

---

## Context

After Phase 29, two sidebar issues remained on the launch path:

1. Building-state sidebar on `/lineup` felt cluttered —
   Readiness + Projected FP + Auto-sub + Submit competing.
2. `/collection` had its own sidebar shape (`CollectionSummaryStats`
   swapping with `SelectedCardSidebar`), inconsistent with `/lineup`.

Separately, card detail used a `SidebarFadeSwap` pattern on both
pages — click a card, the sidebar swapped to show detail. That
pattern couldn't survive the sidebar unification since the sidebar
now has to stay locked to its summary content.

## Decision

- **Unify both pages on a new `<AppSidebar>`** with a
  discriminated `variant` prop (`"lineup"` or `"summary"`).
- **Team summary at top** — team name, vault cards count, career
  FP, vault value total. Computed once per page via
  `getTeamSummary(userId)`; joins vault_entry + card
  (is_vaulted=true) and the active economy_config for quick-sell
  values.
- **Contest header** below team summary on both pages, wrapping
  both building-state and post-submit layouts.
- **Contest state block** at the bottom:
  - Lineup variant → Readiness / Auto-sub / Submit (building) OR
    Live Score / Box Score / Event Feed / Status (post-submit).
  - Summary variant → Read-only Live Score + "View lineup →"
    link, or "No active contest" placeholder.
- **Card detail → `<CardDetailModal>`** — shadcn dialog wrapping
  the existing `<CardDetailPanel>`. URL-driven via `?card={id}`;
  same pattern on both pages. Lineup mounts with `lineupContext`
  (remove-from-slot), collection without.
- **Building state tightened** within AppSidebar — Readiness +
  Projected FP collapsed into one compact block instead of two
  stacked sections.

## What shipped

| Slice | Delivers |
|---|---|
| Plan | Polish spec §88–§90 + roadmap (`061a4321`). |
| P30.1–P30.6 | AppSidebar, team-summary query, CardDetailModal, wired both pages, 4 components deleted (LineupSidebar, SelectedCardSidebar, SidebarFadeSwap, CollectionSummaryStats). |
| P30.7 | ADR-0032. |

Deploy: `draft-deck-gxf14dj69-nickroachy7s-projects.vercel.app` → READY.

## What went well

1. **Discriminated variant keeps one component honest.**
   `AppSidebar` has two prop shapes (lineup-interactive vs
   summary-only), and TypeScript enforces which ones apply via
   the `variant` discriminator. No stringly-typed modes, no
   optional-everything props.
2. **URL-driven modal is the simplest integration.** Both pages
   already used `router.push(?card=id)` for the swap path; the
   modal just reads the same param. Back/forward behavior free.
3. **4 components deleted cleanly.** LineupSidebar /
   SelectedCardSidebar / SidebarFadeSwap / CollectionSummaryStats
   all went in one commit with zero dangling imports — thanks
   to the careful cutover order.
4. **`CardDetailPanel` stayed untouched.** The modal is a thin
   wrapper; the actual detail content + lineup-context-aware
   actions didn't move. Zero risk to the detail logic that's
   been stable since Phase 13.
5. **`getTeamSummary` covers both ceremony-committed +
   midseason-vaulted cards.** Users see accurate vault value +
   count regardless of whether their season has ended yet.

## What surprised us

1. **Collection page needed its own contest snapshot fetch.**
   Originally I thought the team summary would be enough — but
   the user picked "Live Score / Box Score / Event Feed" as
   part of the unified content. Compromise: collection shows
   read-only score + "View lineup →" link instead of the full
   interactive box score. Full parity (live events on
   collection) needs `LiveEventsProvider` hoisted to the
   `(app)/layout.tsx` — future work.
2. **Biome's organize-imports is strict.** Two lint failures
   during the phase, both just import ordering. `pnpm biome
   check --write .` is the habitual fix.
3. **`.next` cache ENOENT on a fresh build.** Clean-cache
   `rm -rf .next && pnpm build` resolved it. Happens sporadically
   when deleting + re-adding routes.

## What we deliberately accepted

1. **Event Feed stays on `/lineup` only.** Including it on
   `/collection` would require hoisting `LiveEventsProvider` +
   fetching slotFills on the collection page. Scoped out.
2. **Modal has less screen real estate than the sidebar swap.**
   Card detail fits; if it ever feels cramped we revisit.
3. **`/collection/[cardId]/page.tsx` deep-link route stays.**
   Redundant with the modal but preserves share-link behavior.
4. **Submit button stays as-is.** User chose "keep + tighten
   spacing" over "remove / auto-submit." Per-slot lock
   semantics still need an explicit transition out of
   `building`.

## What's ready for the next polish pass

- **`<AppSidebar>` discriminated variant** pattern scales —
  any future page (e.g. `/vault`, `/milestones`) can adopt the
  `"summary"` variant with zero drift from the lineup version.
- **`getTeamSummary` + `fetchActiveContestSnapshot`** are
  composable building blocks for any surface that needs
  user-contextual data without a full page fetch.
- **URL-driven modals** work cleanly with Next.js App Router's
  `useSearchParams`. Good pattern for future detail overlays.

## Open items

1. **Phase 31 — baserunners + pitcher-on-mound** (spec'd, ready
   to build).
2. **Event Feed on collection page** — requires
   LiveEventsProvider hoisting.
3. **Onboarding flow pass** — still parked per user direction.
4. **Empty / error state sweep** — parked.
5. **Baserunner names (hover tooltip)** — P31 follow-up.
6. **Standard parked items.**

## Estimate vs reality

Estimate: ~3 days. Shipped in ~1.5 hours of code + spec/ADR
time. Most of the lift was the cutover (4 files deleted + 2
pages rewired). Thanks to the pre-existing `CardDetailPanel`,
the modal was 60 lines.

## Consequences

- Both pages now render the same sidebar component with the
  same top-block content. Navigating lineup ↔ collection reads
  as one app, not two separate surfaces.
- Card detail is a centered modal overlay; closing via outside
  click / Escape / X / URL manipulation all work.
- The sidebar is feature-complete for v1: team identity +
  contest context + interactive/summary lineup state.
- The launch path now has one item left — baserunners (P31).

## Related ADRs

- ADR-0031 — Phase 29. Shipped ProfileDrawer + settings pages.
  P30's AppSidebar complements the drawer (identity in
  sidebar, deeper editing in drawer).
- ADR-0028 — Phase 23. Lineup layout polish + ContestHeaderCard.
  P30 absorbed the ContestHeaderCard concept into AppSidebar.
