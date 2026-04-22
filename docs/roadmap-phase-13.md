# Draft Deck — Phase 13 Roadmap (Feel Pass v1.7 — Unified Sidebar + Player Photos)

**Goal:** Make the right sidebar the canonical "context" surface
across the app. Remove the ZoomCanvas friction layer. Activate
the long-scaffolded player-photo pipeline.

**Estimated effort:** 3–4 days.

**Prerequisites:**

- Phase 12 shipped — `<LiveEventsProvider>` owns the lineup
  page's Realtime subscription; `<LineupSidebar>` is already
  the canonical sidebar layout to mirror.
- `player.mlbam_id`, `player.photo_url`, `player.photo_synced_at`
  columns already exist on `public.player` (since Phase 1).
- `CardDetailDrawer` is the current card-detail surface and
  already has the full action set (Extend, Quick Sell, Apply
  Token, Vault) wired.
- Stubbed `bdl-photo-sync` cron endpoint at
  `/api/cron/bdl-photo-sync/route.ts` — we'll replace it with
  `mlbam-id-backfill`.

---

## Milestones

| ID    | Milestone                                        | Target   | Outcome |
|-------|--------------------------------------------------|----------|---------|
| P13.1 | Remove ZoomCanvas, re-fit diamond                | 0.5 day  | `<LineupShell>` renders the diamond directly in a flex container. Grid columns relaxed to fit narrower viewports. ZoomCanvas file deleted. |
| P13.2 | Extract `<CardDetailPanel>` + `<SelectedCardSidebar>` | 0.5 day  | Drawer content becomes a pure panel. Wrapper adds Back button + handles close callback. Existing action handlers preserved 1:1. |
| P13.3 | Lineup page — swap sidebar on card select        | 0.5 day  | `selectedCardId` lifted into `<LineupView>`; sidebar conditionally renders `<SelectedCardSidebar>` when set. Drawer removed. |
| P13.4 | Collection page sidebar + summary stats          | 1 day    | New `<CollectionShell>` mirrors `<LineupShell>` layout. `<CollectionSidebar>` renders `<CollectionSummaryStats>` by default, swaps to `<SelectedCardSidebar>` on select. Filters + count stay above the grid. |
| P13.5 | Player photos — MLBAM backfill + render          | 1 day    | `/api/cron/mlbam-id-backfill` hits MLB Stats API, populates `player.mlbam_id`. `<Card>` renders MLBAM CDN URL with silhouette fallback. Runbook documents the manual run. |
| P13.6 | ADR-0018 retro                                   | 0.25 day | What shipped + surprises + open items. |

---

## P13.1 — Remove ZoomCanvas (Day 1)

### T13.1.1 Drop ZoomCanvas usage

- **What:** `src/components/lineup/LineupShell.tsx` renders the
  `diamond` prop directly inside the left pane:
  ```tsx
  <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
    {diamond}
  </div>
  ```
  Removes the `<ZoomCanvas>` import + wrapper.
- **Acceptance:**
  - No ZoomCanvas controls visible on `/lineup`.
  - Diamond renders centered + scrollable on narrow viewports.
  - Existing drag/drop, glow, slot-click all work.

### T13.1.2 Relax DiamondGrid column min

- **What:** `src/components/lineup/DiamondGrid.tsx` — change
  `gridTemplateColumns: "repeat(5, minmax(96px, 1fr))"` to
  `"repeat(5, minmax(80px, 1fr))"`. Verify slot card scales
  inside the column cell.
- **Acceptance:**
  - 1440px viewport: diamond renders at natural size.
  - 1040px viewport: slots compress slightly; no scroll.
  - 900px viewport: horizontal scroll on left pane.

### T13.1.3 Delete ZoomCanvas.tsx if unreferenced

- **What:** Grep for `ZoomCanvas` imports. If zero references
  remain, delete `src/components/lineup/ZoomCanvas.tsx`.
  Otherwise leave it with a header comment marking it
  unused + removable.
- **Acceptance:** `pnpm typecheck` + `pnpm lint` clean.

---

## P13.2 — Extract CardDetailPanel (Day 1)

### T13.2.1 Split drawer contents into pure panel

- **What:** `src/components/card/CardDetailPanel.tsx` — pure
  component taking the same props `CardDetailDrawer` does
  (card, lineupContext, onClose) but WITHOUT the drawer
  chrome (`<Sheet>` / `<SheetContent>` / etc. if using
  shadcn's drawer primitive). Content matches spec §5.1.2 —
  photo at top, tier frame, name/position, career FP,
  contract bar, action buttons stacked.
- **Acceptance:**
  - Panel renders flush in a 288px column.
  - All four actions (Extend, Quick Sell, Apply Token, Vault)
    fire their existing callbacks unchanged.
  - No drawer-specific CSS leaks (no fixed positioning,
    no backdrop).

### T13.2.2 `<SelectedCardSidebar>` wrapper

- **What:** `src/components/card/SelectedCardSidebar.tsx` —
  renders:
  1. A top row with a Back button (`←` icon + "Back" label,
     using an existing shadcn `Button` variant = ghost).
  2. `<CardDetailPanel>` underneath.
- **Acceptance:**
  - Back button calls `onBack()` prop.
  - Visual row matches `<SidebarSection>` title spacing (no
    extra padding around the Back row).

### T13.2.3 Deprecate `CardDetailDrawer`

- **What:** Either delete `CardDetailDrawer.tsx` or reduce it
  to a thin wrapper that composes `<Sheet>` +
  `<CardDetailPanel>` for any lingering drawer callers. If
  nothing imports it after P13.3 + P13.4 lands, delete.
- **Acceptance:** Decision recorded in the ADR.

---

## P13.3 — Lineup page swap (Day 2)

### T13.3.1 Lift selectedCardId state

- **What:** `src/app/(app)/lineup/lineup-view.tsx` — add
  `const [selectedCardId, setSelectedCardId] = useState<string | null>(null)`.
  Pass `setSelectedCardId` down to `DiamondGrid` + `BenchDrawer`
  as `onOpenDetail`. Replace the current drawer-open state
  (`detailCardId` remains but maps 1:1 to `selectedCardId` —
  consolidate to one name).
- **Acceptance:** Single source of truth for selection;
  callbacks wired.

### T13.3.2 Sidebar render-tree conditional

- **What:** `<LineupSidebar>` stays as-is. `LineupView` wraps:
  ```tsx
  sidebar={
    selectedCardId ? (
      <SelectedCardSidebar
        card={cardsById.get(selectedCardId) ?? null}
        lineupContext={{ ... }}
        onBack={() => setSelectedCardId(null)}
      />
    ) : (
      <LineupSidebar ... />
    )
  }
  ```
- **Acceptance:**
  - Click any card → sidebar flips to detail.
  - Back → restores building or post-submit sidebar per
    entry status.
  - LiveEventsProvider remains mounted during detail
    browsing (it wraps the whole shell; the sidebar
    content switch doesn't unmount it).

### T13.3.3 Remove CardDetailDrawer from LineupView

- **What:** Delete the `<CardDetailDrawer>` render + its
  state/callback plumbing from `lineup-view.tsx`.
- **Acceptance:**
  - No drawer appears on card click.
  - No regression in Vault-from-detail, Extend-from-detail
    flows.
  - Removed-from-slot flow: currently a drawer action; now
    handled via the same `onRemoveFromSlot` callback routed
    through `SelectedCardSidebar`'s panel.

---

## P13.4 — Collection page sidebar (Day 2–3)

### T13.4.1 `<CollectionShell>` layout

- **What:** `src/components/collection/CollectionShell.tsx` —
  mirrors `<LineupShell>`'s structure:
  ```tsx
  <div className="flex h-full flex-col">
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        {main}
      </div>
      <aside className="hidden w-72 shrink-0 flex-col gap-5 border-l border-[var(--border)] bg-[var(--surface)] p-4 md:flex">
        {sidebar}
      </aside>
    </div>
  </div>
  ```
- **Acceptance:**
  - Matches the lineup sidebar aesthetic (w-72, bg-surface,
    border-l, gap-5 p-4).
  - Below `md` breakpoint the sidebar hides (matches
    lineup).

### T13.4.2 `<CollectionSummaryStats>` component

- **What:** `src/components/collection/CollectionSummaryStats.tsx`
  — three `<SidebarSection>` blocks:
  1. **Overview:** Total cards · Career FP total · Active
     contract cards (card where `is_expired = false`).
  2. **Tier breakdown:** Diamond / Gold / Silver / Bronze
     counts with colored swatches.
  3. **Contracts:** Expiring soon (≤3 plays left), oldest
     card, newest card.
- **Acceptance:**
  - Data derived from the cards already loaded on the page
    (no new query).
  - Matches `<SidebarStat>` + `<SidebarSection>` styling.

### T13.4.3 Collection page wiring

- **What:** `src/app/(app)/collection/page.tsx` +
  `collection-grid.tsx`:
  - Page lifts `selectedCardId` to its top-level client
    component.
  - Wraps content in `<CollectionShell>`.
  - Default sidebar: `<CollectionSummaryStats>`.
  - On-select sidebar: `<SelectedCardSidebar>`.
  - Filters + count remain above the grid — existing
    layout, verify by eye.
- **Acceptance:**
  - Default state shows stats.
  - Click a card → sidebar swaps to detail.
  - Back → returns to stats.
  - Filter changes still re-filter the grid without
    affecting sidebar state.

---

## P13.5 — Player photos (Day 3–4)

### T13.5.1 MLBAM id backfill endpoint

- **What:** `src/app/api/cron/mlbam-id-backfill/route.ts`.
  CRON_SECRET-gated. Iterates `player` rows with
  `mlbam_id IS NULL` + `is_active_40_man = true` (scope:
  active players only). For each:
  1. Query `https://statsapi.mlb.com/api/v1/people/search?names={URL-encoded full name}`.
  2. Parse response (JSON). Disambiguate by:
     - Exact first + last match;
     - Team abbreviation match (via `team.abbreviation`
       lookup against `player.team_id` → team row);
     - Prefer active MLB players.
  3. On match, `UPDATE public.player SET mlbam_id = $1
     WHERE id = $2`.
  4. Sleep ~200ms between calls.
- **Acceptance:**
  - Running the endpoint backfills ≥ 95% of active players.
  - Endpoint returns `{ matched: N, ambiguous: N, unmatched: N }`.
  - Safe to re-run (idempotent — only touches rows with
    `mlbam_id IS NULL`).
  - CRON_SECRET required; 401 without it.

### T13.5.2 Render photos in `<Card>`

- **What:** `src/components/card/Card.tsx` — accept a new
  `playerMlbamId?: number` prop (wired via `LineupCardVM` +
  collection card types). If set, render an `<img>` with
  `src={mlbamHeadshotUrl(id)}` + `onError` swap to the
  existing silhouette fallback. Photo area is a circular
  64px avatar on small cards, 96px on medium, 128px on
  large — positioned above the player name.
- **Helper:** `src/lib/mlb/mlbam-headshot.ts` — exports
  `mlbamHeadshotUrl(mlbamId: number): string`. Single
  source of truth for the URL pattern.
- **Acceptance:**
  - Test account's lineup shows real photos for all 10
    starters.
  - Image 404 → silhouette without layout shift.
  - No new requests fired for players without `mlbam_id`.

### T13.5.3 Thread `mlbam_id` into view models

- **What:** Update the server-side card queries (in
  `src/app/actions/` and any Server Component data
  fetchers) to select `player.mlbam_id` alongside the
  existing fields. Add `playerMlbamId` to `LineupCardVM` +
  collection card types.
- **Acceptance:** TypeScript compiles; the new field flows
  from DB → view model → `<Card>`.

### T13.5.4 Runbook entry

- **What:** `docs/runbook.md` gains a "Player photos" section
  under "BallDontLie integration":
  ```
  # Backfill MLBAM ids (one-time, then re-run after roster sync)
  curl -s -H "Authorization: Bearer $CRON_SECRET" \
    https://draftdeck.com/api/cron/mlbam-id-backfill | jq
  ```
- **Acceptance:** Runbook entry exists + is accurate.

---

## P13.6 — ADR-0018 retro (Day 4)

### T13.6.1 `docs/adr/ADR-0018_phase-13-retro.md`

Following the ADR-0016 / ADR-0017 template:
- Context (why each item).
- Decision (shared shell, sidebar swap pattern, MLB Stats
  API as join source).
- What shipped (commits per slice).
- What went well / surprised us / deliberately simplified.
- Open items (photo cron schedule, Supabase Storage upload,
  cross-fade animation).
- Estimate vs reality.

---

## Dependencies between tasks

```
P13.1 (ZoomCanvas) ──► independent
P13.2 (CardDetailPanel) ──► P13.3 (Lineup swap)
                        ──► P13.4 (Collection sidebar)
P13.5 (Photos) ──► independent (can run parallel)
                                                    │
                                                    ▼
                                              P13.6 (ADR)
```

P13.1 and P13.5 are fully independent — either can ship
first. P13.2 blocks P13.3 + P13.4. P13.6 closes.

---

## What's NOT in Phase 13 (scope guard)

Per spec §27:

- Onboarding pass / empty-error sweep / a11y / tier foil /
  dupe picker / mobile / sound / haptics / artwork.
- Rank display on status chip.
- Webhook retry observability dashboard.
- CI integration for fixture suite.
- Per-slot contract-depletion animation.
- Sound cue on positive-FP events.
- Scheduled photo sync cron (manual admin only this phase).
- Photo upload to Supabase Storage.
- Cross-fade animation on the sidebar swap.
