# Draft Deck — Phase 32 Roadmap (v1.19 — Unified lineup + collection)

**Goal:** Kill `/collection`. Replace the bench carousel with
a responsive grid of all cards below the lineup. Tokens move
above the cards grid. Auto-scroll the page during drag so
cards below the fold can still be dragged onto lineup slots.

**Estimated effort:** ~1.5 days.

**Prerequisites:**

- Phase 30's `AppSidebar` + `CardDetailModal` — the modal now
  opens on `/lineup?card={id}`; survives collection deletion.
- Phase 22's `BenchDrawer` with its filter + sort logic — we
  refactor it heavily rather than replacing.

---

## Milestones

| ID    | Milestone                                      | Target    | Outcome |
|-------|------------------------------------------------|-----------|---------|
| P32.1 | Refactor BenchDrawer → CardsPanel             | 0.50 day  | Responsive grid, all cards, "IN LINEUP" marker, Tier filter. |
| P32.2 | LineupShell section reorder                    | 0.05 day  | `grid` → `tokens` → `cards`. |
| P32.3 | Auto-scroll-during-drag hook                   | 0.30 day  | `useAutoScrollOnDrag` hook wired at DndProvider. |
| P32.4 | Delete /collection files + sidebar nav         | 0.15 day  | 3 files deleted, nav item removed, zero dangling refs. |
| P32.5 | Typecheck / lint / build / deploy              | 0.10 day  | Green checks, production deploy. |
| P32.6 | ADR-0033 retro                                 | 0.10 day  | Standard retrospective. |

---

## P32.1 — BenchDrawer → CardsPanel

### T32.1.1 Rename + restructure

Rename `src/components/lineup/BenchDrawer.tsx` →
`src/components/lineup/CardsPanel.tsx`. Reshape:

```tsx
<section className="flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
  <header>...label + filters + counter...</header>
  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
    {filtered.map(card => <CardGridItem ... />)}
  </div>
</section>
```

- Drop `<HorizontalScroller>` usage.
- `CardGridItem` is a lightweight wrapper around `<BenchCard>`
  that adds the "IN LINEUP" overlay when `assignedCardIds.has(card.id)`.
- Height becomes natural (grows with row count); main scroll
  container handles overflow.

### T32.1.2 Show all cards (not just unused)

Remove the `.filter(c => !assignedCardIds.has(c.id))` from
the filtered list. Assigned cards still render in the grid
with a visual marker.

- "IN LINEUP" badge: small pill overlay on the card (top-left
  or -right corner).
- Muted opacity on assigned cards (~60% or similar) so the
  available cards pop.
- Drag-from-slot stays enabled; dragging an assigned card in
  the grid triggers the same swap behavior as dragging from
  a lineup slot (per-slot `fromPosition` tracking).

### T32.1.3 Tier filter chips

Add a fourth chip row (after game-state chips) or inline with
existing filters:

```tsx
<FilterChip label="All" active={tier === "all"} count={counts.all} />
<FilterChip label="Bronze" tone="bronze" count={counts.bronze} ... />
<FilterChip label="Silver" tone="silver" count={counts.silver} ... />
<FilterChip label="Gold"   tone="gold"   count={counts.gold} ... />
<FilterChip label="Diamond" tone="diamond" count={counts.diamond} ... />
```

Tier tones match `TIER_FRAME` colors. Counts respect other
active filters (same pattern as game-state counts).

### T32.1.4 Header counter + label

Section title: `"Cards"` (was `"Bench"`). Counter:
`"X cards · Y in lineup"` with `Y` being the assigned count.

Drop the "locked" badge (Phase 18 left it as a per-contest
state hint; now we just show all cards unconditionally).

---

## P32.2 — LineupShell section reorder

`src/components/lineup/LineupShell.tsx`:

```tsx
- <div className="shrink-0">
-   {bench}
-   {tokens}
- </div>
+ <div className="shrink-0">
+   {tokens}
+   {cards}
+ </div>
```

Rename the `bench` prop to `cards` (both in the type and the
callsite). Update `lineup-view.tsx` to pass the `CardsPanel`
render as the `cards` prop.

---

## P32.3 — Auto-scroll during drag

### T32.3.1 Hook design

`src/components/lineup/use-autoscroll-on-drag.ts`:

```ts
export function useAutoScrollOnDrag() {
  useEffect(() => {
    const EDGE_ZONE = 80;  // px from viewport edge that triggers scroll
    const SCROLL_SPEED = 12;  // px per frame
    let rafId: number | null = null;
    let currentDirection: "up" | "down" | null = null;

    function findScrollContainer(): HTMLElement | null {
      // The <main> in app/(app)/layout.tsx with overflow-auto.
      return document.querySelector("main[class*='overflow-auto']");
    }

    function onDragOver(e: DragEvent) {
      const y = e.clientY;
      const vh = window.innerHeight;
      let direction: "up" | "down" | null = null;
      if (y < EDGE_ZONE) direction = "up";
      else if (y > vh - EDGE_ZONE) direction = "down";
      currentDirection = direction;
      if (direction && rafId === null) startScroll();
    }

    function onDragEnd() {
      currentDirection = null;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function startScroll() {
      const container = findScrollContainer();
      if (!container) return;
      const tick = () => {
        if (currentDirection === "up") container.scrollBy(0, -SCROLL_SPEED);
        else if (currentDirection === "down") container.scrollBy(0, SCROLL_SPEED);
        if (currentDirection !== null) {
          rafId = requestAnimationFrame(tick);
        } else {
          rafId = null;
        }
      };
      rafId = requestAnimationFrame(tick);
    }

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragend", onDragEnd);
    document.addEventListener("drop", onDragEnd);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragend", onDragEnd);
      document.removeEventListener("drop", onDragEnd);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);
}
```

### T32.3.2 Wire into LineupView

Call `useAutoScrollOnDrag()` inside `LineupView` at the
top-level (below `useRouter` etc.). Hook is a no-op server-
side (`useEffect` gate).

---

## P32.4 — Delete `/collection`

### T32.4.1 Delete files

```
git rm src/app/(app)/collection/page.tsx
git rm src/app/(app)/collection/collection-grid.tsx
git rm src/app/(app)/collection/[cardId]/page.tsx
```

### T32.4.2 Remove sidebar nav item

`src/components/layout/sidebar.tsx`:

Remove the Collection nav link. Card detail is accessible via
clicks inside `/lineup`; there's no second home.

### T32.4.3 Grep for stale references

```
rg -l "/collection" src/
```

Expected false positives: none. Any real reference gets
cleaned up.

---

## P32.5 — Verify + deploy

- `pnpm format / lint / typecheck / build` clean.
- Manual QA:
  - Navigate `/lineup`, see rows of cards.
  - Drag a card from row 3 toward the top → page auto-scrolls.
  - Click a card in row 5 → modal opens.
  - Tier filter counts update with other filters.
  - `/collection` returns 404.
- `vercel --prod --yes`.

---

## P32.6 — ADR-0033

Standard retro.

---

## Dependencies

```
P32.1 (CardsPanel refactor) ──► P32.2 (LineupShell reorder)
P32.2 ──► P32.3 (autoscroll) ──► P32.4 (delete collection)
                                       │
                                       ▼
                                 P32.5 (verify + deploy)
                                       │
                                       ▼
                                 P32.6 (ADR-0033)
```

Single-commit phase feasible since all pieces are tightly
coupled, but cleaner as two commits: the big refactor + the
/collection deletion.
