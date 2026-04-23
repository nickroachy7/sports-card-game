# Draft Deck — Phase 30 Roadmap (v1.17 — Unified sidebar + card detail modal)

**Goal:** Unify the sidebar across `/lineup` and `/collection`
with a shared summary panel (team stats → contest header → live
contest state). Move card detail to a modal overlay. Tighten the
building-state sidebar rhythm.

**Estimated effort:** ~3 days.

**Prerequisites:**

- Phase 29's `ProfileDrawer` + `/settings/*` pages.
- Existing `LineupSidebar`, `CollectionSummaryStats`,
  `SelectedCardSidebar` components (to be replaced).
- Existing shadcn `dialog` primitive for the modal.

---

## Milestones

| ID    | Milestone                                  | Target    | Outcome |
|-------|--------------------------------------------|-----------|---------|
| P30.1 | Team summary block + aggregate query       | 0.30 day  | `getTeamSummary(userId)` returns team stats; renders in new top section. |
| P30.2 | AppSidebar component                       | 0.60 day  | Unified sidebar; replaces `LineupSidebar` on lineup page. |
| P30.3 | Wire AppSidebar into `/collection`         | 0.25 day  | Collection page uses `AppSidebar` + `CollectionShell` updated. |
| P30.4 | CardDetailModal + swap replacement          | 0.80 day  | New modal; removes `SidebarFadeSwap` + `SelectedCardSidebar` usage. |
| P30.5 | Building-state spacing tighten              | 0.25 day  | Reduced padding / line-height on building sections. |
| P30.6 | Deprecate old components                   | 0.15 day  | Remove `LineupSidebar` after migration, archive `CollectionSummaryStats`. |
| P30.7 | Verify + deploy + ADR-0032                 | 0.20 day  | Typecheck/lint/build, deploy, retro. |

---

## P30.1 — Team summary block

### T30.1.1 Aggregate query

New server helper `src/lib/profile/team-summary.ts`:
```ts
export async function getTeamSummary(userId: string): Promise<{
  teamName: string;
  totalCareerFp: number;
  vaultedCardsCount: number;
  vaultValueTotal: number;
}> {
  // Joins:
  //   profile.team_name
  //   manager_account.lifetime_fp
  //   COUNT(*) FROM vault_entry WHERE user_id
  //   SUM(quick_sell value[final_tier]) FROM vault_entry WHERE user_id
  //     — value pulled from get_active_economy_config().quick_sell_values
}
```

Quick-sell values are stored as JSONB (`{bronze: 25, silver: 100, gold: 500, diamond: 2000}` roughly); join the config once per query.

### T30.1.2 Expose to the sidebar

Call from `(app)/layout.tsx` alongside the existing profile fetch. Pass into `<AppSidebar>` as props.

---

## P30.2 — AppSidebar component

### T30.2.1 Scaffolding

New file `src/components/layout/AppSidebar.tsx`. Client component (needs real-time subscriptions via `LiveEventsProvider`). Sections:

1. `<TeamSummaryBlock teamName vaultValueTotal totalCareerFp vaultedCardsCount />`
2. `<ContestHeaderCard contestName entryStatus lockCountdown />` (reuse existing from LineupSidebar)
3. Conditional content block:
   - Building state: `<ReadinessBlock filledCount warnings />` + `<SubmitButton />`
   - Post-submit: `<LiveScoreBlock />` + `<BoxScoreSection />` + `<EventFeed />` + `<StatusChip />` (reuse from LineupSidebar)

### T30.2.2 Props

```ts
type Props = {
  // Team summary (from P30.1)
  teamName: string;
  vaultValueTotal: number;
  totalCareerFp: number;
  vaultedCardsCount: number;
  // Active contest context (from lineup page.tsx)
  contestName: string | null;
  entryStatus: EntryStatus | null;
  lockCountdown: string | null;
  // Lineup-specific props only when on the lineup page (null otherwise)
  slotFills: Record<LineupPosition, SlotFill> | null;
  liveScore: number | null;
  finalScore: number | null;
  contestGameIds: string[] | null;
  autoSubMode: AutoSubMode | null;
  onAutoSubModeChange: ((mode: AutoSubMode) => void) | null;
  canSubmit: boolean | null;
  submitting: boolean | null;
  locked: boolean | null;
  onSubmit: (() => void) | null;
};
```

On the collection page, the "lineup-specific" props are `null` and the contest-state block renders a placeholder or the read-only box score (if the user has a submitted lineup today).

### T30.2.3 Hoist LiveEventsProvider

The lineup page wraps shell in `<LiveEventsProvider>`. To show Event Feed on Collection too, `LiveEventsProvider` needs to wrap at the `(app)/layout.tsx` level when a user has a submitted contest today. Move the provider up; make it cheap to mount (no-op when no contest).

---

## P30.3 — Wire into `/collection`

### T30.3.1 Update CollectionShell

Current shell has its own sidebar swap. Replace with `<AppSidebar>` passed down from `/collection/page.tsx`.

### T30.3.2 Pass contest context

Collection page fetches the user's current contest entry (if any) via same query pattern as lineup page. Passes contest name + entry status + slot fills to `<AppSidebar>`.

If user has no contest entry today, contest-state block shows "No active contest today."

---

## P30.4 — CardDetailModal

### T30.4.1 Component scaffolding

New `src/components/card/CardDetailModal.tsx`. Client component using shadcn `dialog`. Takes `cardId: string | null`. Open when id is non-null.

### T30.4.2 URL param sync

Same pattern as the old detail-sidebar:
```ts
const searchParams = useSearchParams();
const detailCardId = searchParams.get("card");
```

Clicking a card calls `router.push(?card=${id})`. Closing removes the param.

### T30.4.3 Context-specific actions

Modal receives a `context` prop indicating where the card was clicked from (lineup slot / lineup bench / collection). Renders appropriate action buttons:
- Lineup slot → "Remove from slot", "Apply token" / "Remove token"
- Lineup bench → "Add to slot", "Apply token" / "Remove token"
- Collection → "Quick-sell", "Vault (midseason)" if eligible

All actions reuse existing server actions (`updateLineupSlot`, `applyToken`, `removeToken`, `quickSell`, `vaultCardMidseason`).

### T30.4.4 Replace SidebarFadeSwap

Remove the swap-based detail sidebar from `LineupShell` and `CollectionShell`. All card-click handlers now update URL → modal opens. `SelectedCardSidebar` can be deleted (or kept as a reference during migration, removed in P30.6).

---

## P30.5 — Building-state tighten

### T30.5.1 Audit current spacing

`BuildingSidebar` currently has 4-5 stacked `SidebarSection`s with default padding. Collapse vertical rhythm:
- Reduce `SidebarSection` internal padding from `py-3` → `py-2`
- Tighten `gap-5` on sidebar root → `gap-3`
- Merge Readiness + warnings into one section (warnings inline under the counter)

### T30.5.2 Submit button location

Keep Submit in the sidebar, but position at the bottom with `mt-auto` + less prominence until the lineup is complete. Once filled: button highlights + label shifts to "Submit lineup."

---

## P30.6 — Deprecate old components

- Delete `src/components/lineup/LineupSidebar.tsx` (replaced by `AppSidebar`).
- Delete `src/components/layout/SidebarFadeSwap.tsx` (no longer used).
- Delete `src/components/card/SelectedCardSidebar.tsx` (replaced by modal).
- Delete `src/components/collection/CollectionSummaryStats.tsx` if absorbed into team summary.

Only delete after all callers are updated.

---

## P30.7 — Verify + deploy + ADR

- `pnpm typecheck / lint / build` clean.
- Manual QA:
  - Navigate lineup ↔ collection, confirm sidebar stays consistent.
  - Click a card on each page, confirm modal opens with correct actions.
  - URL param survives refresh.
  - Building-state reads tighter.
- `vercel --prod --yes`.
- ADR-0032 retro.

---

## Dependencies

```
P30.1 (team summary query) ──► P30.2 (AppSidebar)
P30.2 (AppSidebar) ──► P30.3 (wire into collection)
P30.4 (card modal) ──► independent from P30.2 but both touch callers
P30.5 (tighten spacing) ──► P30.2 (reshape inside AppSidebar)
P30.6 (deprecate) ──► after all of above
                         │
                         ▼
                    P30.7 (verify + deploy + ADR)
```

All slices land across ~2 commits (refactor + polish).
